import { classifySelections } from "./selections.js";
import { resolveFormula, extraItemIds, containerParents } from "./formulas.js";
import { homebrewSourceIds, isCustomItem } from "./custom-items.js";
// Pure mapping: WG JSON v4 export -> import plan. No Foundry globals here, so it is unit-testable in Node.

export function sluggify(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\((remastered|legacy)\)/gi, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const SKIP_ITEMS = new Set(["fist"]);

// WG sometimes labels a selected class feature as "<canonical option> <role>"
// while PF2e stores the option itself (for example "Redemption Cause" vs
// "Redemption"). These are semantic role suffixes, not a fuzzy name match:
// the stem must resolve to one compendium document of the expected type and,
// when WG supplies one, the PF2e level must also agree.
const SEMANTIC_ROLE_SUFFIXES = [
  "research field", "research-field", "methodology", "bloodline",
  "doctrine", "mystery", "patron", "cause", "muse", "school", "instinct",
  "ikon", "implement", "apparition", "thesis", "curriculum", "order",
];

// Evidence-backed WG -> PF2e names. These are deliberately exact aliases: they
// are not fuzzy matching and they never select a first/closest candidate.
// Keep this table small and reviewable; ambiguous or unsupported entries stay
// unresolved instead of becoming homebrew.
export const WG_CANONICAL_ALIASES = [
  ["feat", "Animal Companion (Druid)", "Animal Companion"],
  ["feat", "Animal Empathy (Druid)", "Animal Empathy"],
  ["feat", "Imperial Bloodline", "Bloodline: Imperial"],
  ["feat", "Inexorable Iron Hybrid Study", "Inexorable Iron"],
  ["spell", "Telekinetic Hand (Psi)", "Telekinetic Hand"],
  ["spell", "Telekinetic Projectile (Psi)", "Telekinetic Projectile"],
  ["feat", "Flurry Edge", "Flurry"],
  ["feat", "Precision Edge", "Precision"],
  ["feat", "Lightslayer Oath", "Oath of the Slayer"],
];

const ATTR_KEYS = { STR: "str", DEX: "dex", CON: "con", INT: "int", WIS: "wis", CHA: "cha" };

function attrMod(v) {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") return Number(v.value ?? 0);
  return 0;
}

export function buildPlan(exp) {
  const ch = exp.character ?? {};
  const ct = exp.content ?? {};
  const ff = ct.feats_features ?? {};
  const entries = [];
  const add = (kind, packType, name, extra = {}) => {
    if (!name) return;
    entries.push({ kind, packType, name, slug: sluggify(name), ...extra });
  };

  add("ancestry", "ancestry", ch.details?.ancestry?.name, { wgContentId: ch.details?.ancestry?.id, sourcePath: "character.details.ancestry" });
  (ff.heritages ?? []).forEach((h, i) => add("heritage", "heritage", h.name, { wgContentId: h.id, sourcePath: `content.feats_features.heritages[${i}]` }));
  add("background", "background", ch.details?.background?.name, { wgContentId: ch.details?.background?.id, sourcePath: "character.details.background" });
  add("class", "class", ch.details?.class?.name, { wgContentId: ch.details?.class?.id, sourcePath: "character.details.class" });
  for (const group of ["ancestryFeats", "classFeats", "generalAndSkillFeats", "otherFeats"]) {
    (ff[group] ?? []).forEach((f, i) => add("feat", "feat", f.name, {
      wgContentId: f.id,
      level: f.level ?? null,
      featGroup: group === "ancestryFeats" ? "ancestry" : group === "classFeats" ? "class" : null,
      sourcePath: `content.feats_features.${group}[${i}]`,
    }));
  }
  const seenSpells = new Set();
  const focusIds = new Set((ct.focus_spells ?? []).map((s) => s.id));
  const spellList = [...(ct.spells?.all ?? []).map((s, i) => [s, `content.spells.all[${i}]`]), ...(ct.focus_spells ?? []).map((s, i) => [s, `content.focus_spells[${i}]`])];
  for (const [s, sourcePath] of spellList) {
    const key = `${s.id}:${s.rank}`;
    if (seenSpells.has(key)) continue;
    seenSpells.add(key);
    add("spell", "spell", s.name, { wgContentId: s.id, rank: s.rank, castingSource: spellListSource(s.casting_source), focus: focusIds.has(s.id) && !(ct.spells?.all ?? []).some((x) => x.id === s.id), sourcePath });
  }
  // Prepared casters: WG keeps the day's preparation in content.spell_slots (spell_id plus the spell
  // record), not in content.spells.all. Each prepared slot becomes a spell on its source's entry.
  const preparedBy = new Map();
  (ct.spell_slots ?? []).forEach((sl, i) => {
    if (sl?.spell_id == null || !sl.spell?.name) return;
    const source = spellListSource(sl.source);
    const key = `${source}:${sl.spell_id}:${sl.rank}`;
    let e = preparedBy.get(key) ?? entries.find((x) => x.kind === "spell" && !x.innate && !x.focus && x.wgContentId === sl.spell_id && x.rank === sl.rank && x.castingSource === source);
    if (!e) {
      add("spell", "spell", sl.spell.name, { wgContentId: sl.spell_id, rank: sl.rank, castingSource: source, focus: false, sourcePath: `content.spell_slots[${i}]` });
      e = entries[entries.length - 1];
    }
    preparedBy.set(key, e);
    e.prepared = (e.prepared ?? 0) + 1;
  });
  (ct.innate_spells ?? []).forEach((s, i) => add("spell", "spell", s.spell?.name, { wgContentId: s.spell?.id, rank: s.rank, innate: true, tradition: String(s.tradition ?? "").toLowerCase() || null, uses: s.casts_max ?? null, sourcePath: `content.innate_spells[${i}]` }));
  const extraIds = extraItemIds(exp);
  const parents = containerParents(exp);
  const skipped = [];
  const grantedExtras = [];
  const homebrewIds = homebrewSourceIds(ct);
  for (const [invIndex, inv] of (ct.inventory_flat ?? []).entries()) {
    const it = inv.item ?? inv;
    if (SKIP_ITEMS.has(sluggify(it.name))) continue; // built-in strikes, not items
    const sourcePath = `content.inventory_flat[${invIndex}]`;
    // Formulas live in PF2e's formula book (system.crafting.formulas), not in the inventory.
    if (inv.is_formula) { add("formula", "formula", it.name, { wgContentId: it.id, level: it.level ?? null, sourcePath }); continue; }
    // WG grants these itself (EXTRA_ITEM_IDS, e.g. Versatile Vial); PF2e's class grants them too.
    if (extraIds.has(String(it.id))) { skipped.push({ sourcePath, name: it.name, reason: `${it.name}: WG-granted extra item; PF2e grants its own` }); grantedExtras.push(it.name); continue; }
    const invIds = inv.id ? { wgInvId: inv.id, ...(parents.get(inv.id) ? { parentInvId: parents.get(inv.id) } : {}) } : {};
    // WG custom (homebrew) items: built from the export itself, never matched by name (custom-items.js).
    if (isCustomItem(it, homebrewIds) && !inv.is_formula) {
      add("equipment", "equipment", it.name, { wgContentId: it.id, quantity: inv.quantity ?? it.meta_data?.quantity ?? 1, equipped: !!inv.is_equipped, custom: true, customInv: inv, sourcePath, ...invIds });
      continue;
    }
    const c = parseComposedName(it.name, it.meta_data ?? {});
    const hasRunes = c.runes.potency || c.runes.striking || c.runes.resilient || c.runes.property.length;
    add("equipment", "equipment", it.name, { wgContentId: it.id, quantity: inv.quantity ?? it.meta_data?.quantity ?? 1, equipped: !!inv.is_equipped,
      ...(c.composed ? { baseName: c.base, baseSlug: sluggify(c.base) } : {}), runes: hasRunes ? c.runes : null, material: c.material, sourcePath, ...invIds });
  }

  const attributes = {};
  for (const [k, v] of Object.entries(ct.attributes ?? {})) {
    const short = ATTR_KEYS[k.replace(/^ATTRIBUTE_/, "")];
    if (short) attributes[short] = attrMod(v);
  }

  // WG resolves the class DC's governing attribute in raw_data_dump, including
  // class choices (for example a Champion's selected Strength). Keep that
  // resolved value so Foundry does not retain its default key ability.
  const keyAttr = exp?.content?.raw_data_dump?.variables?.CLASS_DC?.value?.attribute ?? selectedKeyAttribute(exp);
  const keyAbility = ATTR_KEYS[String(keyAttr ?? "").replace(/^ATTRIBUTE_/, "")] ?? null;
  // PF2e starts a character with one focus point when WG exports focus spells;
  // the pool cannot exceed three. The raw WG bonus is additive for higher-level
  // characters and is kept here so the importer can initialize the resource.
  const focusBonus = Number(ct.raw_data_dump?.variables?.FOCUS_POINT_BONUS?.value ?? 0);
  const focusMax = (ct.focus_spells ?? []).length ? Math.min(3, 1 + Math.max(0, focusBonus)) : 0;

  return {
    wgId: ch.id,
    name: ch.name ?? "Unnamed",
    level: Number(ch.level ?? 1),
    maxHp: typeof ct.max_hp === "number" ? ct.max_hp : null,
    coins: Object.fromEntries(["cp", "sp", "gp", "pp"].map((k) => [k, Number(ch.inventory?.coins?.[k] ?? 0)])),
    heroPoints: Number(ch.hero_points ?? 0),
    imageUrl: ch.details?.image_url || ch.details?.info?.image_url || null,
    languages: (ct.languages ?? []).map((l) => sluggify(l)),
    attributes,
    ...(keyAbility ? { keyAbility } : {}),
    ...(focusMax ? { focusMax } : {}),
    entries,
    ...(skipped.length ? { skipped } : {}), ...(grantedExtras.length ? { grantedExtras } : {}),
  };
}

/** Match entries against a compendium index: slug first, then an unambiguous name (or name+level). */
/** Sluggified semantic stems: "Bomber Research Field" -> ["bomber"]. */
export function semanticStems(name) {
  const raw = String(name ?? "").trim();
  const lower = raw.toLowerCase();
  return SEMANTIC_ROLE_SUFFIXES.filter((suffix) => lower.endsWith(` ${suffix}`)).map((suffix) => raw.slice(0, -(suffix.length + 1)).trim()).filter(Boolean).map(sluggify);
}
/** Names a WG choice answer may carry in PF2e: the full slug plus semantic stems. */
export const choiceNameKeys = (h) => [sluggify(h), ...semanticStems(h)];

/** Normalize the Postgres-exported match registry into a small pure runtime catalog. */
export function normalizeMatchCatalog(catalog = null) {
  if (catalog?.aliases instanceof Map) return catalog;
  const aliases = new Map();
  const builtin = WG_CANONICAL_ALIASES.map(([item_kind, source_name, target_name]) => ({ item_kind, source_name, target_name, match_strategy: "canonical", evidence_ref: "WG/PF2e issue evidence" }));
  for (const a of [...builtin, ...(catalog?.aliases ?? catalog?.compendium_match_aliases ?? [])]) {
    if (a?.status && a.status !== "active") continue;
    const kind = String(a.item_kind ?? a.itemKind ?? "*");
    const source = sluggify(a.source_slug ?? a.sourceName ?? a.source_name);
    const target = sluggify(a.target_slug ?? a.targetName ?? a.target_name);
    if (!source || !target) continue;
    const key = `${kind}:${source}`;
    const list = aliases.get(key) ?? [];
    list.push({ target, priority: Number(a.priority ?? 100), strategy: a.match_strategy ?? "canonical", evidence: a.evidence_ref ?? null });
    aliases.set(key, list);
  }
  for (const list of aliases.values()) list.sort((a, b) => a.priority - b.priority);
  const typeMap = catalog?.typeMap ?? catalog?.type_map ?? null;
  return { aliases, typeMap };
}
export function matchEntries(entries, index, { catalog = null } = {}) {
  const matchCatalog = normalizeMatchCatalog(catalog);
  const bySlug = new Map();
  const bySlugAll = new Map();
  const byName = new Map();
  for (const row of index) {
    const k = `${row.type}:`;
    if (row.slug && !bySlug.has(k + row.slug)) bySlug.set(k + row.slug, row);
    if (row.slug) (bySlugAll.get(k + row.slug) ?? bySlugAll.set(k + row.slug, []).get(k + row.slug)).push(row);
    const n = k + String(row.name).toLowerCase();
    (byName.get(n) ?? byName.set(n, []).get(n)).push(row);
  }
  const typesFor = (pt) => pt === "equipment"
    ? (matchCatalog.typeMap?.equipment ?? ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "kit"])
    : pt === "feat" ? (matchCatalog.typeMap?.feat ?? ["feat", "action"]) : (matchCatalog.typeMap?.[pt] ?? [pt]);
  const semanticStems = (name) => {
    const raw = String(name ?? "").trim();
    const lower = raw.toLowerCase();
    return SEMANTIC_ROLE_SUFFIXES
      .filter((suffix) => lower.endsWith(` ${suffix}`))
      .map((suffix) => raw.slice(0, -(suffix.length + 1)).trim())
      .filter(Boolean)
      .map(sluggify);
  };
  const uniqueSlugHit = (slug, types, entry) => {
    const candidates = types.flatMap((t) => {
      return bySlugAll.get(`${t}:${slug}`) ?? [];
    });
    const unique = [...new Map(candidates.map((r) => [r.uuid, r])).values()];
    if (unique.length === 1) return unique[0];
    if (entry.level != null) {
      const atLevel = unique.filter((r) => r.level === entry.level);
      if (atLevel.length === 1) return atLevel[0];
    }
    return null;
  };
  return entries.map((e) => {
    if (e.kind === "formula") return resolveFormula(e, index);
    if (e.custom) return { ...e, match: null, via: "custom" };
    for (const t of typesFor(e.packType)) {
      const hit = bySlug.get(`${t}:${e.slug}`);
      if (hit) return { ...e, match: hit, via: "slug" };
    }
    if (e.baseSlug) for (const t of typesFor(e.packType)) {
      const hit = bySlug.get(`${t}:${e.baseSlug}`);
      if (hit) return { ...e, match: hit, via: "base+runes" };
    }
    const aliases = [
      ...(matchCatalog.aliases.get(`${e.packType}:${e.slug}`) ?? []),
      ...(matchCatalog.aliases.get(`*:${e.slug}`) ?? []),
    ];
    for (const alias of aliases) {
      const hit = uniqueSlugHit(alias.target, typesFor(e.packType), e);
      if (hit) return { ...e, match: hit, via: "catalog-alias", canonicalSlug: alias.target, matchEvidence: alias.evidence };
    }
    for (const stem of semanticStems(e.name)) {
      const hit = uniqueSlugHit(stem, typesFor(e.packType), e);
      if (hit) return { ...e, match: hit, via: "semantic-name", canonicalSlug: stem };
    }
    for (const t of typesFor(e.packType)) {
      const list = byName.get(`${t}:${e.name.toLowerCase()}`);
      if (list?.length) {
        // Confidence gate: a name match is used only when it is unambiguous (one compendium item,
        // or exactly one at the WG level). Otherwise the entry is unresolved, never list[0].
        const uniq = [...new Map(list.map((r) => [r.uuid, r])).values()];
        if (uniq.length === 1) return { ...e, match: uniq[0], via: "name" };
        const lvl = e.level != null ? uniq.filter((r) => r.level === e.level) : [];
        if (lvl.length === 1) return { ...e, match: lvl[0], via: "name+level" };
        return { ...e, match: null, via: "ambiguous", candidates: uniq.map((r) => r.uuid) };
      }
    }
    return { ...e, match: null, via: "miss" };
  });
}

export function missReport(matched) {
  return matched.filter((m) => !m.match && !m.custom && !m.coveredBy && !m.unresolved).map((m) => `${m.kind}: ${m.name}`);
}

export const FALLBACK_IMG = "icons/svg/mystery-man.svg";
/**
 * WG portrait URL -> something Foundry can load directly. Absolute http(s)/data URLs pass through
 * (WG public storage serves Access-Control-Allow-Origin: *, so tokens/WebGL can use it without
 * downloading). Relative storage paths resolve against the functions host (Supabase/Kong origin).
 */
export function resolveImageUrl(raw, functionsUrl) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (/^(https?:|data:)/i.test(v)) return v;
  let origin;
  try { origin = new URL(functionsUrl).origin; } catch { return null; }
  if (v.startsWith("/")) return origin + v;
  if (v.startsWith("storage/")) return `${origin}/${v}`;
  return `${origin}/storage/v1/object/public/${v.replace(/^\/+/, "")}`;
}
// ---------------------------------------------------------------------------------------------
// ChoiceSet hints (PLAN 7.2): WG stores each "select" operation's answer in
// character.operation_data.selections, keyed "<owner>_<operationId>" -> option id (PREDEFINED) or
// ability block id (FILTERED). Returns Map(slug of the feature/feat that owns the select -> [names]).
// The map also exposes non-enumerable `byId` and `keys` indexes so callers can
// use stable WG content IDs without changing the existing name-based API.
/**
 * Display name for a bare WG ADJ_VALUE answer from a FILTERED select (no predefined
 * options): SKILL_STEALTH -> "Stealth", WEAPON_GROUP_SWORD -> "Sword". Lore skills and
 * other variables are not named (no PF2e option can be matched safely).
 */
export function rawVariableName(v) {
  const m = String(v ?? "").match(/^(?:SKILL|WEAPON_GROUP)_([A-Z]+(?:_[A-Z]+)*)$/);
  if (!m || /^LORE(_|$)/.test(m[1])) return null;
  return m[1].toLowerCase().replace(/(^|_)([a-z])/g, (_, p, c) => `${p ? " " : ""}${c.toUpperCase()}`);
}

/**
 * The exported selection key for one select op. Reads only keys that end exactly in
 * _<opId>; WG also leaves sibling history entries (<key>_<oldValue>) that are ignored.
 * When several keys end in the same op id, only the one scoped to the owner's block id
 * is used; otherwise the answer is ambiguous and nothing is read.
 */
export function selectionKeyFor(keys, opId, ownerId = null) {
  const hits = keys.filter((k) => k.endsWith(`_${opId}`));
  if (hits.length <= 1) return hits[0] ?? null;
  if (ownerId == null) return null;
  const scoped = hits.filter((k) => k.split(/[_-]/).includes(String(ownerId)));
  return scoped.length === 1 ? scoped[0] : null;
}

/** Key attribute from the class's selected WG option (setValue CLASS_DC.attribute), when exactly one is selected. */
export function selectedKeyAttribute(exp) {
  const sel = exp?.character?.operation_data?.selections ?? {};
  const keys = Object.keys(sel);
  const found = new Set();
  const visit = (ops, depth = 0) => {
    if (!Array.isArray(ops) || depth > 6) return;
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      if (op.type === "select" && op.id) {
        const key = selectionKeyFor(keys, op.id);
        const pre = key ? (op.data?.optionsPredefined ?? []).find((o) => String(o.id) === String(sel[key])) : null;
        for (const o of pre?.operations ?? []) {
          const a = o?.type === "setValue" && o.data?.variable === "CLASS_DC" ? o.data?.value?.attribute : null;
          if (a) found.add(String(a));
        }
      }
      if (op.type === "conditional") { visit(op.data?.trueOperations, depth + 1); visit(op.data?.falseOperations, depth + 1); }
    }
  };
  visit(exp?.character?.details?.class?.operations);
  return found.size === 1 ? [...found][0] : null;
}

export function wgChoiceHints(exp) {
  const sel = exp?.character?.operation_data?.selections ?? {};
  const ff = exp?.content?.feats_features ?? {};
  const all = Object.values(ff).flat().filter((f) => f && typeof f === "object");
  const d = exp?.character?.details ?? {};
  const owners = [...all, d.ancestry, d.background, d.class].filter(Boolean);
  const byId = new Map(all.map((f) => [String(f.id), f]));
  const keys = Object.keys(sel);
  const out = new Map();
  // Non-enumerable: owner slug -> selection keys, so the coverage ledger can tell which answers were used.
  Object.defineProperty(out, "keys", { value: new Map(), enumerable: false });
  const push = (owner, name, key, ownerId = null) => {
    const ownerName = typeof owner === "object" ? owner?.name : owner;
    const id = ownerId ?? (typeof owner === "object" ? owner?.id : null);
    const k = sluggify(ownerName);
    if (key) (out.keys.get(k) ?? out.keys.set(k, []).get(k)).push(key);
    const list = out.get(k) ?? out.set(k, []).get(k);
    if (!list.includes(name)) list.push(name);
    if (id != null) {
      const byIdList = out.byId.get(String(id)) ?? out.byId.set(String(id), []).get(String(id));
      if (!byIdList.includes(name)) byIdList.push(name);
    }
  };
  const visit = (owner, ops, depth = 0) => {
    if (!Array.isArray(ops) || depth > 6) return;
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      if (op.type === "select" && op.id) {
        const key = selectionKeyFor(keys, op.id, typeof owner === "object" ? owner?.id : null);
        const v = key ? sel[key] : null;
        if (v != null) {
          // WGUI has emitted both the predefined option id and the nested
          // operation id over time. Treat either representation as the same
          // selected option so background/class skill choices are not lost.
          const pre = (op.data?.optionsPredefined ?? []).find((o) => String(o.id) === String(v) || String(o.operation?.id) === String(v));
          const operation = pre?.operation ?? null;
          const variable = operation?.type === "adjValue" ? operation.data?.variable : null;
          const variableName = variable
            ? String(variable).replace(/^SKILL_|^ATTRIBUTE_/, "").toLowerCase().replace(/(^|_)([a-z])/g, (_, p, c) => `${p ? " " : ""}${c.toUpperCase()}`)
            : null;
          // FILTERED ADJ_VALUE selects (e.g. Skilled Human "Select a Skill") have no
          // predefined options; WG stores the raw variable (SKILL_STEALTH) as the answer.
          const rawSkill = !pre ? rawVariableName(v) : null;
          const name = pre?.title ?? byId.get(String(v))?.name ?? variableName ?? rawSkill;
          if (name) push(owner, name, key);
          if (pre?.operations) visit(owner, pre.operations, depth + 1);
          if (pre?.operation) visit(owner, [pre.operation], depth + 1);
        }
      }
      if (op.type === "conditional") { visit(owner, op.data?.trueOperations, depth + 1); visit(owner, op.data?.falseOperations, depth + 1); }
    }
  };
  Object.defineProperty(out, "byId", { value: new Map(), enumerable: false });
  for (const o of owners) visit(o, o.operations);
  // Adopted Ancestry stores the chosen ancestry as a trait id (all_traits meta_data.ancestry_trait).
  // The select operation lives on the granted feat and is often absent from the export. Attach the
  // trait name to the single feat whose id is a token of the key. Zero or several feat ids stay unnamed.
  const ancestryTraits = new Map((exp?.content?.all_traits ?? []).filter((t) => t?.meta_data?.ancestry_trait && t.name).map((t) => [String(t.id), t.name]));
  for (const [key, value] of Object.entries(sel)) {
    const traitName = ancestryTraits.get(String(value));
    if (!traitName) continue;
    const tokens = new Set(key.split(/[_-]/));
    const featOwners = [...byId.values()].filter((f) => tokens.has(String(f.id)));
    if (featOwners.length === 1) push(featOwners[0], traitName, key);
  }
  // Explicit picks the visitor cannot name itself (e.g. an ABILITY_BLOCK option that gives Plant Empathy),
  // named from the option's own giveAbilityBlock id (scripts/selections.js).
  for (const [k, x] of classifySelections(exp)) if (x.answer) push(x.answer.owner, x.answer.name, k);
  return out;
}

/** Index of the first label matching a hint name (exact slug, a single " Dragon" suffix, or "Polymath" vs "Polymath Muse"). */
export function matchChoice(labels, hintNames) {
  const hints = hintNames.map((n) => sluggify(n)).filter(Boolean);
  for (const h of hints) {
    for (const [i, label] of labels.entries()) {
      const l = sluggify(label);
      // "Diabolic" and "Diabolic Dragon" are the same PF2e dragon option. The extra word must be exactly Dragon.
      if (l && (h === l || l === `${h}-dragon` || h === `${l}-dragon` || h.startsWith(`${l}-`) || h.endsWith(`-${l}`) || l.endsWith(`-${h}`))) return i;
    }
  }
  return -1;
}

/** PF2e's default ChoiceSet flag: the item slug in camelCase. */
export function defaultFlag(itemName) {
  return sluggify(itemName).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------------------------
// Runes and materials (PLAN 6). WG composes names like "+1 Striking Flaming Longsword" or
// "Cold Iron Dagger (Low-Grade)"; meta_data.runes / meta_data.material win when present.
const PROPERTY_RUNES = ["anarchic", "axiomatic", "ancestral echoing", "anchoring", "astral", "bane", "bloodbane", "brilliant", "conducting", "corrosive", "crushing", "cunning", "dancing", "disrupting", "energizing", "fearsome", "flaming", "frost", "ghost touch", "grievous", "hauling", "holy", "impactful", "keen", "kin-warding", "pacifying", "returning", "serrating", "shifting", "shock", "speed", "spell-storing", "thundering", "unholy", "vorpal", "wounding", "energy-resistant", "fortification", "glamered", "invisibility", "ready", "shadow", "slick"];
const MATERIALS = { "cold iron": "cold-iron", silver: "silver", adamantine: "adamantine", mithral: "dawnsilver", dawnsilver: "dawnsilver", orichalcum: "orichalcum", darkwood: "duskwood", duskwood: "duskwood", dragonhide: "dragonhide", "sovereign steel": "sovereign-steel", djezet: "djezet", inubrix: "inubrix", noqual: "noqual", siccatite: "siccatite", "sisterstone": "sisterstone", warpglass: "warpglass", peachwood: "peachwood", abysium: "abysium" };
const GRADES = { "low-grade": "low", "standard-grade": "standard", "high-grade": "high", low: "low", standard: "standard", high: "high" };
const TIER = { "": 1, greater: 2, major: 3 };

export function parseComposedName(name, meta = {}) {
  let rest = String(name ?? "").trim();
  const runes = { potency: 0, striking: 0, resilient: 0, property: [] };
  let material = null;
  const m0 = rest.match(/^\+(\d)\s+/);
  if (m0) { runes.potency = Number(m0[1]); rest = rest.slice(m0[0].length); }
  const fund = rest.match(/^(?:(greater|major)\s+)?(striking|resilient)\s+/i);
  if (fund) { runes[fund[2].toLowerCase()] = TIER[(fund[1] ?? "").toLowerCase()]; rest = rest.slice(fund[0].length); }
  for (let again = true; again;) {
    again = false;
    for (const r of PROPERTY_RUNES) {
      const re = new RegExp(`^(?:(greater|major|true)\\s+)?${r.replace(/[-\s]/g, "[-\\s]")}\\s+`, "i");
      const m = rest.match(re);
      if (m) { runes.property.push(sluggify(m[1] ? `${m[1]} ${r}` : r)); rest = rest.slice(m[0].length); again = true; break; }
    }
  }
  const g = rest.match(/\s*\((low|standard|high)(?:-grade)?\)\s*$/i);
  let grade = g ? GRADES[g[1].toLowerCase()] : null;
  if (g) rest = rest.slice(0, g.index);
  for (const [k, v] of Object.entries(MATERIALS)) {
    if (rest.toLowerCase().startsWith(`${k} `)) { material = { type: v, grade: grade ?? "standard" }; rest = rest.slice(k.length + 1); break; }
  }
  if (!material && g) rest = `${rest} (${g[1]}${/grade/i.test(g[0]) ? "-Grade" : ""})`; // grade belonged to the base item
  const mr = meta?.runes;
  if (mr && typeof mr === "object") {
    for (const k of ["potency", "striking", "resilient"]) if (Number(mr[k]) > 0) runes[k] = Number(mr[k]);
    for (const p of mr.property ?? []) { const s = sluggify(typeof p === "string" ? p : p?.name ?? p?.slug); if (s && !runes.property.includes(s)) runes.property.push(s); }
  }
  const mm = meta?.material;
  if (mm && typeof mm === "object" && (mm.type || mm.name)) material = { type: sluggify(mm.type ?? mm.name), grade: GRADES[String(mm.grade ?? "standard").toLowerCase()] ?? "standard" };
  const composed = rest !== String(name ?? "").trim();
  return { base: rest.trim(), runes, material, composed };
}

// ---------------------------------------------------------------------------------------------
// Spellcasting (PLAN 6): one entry per WG spell source, plus focus and innate entries.
const ATTR_SHORT = (a) => ATTR_KEYS[String(a ?? "").replace(/^ATTRIBUTE_/, "")] ?? "cha";
/** Divine font slots are extra prepared Heal or Harm on the class entry, not a second caster. */
export function spellListSource(name) {
  const raw = String(name ?? "");
  return raw.match(/^(.*)_DIVINE_FONT$/)?.[1] || raw;
}

export function spellcastingPlan(exp) {
  const ct = exp?.content ?? {};
  const entries = [];
  const sources = new Map();
  for (const s of ct.spell_sources ?? []) {
    const src = s.source ?? s;
    if (String(src.name ?? "").endsWith("_DIVINE_FONT")) continue;
    sources.set(src.name, src);
    const type = String(src.type ?? "");
    const slots = {};
    for (const sl of ct.spell_slots ?? []) if (spellListSource(sl.source) === src.name) slots[sl.rank] = (slots[sl.rank] ?? 0) + 1;
    entries.push({ key: `src:${src.name}`, source: src.name, name: `${titleCase(src.name)} Spells`, mode: type.startsWith("PREPARED") ? "prepared" : "spontaneous", tradition: String(src.tradition ?? "").toLowerCase() || null, ability: ATTR_SHORT(src.attribute), slots });
  }
  const focusSrc = new Set((ct.focus_spells ?? []).map((s) => s.casting_source ?? null));
  for (const fs of focusSrc) {
    const src = sources.get(fs);
    entries.push({ key: `focus:${fs}`, source: fs, name: `${fs ? titleCase(fs) + " " : ""}Focus Spells`, mode: "focus", tradition: String(src?.tradition ?? "").toLowerCase() || null, ability: ATTR_SHORT(src?.attribute), slots: {} });
  }
  const innTrad = new Set((ct.innate_spells ?? []).map((s) => String(s.tradition ?? "").toLowerCase() || null));
  for (const t of innTrad) entries.push({ key: `innate:${t}`, source: null, name: `Innate Spells${t ? ` (${titleCase(t)})` : ""}`, mode: "innate", tradition: t, ability: "cha", slots: {} });
  return entries;
}
export function entryKeyFor(e) {
  if (e.innate) return `innate:${e.tradition ?? null}`;
  if (e.focus) return `focus:${e.castingSource ?? null}`;
  return `src:${e.castingSource}`;
}
/** Import-report warnings: a slotted spellcasting entry with no spells from its WG source. */
export function spellSlotWarnings(exp, entries) {
  const out = [];
  for (const se of spellcastingPlan(exp)) {
    if (se.mode !== "prepared" && se.mode !== "spontaneous") continue;
    const total = Object.values(se.slots).reduce((a, b) => a + b, 0);
    if (!total) continue;
    const own = entries.filter((e) => e.kind === "spell" && !e.focus && !e.innate && entryKeyFor(e) === se.key);
    if (se.mode === "prepared" && !own.some((e) => e.prepared)) out.push(`${se.name}: ${total} spell slots but no prepared spells from WG source ${se.source}. Prepare spells in Wanderer's Guide and re-export.`);
    else if (se.mode === "spontaneous" && !own.length) out.push(`${se.name}: ${total} spell slots but no spells from WG source ${se.source}. Add spells in Wanderer's Guide (Manage Spells) and re-export.`);
  }
  return out;
}
/** Item updates that put prepared spells into their entry's slots. Entries need entryId and itemId. */
export function preparedSlotUpdates(entries) {
  const byEntry = new Map();
  for (const e of entries) {
    if (e.kind !== "spell" || !e.prepared || !e.entryId || !e.itemId) continue;
    const slots = byEntry.get(e.entryId) ?? {};
    byEntry.set(e.entryId, slots);
    const list = (slots[Number(e.rank ?? 0)] ??= []);
    for (let n = 0; n < e.prepared; n++) list.push({ id: e.itemId, expended: false });
  }
  return [...byEntry].map(([_id, slots]) => ({ _id, ...Object.fromEntries(Object.entries(slots).map(([r, list]) => [`system.slots.slot${r}.prepared`, list])) }));
}
function titleCase(s) { return String(s ?? "").toLowerCase().replace(/(^|[\s_-])([a-z])/g, (_, a, b) => `${a === "_" ? " " : a}${b.toUpperCase()}`); }

// ---------------------------------------------------------------------------------------------
// Dry-run diff and parity (PLAN 7.3, 8). `actor` is a plain summary built by the importer:
// { name, level, hpMax, attributes, languages, items: [{ type, name, slug, rank, focus, runes, material, wgContentId, ours }] }
function itemFound(entry, items) {
  const slugs = [entry.slug, entry.baseSlug].filter(Boolean);
  if (entry.kind === "spell" && !entry.focus && entry.rank > 0) {
    const ranked = items.find((i) => slugs.includes(i.slug) && i.rank === entry.rank);
    if (ranked) return ranked;
  }
  return items.find((i) => (entry.wgContentId != null && i.wgContentId === entry.wgContentId && i.kind === entry.kind)
    || slugs.includes(i.slug)
    || (entry.kind === "feat" && slugs.some((s) => s.startsWith(`${i.slug}-`) || (i.slug && i.slug.startsWith(`${s}-`)))));
}
// WG lists some granted actions (e.g. Indomitable Act from Dauntless) as feats; PF2e grants them as actions.
const KIND_TYPES = { ancestry: ["ancestry"], heritage: ["heritage"], background: ["background"], class: ["class"], feat: ["feat", "action"], spell: ["spell"], equipment: ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "kit"] };

export function diffPlan(plan, actor) {
  plan = { ...plan, entries: plan.entries.filter((e) => e.kind !== "formula") };
  const fields = [];
  if (!actor) return { insert: true, fields: [], add: plan.entries.map((e) => `${e.kind}: ${e.name}`), remove: [], keep: [] };
  const cmp = (label, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) fields.push({ field: label, from: a, to: b }); };
  cmp("name", actor.name, plan.name);
  cmp("level", actor.level, plan.level);
  cmp("max HP", actor.hpMax, plan.maxHp);
  for (const [k, v] of Object.entries(plan.attributes)) cmp(`attribute ${k}`, actor.attributes?.[k] ?? null, v);
  cmp("languages", [...(actor.languages ?? [])].sort(), [...plan.languages].sort());
  const add = [], keep = [];
  const ours = (actor.items ?? []).filter((i) => i.ours);
  const used = new Set();
  for (const e of plan.entries) {
    const pool = (actor.items ?? []).filter((i) => KIND_TYPES[e.kind].includes(i.type));
    const hit = itemFound(e, pool);
    if (hit) { keep.push(`${e.kind}: ${e.name}`); used.add(hit); } else add.push(`${e.kind}: ${e.name}`);
  }
  const remove = ours.filter((i) => !used.has(i) && i.type !== "spellcastingEntry" && i.type !== "effect").map((i) => `${i.type}: ${i.name}`);
  return { insert: false, fields, add, remove, keep };
}

export function parityCheck(plan, actor) {
  plan = { ...plan, entries: plan.entries.filter((e) => e.kind !== "formula") };
  const rows = [];
  const row = (check, wg, foundry, ok) => rows.push({ check, wg, foundry, ok: ok ?? JSON.stringify(wg) === JSON.stringify(foundry) });
  row("level", plan.level, actor.level);
  if (plan.maxHp != null) row("max HP", plan.maxHp, actor.hpMax);
  for (const [k, v] of Object.entries(plan.attributes)) row(`attribute ${k}`, v, actor.attributes?.[k] ?? null);
  row("languages", [...plan.languages].sort(), [...(actor.languages ?? [])].sort(), plan.languages.every((l) => (actor.languages ?? []).includes(l)));
  for (const e of plan.entries) {
    const pool = (actor.items ?? []).filter((i) => KIND_TYPES[e.kind].includes(i.type));
    const hit = itemFound(e, pool);
    if (!hit) { row(`${e.kind}: ${e.name}`, "present", "missing", false); continue; }
    if (e.kind === "spell" && !e.focus && e.rank > 0) row(`spell rank: ${e.name}`, e.rank, hit.rank);
    if (e.kind === "spell") row(`spell entry: ${e.name}`, e.innate ? "innate" : e.focus ? "focus" : "spellcasting", hit.entryMode === "innate" ? "innate" : hit.entryMode === "focus" ? "focus" : hit.entryMode ? "spellcasting" : "none");
    if (e.kind === "equipment" && e.runes) {
      const want = { potency: e.runes.potency, striking: e.runes.striking, resilient: e.runes.resilient, property: [...e.runes.property].sort() };
      const got = { potency: hit.runes?.potency ?? 0, striking: hit.runes?.striking ?? 0, resilient: hit.runes?.resilient ?? 0, property: [...(hit.runes?.property ?? [])].sort() };
      if (hit.type === "weapon") { delete want.resilient; delete got.resilient; }
      if (hit.type === "armor") { delete want.striking; delete got.striking; }
      if (hit.type === "weapon" || hit.type === "armor" || hit.type === "shield") row(`runes: ${e.name}`, want, got);
    }
    if (e.kind === "equipment" && e.material) row(`material: ${e.name}`, e.material, hit.material ?? null);
  }
  const dup = new Map();
  for (const i of actor.items ?? []) if (i.ours && i.type !== "spellcastingEntry") { const k = `${i.type}:${i.slug}:${i.rank ?? ""}`; dup.set(k, (dup.get(k) ?? 0) + 1); }
  const dups = [...dup].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
  row("duplicates", [], dups);
  return { ok: rows.every((r) => r.ok), passed: rows.filter((r) => r.ok).length, failed: rows.filter((r) => !r.ok), rows };
}
