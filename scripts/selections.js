// Evidence-based classification of WG selections (docs/UNRESOLVED_CHOICES.md).
// Pure: no Foundry globals. Every verdict cites what the export itself states:
//   - the select operation that reads the key (from character.details.* and content.feats_features operations),
//   - the chosen option inside that operation,
//   - WG's own computed state in content.raw_data_dump.variables (*_IDS lists).
// Key shapes follow WG (and AMBA's wgSelectionKey, src/shared/wanderersGuideExport/wgFriendly/buildSelections.ts):
//   `${scope}_${selectOpId}` with scope = ancestry | background | class | class-feature-<id> | ancestry-section-<id>,
//   an optional `-N` index for repeated picks, and nested keys `${parentKey}_${parentValue}[_...]`.
// Nothing here guesses: a key with no evidence keeps status "unresolved".

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map select-op id -> { op, owner } for every select operation the export carries. */
export function selectOpIndex(exp) {
  const index = new Map();
  const walk = (owner, ops, depth = 0) => {
    if (!Array.isArray(ops) || depth > 8) return;
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      if (op.type === "select" && typeof op.id === "string") index.set(op.id, { op, owner });
      for (const opt of op.data?.optionsPredefined ?? []) {
        walk(owner, opt?.operations, depth + 1);
        if (opt?.operation) walk(owner, [opt.operation], depth + 1);
      }
      walk(owner, op.data?.trueOperations, depth + 1);
      walk(owner, op.data?.falseOperations, depth + 1);
      walk(owner, op.data?.operations, depth + 1);
    }
  };
  const d = exp?.character?.details ?? {};
  for (const k of ["ancestry", "background", "class"]) walk(d[k]?.name ?? k, d[k]?.operations);
  for (const f of Object.values(exp?.content?.feats_features ?? {}).flat()) if (f && typeof f === "object") walk(f.name, f.operations);
  return index;
}

/** WG's computed id lists (FEAT_IDS, LANGUAGE_IDS, HERITAGE_IDS, ...) with their parallel *_NAMES. */
export function wgComputedIds(exp) {
  const v = exp?.content?.raw_data_dump?.variables;
  if (!v || typeof v !== "object") return null;
  const lists = new Map();
  for (const [k, x] of Object.entries(v)) {
    if (!/_IDS$/.test(k) || !Array.isArray(x?.value)) continue;
    const names = v[k.replace(/_IDS$/, "_NAMES")]?.value ?? [];
    lists.set(k, new Map(x.value.map((id, i) => [String(id), names[i] ?? null])));
  }
  return lists;
}

/** The last key segment names the select operation that reads the key (index suffix -N removed). */
export function parseSelectionKey(key) {
  const m = key.match(/^(class-feature-\d+|ancestry-section-\d+|[a-z-]+?)_(.+)$/);
  if (!m) return null;
  const tokens = m[2].split("_");
  const last = tokens[tokens.length - 1];
  const im = last.match(/^(.*?)(?:-(\d+))?$/);
  const reader = UUID.test(last) ? last : UUID.test(im[1]) ? im[1] : last;
  return { scope: m[1], tokens, reader, nested: tokens.length > 1 };
}

const titleCase = (s) => String(s ?? "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * Classify one selection. Returns { status, reason, category, answer? } or null (no evidence; caller keeps unresolved).
 *   answer: { owner, name } for a ChoiceSet the importer can answer from WG's explicit pick.
 */
export function classifySelection(key, value, { ops, ids, byId }) {
  const parsed = parseSelectionKey(key);
  if (!parsed) return null;
  const v = String(value);
  const reader = ops.get(parsed.reader);
  const inIds = (val) => { for (const [list, m] of ids ?? []) if (m.has(val)) return { list, name: m.get(val) }; return null; };
  if (reader) {
    const { op, owner } = reader;
    const opt = (op.data?.optionsPredefined ?? []).find((o) => o?.id === v || o?.operation?.id === v);
    if (opt) {
      const inner = opt.operation ?? null;
      const variable = inner?.type === "adjValue" ? inner.data?.variable : null;
      if (variable?.startsWith("ATTRIBUTE_")) return { status: "included", category: "attribute-option", reason: `${owner}: "${op.data?.title ?? "select"}" option ${v} is adjValue ${variable}; final modifiers forced from content.attributes` };
      if (variable?.startsWith("SKILL_")) return { status: "dropped", category: "skill-option", reason: `${owner}: option ${v} is adjValue ${variable}; skills are not imported (PF2e derives them from its own choices)` };
      if (inner?.type === "giveAbilityBlock" && inner.data?.abilityBlockId != null) {
        const id = String(inner.data.abilityBlockId);
        const name = byId.get(id)?.name ?? (inIds(id)?.name ? titleCase(inIds(id).name) : null);
        if (name) return { status: "unresolved", category: "choice-answer", reason: `${owner}: WG chose ${name} (ability block ${id}); not consumed by a PF2e ChoiceSet`, answer: { owner, name } };
      }
      if (opt.title) return { status: "unresolved", category: "choice-answer", reason: `${owner}: WG chose ${opt.title}; not consumed by a PF2e ChoiceSet`, answer: { owner, name: opt.title } };
      return null;
    }
    return null;
  }
  // No select operation in the export reads this key.
  if (!ids) return null;
  const hit = inIds(v);
  if (hit?.list === "LANGUAGE_IDS" && !parsed.nested && parsed.scope === "ancestry") {
    return { status: "included", category: "language", reason: `ancestry language pick ${v} = ${hit.name} (WG LANGUAGE_IDS); imported via content.languages` };
  }
  if (!hit && parsed.nested) {
    return { status: "dropped", category: "inactive-nested", reason: `inactive nested selection: no select operation in the export reads "${parsed.reader}", and WG's computed state (raw_data_dump *_IDS) does not contain ${v}` };
  }
  return null;
}

/** Classify every selection key; plus the explicit answers (owner -> names, with keys) the importer may use. */
export function classifySelections(exp) {
  const sel = exp?.character?.operation_data?.selections ?? {};
  const ops = selectOpIndex(exp);
  const ids = wgComputedIds(exp);
  const byId = new Map(Object.values(exp?.content?.feats_features ?? {}).flat().filter((f) => f && typeof f === "object").map((f) => [String(f.id), f]));
  const out = new Map();
  for (const [k, v] of Object.entries(sel)) {
    const c = classifySelection(k, v, { ops, ids, byId });
    if (c) out.set(k, c);
  }
  return out;
}
