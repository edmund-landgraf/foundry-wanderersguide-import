// Foundry-side import. Uses Foundry/PF2e globals (game, Actor, Item, Folder, ChatMessage).
import { MODULE_ID, HOMEBREW_FOLDER } from "./constants.js";
import { auditImportCoverage, leftoverValues, CLASS_SUPPORT_NOTE } from "./coverage.js";
import { buildPlan, matchEntries, missReport, sluggify, resolveImageUrl, FALLBACK_IMG, wgChoiceHints, matchChoice, defaultFlag, spellcastingPlan, spellSlotWarnings, preparedSlotUpdates, entryKeyFor, diffPlan, parityCheck } from "./mapping.js";

const PACK_TYPES = new Set(["ancestry", "heritage", "background", "class", "feat", "spell", "weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "kit"]);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let indexCache = null;
// Uses each pack's already-loaded default index (name, type). We deliberately do NOT call
// pack.getIndex({ fields }) here: on Foundry v14 + PF2e, requesting extra fields across all Item
// packs (feats-srd 6k+, equipment 5.9k) re-extracts every document and froze the client for
// minutes (the "stalled import"). Slug is derived from the name (PF2e slugs are sluggified names).
async function compendiumIndex() {
  if (indexCache) return indexCache;
  const rows = [];
  for (const pack of game.packs.filter((p) => p.documentName === "Item")) {
    const idx = pack.indexed ? pack.index : await pack.getIndex();
    for (const e of idx) {
      if (!PACK_TYPES.has(e.type)) continue;
      rows.push({ type: e.type, slug: e.system?.slug ?? sluggify(e.name), name: e.name, level: e.system?.level?.value ?? null, uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}` });
    }
  }
  return (indexCache = rows);
}

function homebrewItemData(entry, folderId) {
  const type = entry.packType === "equipment" ? "equipment" : entry.packType;
  return {
    name: entry.name,
    type,
    folder: folderId,
    system: { description: { value: "<p>Imported from Wanderer's Guide (no compendium match).</p>" } },
    flags: { [MODULE_ID]: { wgContentId: entry.wgContentId ?? null, homebrew: true } },
  };
}

// Runtime state that must survive an idempotent re-import. Keep this separate from the
// PF2e document mutation code so the preservation rules can be tested without Foundry.
export function captureRuntimeState(actor) {
  if (!actor) return null;
  const items = [...(actor.items ?? [])];
  const getFlag = (item, key) => item.getFlag?.(MODULE_ID, key) ?? item.flags?.[MODULE_ID]?.[key];
  const slots = {};
  for (const item of items) {
    if (getFlag(item, "kind") !== "spellcasting") continue;
    const source = getFlag(item, "wgSource") ?? item.name;
    slots[source] = Object.fromEntries(Object.entries(item.system?.slots ?? {}).map(([rank, value]) => [rank, {
      ...(value ?? {}),
      prepared: Array.isArray(value?.prepared) ? [...value.prepared] : value?.prepared,
    }]));
  }
  return {
    currentHp: actor.system?.attributes?.hp?.value ?? null,
    maxHp: actor.system?.attributes?.hp?.max ?? null,
    tempHp: actor.system?.attributes?.hp?.temp ?? null,
    ...(actor.system?.resources?.focus ? { focus: { ...actor.system.resources.focus } } : {}),
    spellcasting: slots,
  };
}

export function preservedCurrentHp(state, newMaxHp, existing) {
  if (!existing) return newMaxHp;
  if (state?.currentHp == null || newMaxHp == null) return null;
  return Math.max(0, Math.min(Number(state.currentHp), Number(newMaxHp)));
}

/** Build the PF2e focus-resource update independently of HP availability. */
export function focusResourcePatch(plan, runtime, existing) {
  if (plan?.focusMax == null) return null;
  const max = Number(plan.focusMax);
  const value = existing && runtime?.focus?.value != null
    ? Math.max(0, Math.min(Number(runtime.focus.value), max))
    : max;
  return {
    "system.resources.focus.max": max,
    "system.resources.focus.value": value,
  };
}

async function restoreSpellcastingState(actor, state) {
  if (!state || !Object.keys(state).length) return;
  for (const item of [...(actor.items ?? [])]) {
    const source = item.getFlag?.(MODULE_ID, "wgSource") ?? item.flags?.[MODULE_ID]?.wgSource ?? item.name;
    const saved = state[source];
    if (!saved || item.type !== "spellcastingEntry") continue;
    await item.update({ "system.slots": saved });
  }
}

// ---- ChoiceSets answered from WG (PLAN 7.2) ------------------------------------------------
// WG records each select operation's answer (character.operation_data.selections). For a ChoiceSet
// on an item we create, or on an item granted by its GrantItem rules, we use (in this order):
//   1. WG's explicit answer for that feature, accepted only if it names exactly one legal option;
//   2. on re-import, the selection already stored on the actor for the same compendium item, if still legal.
// Nothing is guessed from other names and the first option is never taken. Anything left open is
// recorded as unresolved and PF2e's own prompt is shown to the user (AMBA_REUSE_PLAN section 3).
export function choiceContext(exp, plan, index, actor) {
  const hints = wgChoiceHints(exp);
  const fixedNames = new Set(
    exp?.content?.raw_data_dump?.variables?.PHYSICAL_FEATURE_NAMES?.value
      ?.map((name) => sluggify(name))
      .filter(Boolean) ?? []
  );
  const uuidName = new Map(index.map((r) => [r.uuid, r.name]));
  const previous = new Map();
  for (const i of actor?.items ?? []) {
    const src = i._stats?.compendiumSource ?? i.flags?.core?.sourceId;
    // PF2e keeps a made choice in flags.pf2e.rulesSelections and/or on the ChoiceSet rule itself.
    const sel = { ...(i._source?.flags?.pf2e?.rulesSelections ?? {}) };
    for (const r of i._source?.system?.rules ?? []) if (r?.key === "ChoiceSet" && r.selection != null) sel[r.flag ?? defaultFlag(i.name)] ??= r.selection;
    if (src && Object.keys(sel).length) previous.set(src, { ...(previous.get(src) ?? {}), ...sel });
  }
  const used = new Set();
  const markUsed = (owner) => { for (const k of hints.keys?.get(sluggify(owner)) ?? []) used.add(k); };
  const assigned = new Map();
  const hintKey = (owner, ownerWgId) => ownerWgId != null && hints.byId?.has(String(ownerWgId))
    ? `id:${ownerWgId}`
    : `name:${sluggify(owner)}`;
  const specific = (owner, ownerWgId = null) => ownerWgId != null && hints.byId?.has(String(ownerWgId))
    ? hints.byId.get(String(ownerWgId))
    : hints.get(sluggify(owner)) ?? [];
  const consume = (owner, hint, ownerWgId = null) => {
    const key = hintKey(owner, ownerWgId);
    const set = assigned.get(key) ?? new Set();
    set.add(sluggify(hint));
    assigned.set(key, set);
  };
  const pick = (owner, labels, ownerWgId = null) => {
    const alreadyUsed = assigned.get(hintKey(owner, ownerWgId)) ?? new Set();
    const candidate = specific(owner, ownerWgId)
      .filter((hint) => !alreadyUsed.has(sluggify(hint)))
      .map((hint) => ({ hint, index: matchChoice(labels, [hint]) }))
      .find((x) => x.index >= 0);
    if (!candidate) return null;
    consume(owner, candidate.hint, ownerWgId);
    return candidate.index;
  };
  return { hints, fixedNames, index, uuidName, previous, used, markUsed, conflicts: new Map(), unresolved: [], specific, consume, pick, assigned };
}

/** Index of the single option matching the hints, or -1 when none or more than one match. */
export function uniqueChoice(labels, hintNames) {
  const hits = new Set();
  for (const h of hintNames) { const i = matchChoice(labels, [h]); if (i >= 0) hits.add(i); }
  if (hits.size !== 1) return -1;
  const [i] = hits;
  // Also reject when a second label matches the same hint (e.g. two "Fire" options).
  const others = labels.filter((l, k) => k !== i && matchChoice([l], hintNames) === 0);
  return others.length ? -1 : i;
}

/** Return the sole PF2e label that exactly matches a WG-computed fixed grant. */
export function uniqueFixedChoice(labels, fixedNames) {
  const known = new Set([...fixedNames ?? []].map(sluggify).filter(Boolean));
  const hits = labels.filter((label) => known.has(sluggify(label)));
  return hits.length === 1 ? hits[0] : null;
}

async function filterAccepts(c, uuid) {
  const tags = c.filter.filter((f) => typeof f === "string" && f.startsWith("item:tag:")).map((f) => f.slice(9));
  const traits = c.filter.filter((f) => typeof f === "string" && f.startsWith("item:trait:")).map((f) => f.slice(11));
  if (!tags.length && !traits.length) return false;
  const doc = await fromUuid(uuid).catch(() => null);
  if (!doc || (c.itemType ?? "feat") !== doc.type) return false;
  const t = doc.system?.traits ?? {};
  return tags.every((x) => (t.otherTags ?? []).includes(x)) && traits.every((x) => (t.value ?? []).includes(x));
}

async function resolveChoiceSet(rule, ownerName, ctx, { sourceUuid = null, flag = null, ownerWgId = null } = {}) {
  const specific = ctx.specific(ownerName, ownerWgId);
  const prev = sourceUuid && flag ? ctx.previous.get(sourceUuid)?.[flag] : undefined;
  const c = rule.choices;
  if (Array.isArray(c)) {
    const opts = c.map((o) => {
      const value = typeof o === "object" ? o.value : o;
      const label = (typeof o === "object" && o.label ? game.i18n.localize(o.label) : null) ?? (typeof value === "string" ? ctx.uuidName.get(value) : null) ?? String(value);
      return { value, label: typeof value === "string" && ctx.uuidName.has(value) ? ctx.uuidName.get(value) : label };
    });
    if (specific.length) {
      let i = ctx.pick(ownerName, opts.map((o) => o.label), ownerWgId);
      if (i == null) i = ctx.pick(ownerName, opts.map((o) => String(o.value)), ownerWgId);
      if (i != null) return { value: opts[i].value, label: opts[i].label, via: "WG selection" };
    }
    // Some WG grants are fixed physical features rather than select answers.
    // If PF2e asks the equivalent ChoiceSet, accept only one option whose label
    // exactly matches a physical feature WG already computed. Never use this
    // fallback for arbitrary first options or ambiguous labels.
    const fixedLabel = uniqueFixedChoice(opts.map((option) => option.label), ctx.fixedNames);
    const fixed = fixedLabel ? opts.find((option) => option.label === fixedLabel) : null;
    if (fixed) return { value: fixed.value, label: fixed.label, via: "WG fixed grant" };
    if (prev !== undefined) {
      const o = opts.find((x) => JSON.stringify(x.value) === JSON.stringify(prev));
      if (o) return { value: o.value, label: o.label, via: "existing Foundry selection (still legal)" };
    }
    return null;
  }
  if (c && typeof c === "object" && Array.isArray(c.filter)) {
    const type = c.itemType ?? "feat";
    for (const h of specific) {
      if ((ctx.assigned?.get(sluggify(ownerName)) ?? new Set()).has(sluggify(h))) continue;
      const rows = ctx.index.filter((r) => r.type === type && sluggify(r.name) === sluggify(h));
      const legal = [];
      for (const r of rows) if (await filterAccepts(c, r.uuid)) legal.push(r);
      if (legal.length === 1) {
        ctx.consume(ownerName, h);
        return { value: legal[0].uuid, label: legal[0].name, via: "WG selection" };
      }
    }
    if (typeof prev === "string" && await filterAccepts(c, prev)) return { value: prev, label: ctx.uuidName.get(prev) ?? prev, via: "existing Foundry selection (still legal)" };
  }
  return null;
}

/** Apply PF2e's character-sheet location for a WG feat-slot entry. */
export function applyFeatSlotData(entry, data) {
  if (entry.kind !== "feat" || !data?.system || data.type !== "feat") return data;
  const category = data.system.category;
  const group = ["ancestry", "class"].includes(category) && entry.featGroup
    ? entry.featGroup
    : category === "skill" ? "skill" : category === "general" ? "general" : null;
  // Class/ancestry features and actions are exported alongside selected feats,
  // but must remain in their feature/action groups rather than occupying slots.
  if (!group || !["ancestry", "class", "skill", "general"].includes(group) || !Number.isFinite(Number(entry.level))) return data;
  data.system.location = `${group}-${Number(entry.level)}`;
  data.system.level = { ...(data.system.level ?? {}), taken: Number(entry.level) };
  return data;
}

async function prefillChoices(data, ctx, notes, sourceName = null, sourceWgId = null) {
  const rules = data.system?.rules;
  if (!Array.isArray(rules)) return;
  const src = data._stats?.compendiumSource ?? data.flags?.core?.sourceId ?? null;
  // A WG feature can have a descriptive display name while the PF2e
  // compendium uses a canonical name (for example "Redemption Cause" ->
  // "Redemption"). Try the WG entry name first so its explicit answer is
  // still consumed after canonical matching, then fall back to the document
  // name for normal imports and prior Foundry selections.
  const owners = [...new Set([sourceName, data.name].filter(Boolean))];
  for (const rule of rules) {
    if (rule?.key === "ChoiceSet" && rule.selection == null) {
      const flag = rule.flag ?? defaultFlag(data.name);
      let hit = null;
      let owner = data.name;
      for (const [candidateIndex, candidate] of owners.entries()) {
        hit = await resolveChoiceSet(rule, candidate, ctx, { sourceUuid: src, flag, ownerWgId: candidateIndex === 0 ? sourceWgId : null });
        if (hit) { owner = candidate; break; }
      }
      if (!hit) { ctx.unresolved.push({ owner: data.name, flag, reason: "no explicit WG answer matching exactly one legal option; PF2e will ask" }); continue; }
      rule.selection = hit.value;
      if (hit.via === "WG selection") ctx.markUsed(owner);
      foundry.utils.setProperty(data, `flags.pf2e.rulesSelections.${flag}`, hit.value);
      notes.push(`choice ${data.name}: ${hit.label} (pre-filled from ${hit.via})`);
    } else if (rule?.key === "GrantItem" && typeof rule.uuid === "string" && rule.uuid.startsWith("Compendium.")) {
      const granted = await fromUuid(rule.uuid).catch(() => null);
      for (const gr of granted?.system?.rules ?? []) {
        if (gr?.key !== "ChoiceSet" || gr.selection != null) continue;
        const flag = gr.flag ?? defaultFlag(granted.name);
        if (rule.preselectChoices?.[flag] != null) continue;
        const hit = await resolveChoiceSet(gr, granted.name, ctx, { sourceUuid: rule.uuid, flag, ownerWgId: sourceWgId });
        if (!hit) { ctx.unresolved.push({ owner: granted.name, flag, reason: `granted by ${data.name}; no explicit WG answer; PF2e will ask` }); continue; }
        rule.preselectChoices = { ...(rule.preselectChoices ?? {}), [flag]: hit.value };
        if (hit.via === "WG selection") ctx.markUsed(granted.name);
        notes.push(`choice ${granted.name}: ${hit.label} (pre-filled via ${data.name}, from ${hit.via})`);
      }
    }
  }
}
async function itemDataFor(entry, folderId, ctx, notes) {
  let data;
  if (entry.match) {
    const doc = await fromUuid(entry.match.uuid);
    data = doc.toObject();
    delete data._id;
  } else {
    // Homebrew / unmatched: reuse or create a world item (PLAN section 9).
    const type = entry.packType === "equipment" ? "equipment" : entry.packType;
    let world = game.items.find((i) => {
      const id = i.getFlag(MODULE_ID, "wgContentId");
      if (entry.wgContentId != null) return id === entry.wgContentId;
      return id == null && i.getFlag(MODULE_ID, "homebrew") === true && i.type === type && i.name === entry.name;
    });
    // Planned only: apply() creates the world item after confirmation.
    data = world ? world.toObject() : homebrewItemData(entry, null);
    delete data._id;
    delete data.folder;
  }
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULE_ID]: { wgContentId: entry.wgContentId ?? null, kind: entry.kind } });
  if (entry.kind === "equipment" && data.system) {
    data.system.quantity = entry.quantity ?? 1;
    // Runes and material (PLAN 6): WG composes them into the name; matched on the base item.
    if (entry.baseName || entry.runes || entry.material) data.name = entry.name;
    if (entry.runes && data.system.runes) {
      const r = { ...data.system.runes, potency: entry.runes.potency, property: [...entry.runes.property] };
      if (data.type === "weapon") r.striking = entry.runes.striking;
      if (data.type === "armor") r.resilient = entry.runes.resilient;
      data.system.runes = r;
    }
    if (entry.material && data.system.material !== undefined) data.system.material = { type: entry.material.type, grade: entry.material.grade };
  }
  if (entry.kind === "spell" && data.system) {
    // Spellcasting placement and heightening (PLAN 6).
    const base = Number(data.system.level?.value ?? 1);
    const cantrip = (data.system.traits?.value ?? []).includes("cantrip");
    const loc = { value: entry.entryId ?? null };
    if (!cantrip && !entry.focus && entry.rank > base) loc.heightenedLevel = entry.rank;
    if (entry.innate && entry.uses) loc.uses = { value: entry.uses, max: entry.uses };
    data.system.location = { ...(data.system.location ?? {}), ...loc };
  }
  applyFeatSlotData(entry, data);
  if (["ancestry", "heritage", "background", "class", "feat"].includes(entry.kind)) await prefillChoices(data, ctx, notes, entry.name, entry.wgContentId);
  return data;
}

// PF2e opens a ChoiceSet prompt (PickAThingPrompt) for features granted at runtime (class features
// such as Research Field or Muses cannot be pre-filled from outside). A prompt is answered only from
// WG's explicit selection for that feature, or the actor's previous still-legal selection, and only
// when exactly one option fits. Otherwise it stays open for the user; it is recorded as unresolved
// (and, if the user dismisses it, as not applied). It is never answered with a guess.
// Domain Initiate / Domain Focus have no options when WG exported no deity. Close those instead of
// waiting, and stop the watcher after MAX_PROMPT_PASSES so a prompt PF2e reopens cannot hang the import.
export const MAX_PROMPT_PASSES = 20;
const DOMAIN_PROMPT = /domain initiate|domain focus/i;

export function domainPromptWithoutDeity(app) {
  const title = `${app?.title ?? ""} ${app?.item?.name ?? ""}`;
  return DOMAIN_PROMPT.test(title) && Array.isArray(app?.choices) && app.choices.length === 0;
}

/** Every explicit WG answer, used when the prompt's item name is not the selection owner. */
export function allChoiceHints(hints) {
  const names = [];
  if (hints instanceof Map) for (const list of hints.values()) names.push(...list);
  return names;
}

function watchPrompts(ctx, notes) {
  const seen = new Set();
  let passes = 0;
  let domainWarned = false;
  const tick = () => {
    passes += 1;
    for (const app of foundry.applications?.instances?.values?.() ?? []) {
      if (seen.has(app) || !Array.isArray(app.choices) || !app.rendered) continue;
      seen.add(app);
      const labels = app.choices.map((c) => c.label ?? "");
      const owner = app.item?.name ?? app.options?.item?.name ?? "";
      if (domainPromptWithoutDeity(app)) {
        if (!domainWarned) {
          domainWarned = true;
          ctx.unresolved.push({ owner: owner || app.title, flag: null, reason: "no deity imported; domain prompt has no options" });
          ui.notifications?.warn?.(`Wanderer's Guide import: ${app.title || "domain choice"} has no options without a deity; left unresolved`);
        }
        app.close?.();
        continue;
      }
      const ownerWgId = app.item?.flags?.[MODULE_ID]?.wgContentId ?? null;
      const specific = ctx.specific(owner, ownerWgId);
      let i = specific.length ? ctx.pick(owner, labels, ownerWgId) : null;
      let via = "WG selection";
      if (i == null) {
        const global = uniqueChoice(labels, allChoiceHints(ctx.hints));
        if (global >= 0) i = global;
      }
      if (i == null) {
        const src = app.item?._stats?.compendiumSource ?? app.item?.sourceId ?? null;
        const prev = Object.values(ctx.previous.get(src) ?? {});
        const hits = app.choices.map((c, k) => (prev.some((v) => JSON.stringify(v) === JSON.stringify(c.value)) ? k : -1)).filter((k) => k >= 0);
        if (hits.length === 1) { i = hits[0]; via = "existing Foundry selection"; }
      }
      if (i >= 0 && via === "WG selection") ctx.markUsed(owner);
      if (i >= 0) { notes.push(`choice ${app.title}: ${app.choices[i].label} (prompt answered from ${via})`); app.selection = app.choices[i]; app.close(); continue; }
      const rec = { owner: owner || app.title, flag: null, reason: "PF2e prompt shown to the user (no explicit WG answer)" };
      ctx.unresolved.push(rec);
      ui.notifications?.warn?.(`Wanderer's Guide import needs your choice: ${app.title}`);
      const close = app.close.bind(app);
      app.close = async (...a) => { rec.reason = app.selection ? `user chose ${app.selection.label ?? app.selection.value}` : "prompt dismissed; PF2e did not apply this choice"; rec.resolvedByUser = !!app.selection; return close(...a); };
    }
    if (passes >= MAX_PROMPT_PASSES) {
      clearInterval(timer);
      if (!domainWarned) {
        for (const app of foundry.applications?.instances?.values?.() ?? []) {
          if (!domainPromptWithoutDeity(app)) continue;
          domainWarned = true;
          ctx.unresolved.push({ owner: app.item?.name || app.title, flag: null, reason: "no deity imported; domain prompt has no options" });
          ui.notifications?.warn?.(`Wanderer's Guide import: ${app.title || "domain choice"} has no options without a deity; left unresolved`);
          app.close?.();
        }
      }
    }
  };
  const timer = setInterval(tick, 200);
  return () => clearInterval(timer);
}
// ---- Summaries for dry-run diff and parity -------------------------------------------------
export function summarizeActor(actor) {
  if (!actor) return null;
  const entries = new Map(actor.items.filter((i) => i.type === "spellcastingEntry").map((i) => [i.id, i]));
  return {
    name: actor.name,
    level: actor.level ?? actor.system.details.level.value,
    hpMax: actor.system.attributes.hp.max,
    attributes: Object.fromEntries(Object.entries(actor.system.abilities ?? {}).map(([k, v]) => [k, v.mod])),
    languages: [...(actor.system.details.languages?.value ?? []), ...String(actor.system.details.languages?.details ?? "").split(",").map((l) => sluggify(l)).filter(Boolean)],
    items: actor.items.map((i) => {
      const kind = i.getFlag(MODULE_ID, "kind") ?? null;
      const en = entries.get(i.system.location?.value);
      const ru = i.system.runes;
      return {
        type: i.type, name: i.name, slug: i.system.slug || sluggify(i.name), kind,
        wgContentId: i.getFlag(MODULE_ID, "wgContentId") ?? null,
        ours: kind != null || i.getFlag(MODULE_ID, "wgContentId") !== undefined,
        rank: i.type === "spell" ? Number(i.system.location?.heightenedLevel ?? i.system.level?.value) : null,
        entryMode: en ? en.system.prepared?.value ?? null : null,
        runes: ru ? { potency: ru.potency ?? 0, striking: ru.striking ?? 0, resilient: ru.resilient ?? 0, property: [...(ru.property ?? [])] } : null,
        material: i.system.material?.type ? { type: i.system.material.type, grade: i.system.material.grade } : null,
      };
    }),
  };
}
const findActor = (plan, host) => game.actors.find((a) => a.getFlag(MODULE_ID, "wgId") === plan.wgId && a.getFlag(MODULE_ID, "host") === host);

/** Dry run (PLAN 8): what an import would change. Reads only; nothing is created or written. */
export async function previewImport(exp, { host }) {
  const p = await planImport(exp, { host });
  return { plan: p.plan, diff: p.diff, misses: p.misses, actor: p.actor, coverage: p.coverage, unresolved: p.ctx.unresolved, review: reviewHtml(p) };
}

export function diffHtml(plan, diff, misses) {
  const li = (xs) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>none</p>");
  return `<h3>WG preview: ${esc(plan.name)} (${diff.insert ? "Insert" : "Update"})</h3>`
    + (diff.fields.length ? `<p>Field changes:</p><ul>${diff.fields.map((f) => `<li>${esc(f.field)}: ${esc(JSON.stringify(f.from))} &rarr; ${esc(JSON.stringify(f.to))}</li>`).join("")}</ul>` : "<p>No field changes.</p>")
    + `<p>Add (${diff.add.length}):</p>${li(diff.add)}<p>Remove (${diff.remove.length}):</p>${li(diff.remove)}<p>Unchanged: ${diff.keep.length}. Would become homebrew: ${misses.length}.</p>`;
}
export function parityHtml(name, parity) {
  return `<h4>Parity check</h4><p>${parity.ok ? "All checks match the export." : `${parity.failed.length} of ${parity.rows.length} checks differ:`}</p>`
    + (parity.failed.length ? `<ul>${parity.failed.map((r) => `<li>${esc(r.check)}: WG ${esc(JSON.stringify(r.wg))}, Foundry ${esc(JSON.stringify(r.foundry))}</li>`).join("")}</ul>` : "");
}

// ---- Safe apply (AMBA_REUSE_PLAN section 5) -------------------------------------------------
// importCharacter runs in two phases:
//   1. plan: export -> plan -> compendium match -> every item's data built and validated. No writes.
//   2. apply (only after `confirm` returns true): snapshot the actor, create the replacements, and only
//      then delete the old module-managed items. Any error restores the snapshot (or keeps a
//      "(WG backup)" actor when the restore itself fails) and removes world items this run created.
// `failAfter` (number of items) injects a failure part-way through item creation for tests.

/** Items this module manages on `actor`, plus everything PF2e granted from them. */
export function managedTree(items) {
  const list = [...items];
  const flag = (i, k) => i.getFlag?.(MODULE_ID, k) ?? i.flags?.[MODULE_ID]?.[k];
  const ours = new Set(list.filter((i) => flag(i, "wgContentId") !== undefined || flag(i, "kind")).map((i) => i.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const i of list) {
      const g = i.flags?.pf2e?.grantedBy?.id;
      if (g && ours.has(g) && !ours.has(i.id)) { ours.add(i.id); grew = true; }
      // ABC features (Alchemy, Cat Fall) point at their class/background through system.location.
      const loc = i.system?.location;
      if (typeof loc === "string" && ours.has(loc) && !ours.has(i.id)) { ours.add(i.id); grew = true; }
      // Some grants are only recorded on the parent's flags.pf2e.itemGrants.
      if (ours.has(i.id)) for (const v of Object.values(i.flags?.pf2e?.itemGrants ?? {})) if (v?.id && !ours.has(v.id)) { ours.add(v.id); grew = true; }
    }
  }
  return ours;
}

/** Items explicitly granted by an item that is not in `old` (i.e. created by this run). */
export function explicitGrants(items, old) {
  const list = [...items];
  const byId = new Map(list.map((i) => [i.id, i]));
  const run = new Set(list.filter((i) => !old.has(i.id)).map((i) => i.id));
  const out = [];
  for (const i of list) {
    if (!run.has(i.id)) continue;
    let parent = null;
    const by = i.flags?.pf2e?.grantedBy?.id;
    if (by && run.has(by)) parent = byId.get(by);
    const loc = i.system?.location;
    if (!parent && typeof loc === "string" && run.has(loc)) parent = byId.get(loc);
    if (!parent) parent = list.find((q) => run.has(q.id) && Object.values(q.flags?.pf2e?.itemGrants ?? {}).some((v) => v?.id === i.id)) ?? null;
    if (parent && parent.id !== i.id) out.push({ item: i, parent });
  }
  return out;
}

/** Explain duplicate item names without treating valid PF2e grant pairs as errors. */
export function duplicateItemDiagnostics(items) {
  const all = [...(items ?? [])];
  const byId = new Map(all.map((item) => [item.id, item]));
  const groups = new Map();
  for (const item of all) {
    const key = `${item.type ?? ""}:${item.system?.slug ?? sluggify(item.name)}`;
    const group = groups.get(key) ?? groups.set(key, []).get(key);
    group.push(item);
  }
  return [...groups].filter(([, group]) => group.length > 1).map(([key, group]) => {
    const groupIds = new Set(group.map((i) => i.id));
    const grantPairs = group.filter((i) => {
      const parentId = i.flags?.pf2e?.grantedBy?.id ?? i.system?.location;
      // The parent is often a differently named class feature (Animist's
      // Tangle Vine is one example), so it need not be in this duplicate-name
      // group. Require an actual actor item relationship to avoid hiding
      // unrelated same-name items.
      return typeof parentId === "string" && byId.has(parentId) && (groupIds.has(i.id) || i.flags?.pf2e?.grantedBy?.id === parentId);
    });
    return {
      key,
      items: group.map((i) => ({ id: i.id, name: i.name, type: i.type, source: i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? null, grantedBy: i.flags?.pf2e?.grantedBy?.id ?? null })),
      expectedGrantPair: grantPairs.length > 0,
    };
  });
}

const KIND_ITEM_TYPES = { ancestry: ["ancestry"], heritage: ["heritage"], background: ["background"], class: ["class"], feat: ["feat", "action"], spell: ["spell"] };
/** Same compendium source, or (when WG's entry has no match of that item type) the same slug. No prefix or fuzzy matching. */
export function sameThing(entry, item) {
  if (!(KIND_ITEM_TYPES[entry.kind] ?? []).includes(item.type)) return false;
  const src = item._stats?.compendiumSource ?? item.flags?.core?.sourceId ?? null;
  if (entry.match?.uuid && src) return src === entry.match.uuid;
  const slug = item.system?.slug || sluggify(item.name);
  return slug === entry.slug && (!entry.match || entry.match.type !== item.type);
}
export class InjectedFailure extends Error {}

function forcedFields(plan, host, actor, existing) {
  const keepImg = actor?.img && !/mystery-man|default-icons/.test(actor.img) ? actor.img : null;
  const img = resolveImageUrl(plan.imageUrl, host) ?? keepImg ?? FALLBACK_IMG;
  const forced = {
    name: plan.name,
    img,
    "prototypeToken.texture.src": img,
    "system.details.level.value": plan.level,
    // PF2e silently drops language slugs it does not know (e.g. WG's "pahtra"), so those go into the
    // free-text languages field instead of being lost.
    "system.details.languages.value": plan.languages.filter((l) => l in (CONFIG.PF2E?.languages ?? {})),
    "system.details.languages.details": plan.languages.filter((l) => !(l in (CONFIG.PF2E?.languages ?? {}))).map((l) => l.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).join(", "),
    // Forced values from WG (PLAN 7.2). Attributes are set as manual modifiers.
    "system.build.attributes.manual": true,
    ...Object.fromEntries(Object.entries(plan.attributes).map(([k, v]) => [`system.abilities.${k}.mod`, v])),
  };
  if (plan.keyAbility) forced["system.details.keyability.value"] = plan.keyAbility;
  // Currency and hero points are initialized from WG, but existing Foundry runtime
  // state remains authoritative on re-import.
  if (!existing) {
    Object.assign(forced, Object.fromEntries(Object.entries(plan.coins ?? {}).map(([k, v]) => [`system.currency.${k}`, v])));
    forced["system.resources.heroPoints.value"] = plan.heroPoints ?? 0;
  }
  return forced;
}

/** Phase 1: everything an import needs, computed without writing to the world. */
export async function planImport(exp, { host }) {
  const plan = buildPlan(exp);
  const index = await compendiumIndex();
  const matched = matchEntries(plan.entries, index);
  const misses = missReport(matched);
  const actor = findActor(plan, host) ?? null;
  const ctx = choiceContext(exp, plan, index, actor);
  const notes = [];
  const problems = [];
  // Spellcasting entries get their ids now so spells can point at them.
  const entryIds = {};
  const entryData = spellcastingPlan(exp).map((se) => {
    const _id = foundry.utils.randomID();
    entryIds[se.key] = _id;
    const slots = {};
    for (let r = 0; r <= 10; r++) { const n = se.slots[r] ?? 0; slots[`slot${r}`] = { max: n, value: n, prepared: [] }; }
    return { _id, name: se.name, type: "spellcastingEntry", system: { ability: { value: se.ability }, tradition: { value: se.tradition ?? "" }, prepared: { value: se.mode, flexible: false }, showSlotlessLevels: { value: false }, slots }, flags: { [MODULE_ID]: { kind: "spellcasting", wgSource: se.key } } };
  });
  for (const e of matched) if (e.kind === "spell") {
    // No silent fallback to the first entry: a spell whose WG casting source has no entry is unresolved.
    e.entryId = entryIds[entryKeyFor(e)] ?? null;
    if (!e.entryId) { e.unresolved = "no spellcasting entry for WG casting source " + JSON.stringify(e.castingSource ?? null); ctx.unresolved.push({ owner: `spell: ${e.name}`, flag: null, reason: e.unresolved }); }
  }
  // Build every item's data now; homebrew world items are only described here and created on apply.
  for (const e of matched) {
    if (e.via === "ambiguous") { e.unresolved = `several compendium items share this name: ${e.candidates.join(", ")}`; ctx.unresolved.push({ owner: `: ${e.name}`, flag: null, reason: e.unresolved }); continue; }
    if (e.unresolved) continue;
    const n0 = notes.length;
    try { e.data = await itemDataFor(e, null, ctx, notes); e.notes = notes.slice(n0); }
    catch (err) { e.error = err.message; problems.push(`${e.kind}: ${e.name} (${err.message})`); }
  }
  const warnings = spellSlotWarnings(exp, matched);
  const diff = diffPlan(plan, summarizeActor(actor));
  const homebrew = matched.filter((e) => !e.match && e.data);
  const coverage = auditImportCoverage(exp, { ...plan, entries: matched }, { applied: false, grantedSlugs: grantedSlugsOf(actor), choiceUsed: ctx.used, slug: sluggify });
  return { coverage, exp, plan, host, index, ctx, matched, misses, notes, problems, warnings, actor, entryData, diff, homebrew, valid: problems.length === 0 };
}

function grantedSlugsOf(actor) {
  return new Set([...(actor?.items ?? [])].filter((i) => i.flags?.pf2e?.grantedBy?.id || typeof i.system?.location === "string").map((i) => i.system?.slug || sluggify(i.name)));
}

export function coverageHtml(ledger) {
  const c = ledger.counts;
  const list = (status) => ledger.rows.filter((r) => r.status === status);
  // Keep the path as ordinary text. Foundry's chat/review HTML sanitizer can
  // drop the contents of inline <code> elements, leaving blank list items.
  const ul = (rows) => `<ul>${rows.map((r) => `<li>${esc(r.path)}: ${esc(r.reason)}</li>`).join("")}</ul>`;
  return `<h4>Coverage ledger</h4><p>${esc(ledger.classSupport)}</p>`
    + `<p>${c.mapped} mapped, ${c.included} included, ${c.unresolved} unresolved, ${c["leftover-preserved"]} leftover-preserved, ${c.dropped} dropped (${ledger.rows.length} source paths).</p>`
    + (c.unresolved ? `<details class="wgi-cov-unresolved"><summary>Unresolved (${c.unresolved})</summary>${ul(list("unresolved"))}</details>` : "")
    + (c.dropped ? `<details class="wgi-cov-dropped"><summary>Dropped (${c.dropped})</summary>${ul(list("dropped"))}</details>` : "")
    + (c["leftover-preserved"] ? `<details><summary>Leftover-preserved (${c["leftover-preserved"]}, stored in flags.${MODULE_ID}.wgLeftovers)</summary>${ul(list("leftover-preserved"))}</details>` : "");
}
export function reviewHtml(p) {
  const li = (xs) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>none</p>");
  return `${diffHtml(p.plan, p.diff, p.misses)}`
    + (p.homebrew.length ? `<p>World homebrew items to create or reuse (folder "${esc(HOMEBREW_FOLDER)}"):</p>${li(p.homebrew.map((e) => `${e.kind}: ${e.name}`))}` : "")
    + (p.notes.length ? `<p>Choices:</p>${li(p.notes)}` : "")
    + (p.ctx.unresolved.length ? `<p><strong>Unresolved (PF2e will ask you; nothing is guessed):</strong></p>${li(p.ctx.unresolved.map((u) => `${u.owner}${u.flag ? ` [${u.flag}]` : ""}: ${u.reason}`))}` : "")
    + (p.warnings?.length ? `<p><strong>Warnings:</strong></p>${li(p.warnings)}` : "")
    + (p.problems.length ? `<p><strong>Plan problems (import blocked):</strong></p>${li(p.problems)}` : "")
    + coverageHtml(p.coverage);
}

/** Phase 2. Called by importCharacter after confirmation. */
async function applyImport(p, { onStep, parity, failAfter }) {
  const { plan, host, matched, misses, notes, entryData, exp } = p;
  const step = onStep;
  let actor = p.actor ? game.actors.get(p.actor.id) : null;
  const existing = !!actor;
  const snapshot = existing ? actor.toObject() : null;
  const runtime = captureRuntimeState(actor);
  const createdWorld = [];
  let createdFolder = null;
  let createdActor = null;
  let createdCount = 0;
  const bump = (n) => { createdCount += n; if (failAfter != null && createdCount >= failAfter) throw new InjectedFailure(`injected failure after ${createdCount} created items`); };
  const createItems = async (docs, opts = {}) => {
    if (!docs.length) return [];
    if (failAfter == null) { const out = await actor.createEmbeddedDocuments("Item", docs, { render: false, ...opts }); bump(0); return out; }
    const out = [];
    for (const d of docs) { out.push(...await actor.createEmbeddedDocuments("Item", [d], { render: false, ...opts })); bump(1); }
    return out;
  };
  const stopPrompts = watchPrompts(p.ctx, notes);
  try {
    // Homebrew world items: only now that the plan is confirmed.
    if (p.homebrew.length) {
      let folder = game.folders.find((f) => f.type === "Item" && f.name === HOMEBREW_FOLDER);
      if (!folder) { folder = await Folder.create({ name: HOMEBREW_FOLDER, type: "Item" }); createdFolder = folder; }
      for (const e of p.homebrew) {
        const type = e.packType === "equipment" ? "equipment" : e.packType;
        let world = game.items.find((i) => {
          const id = i.getFlag(MODULE_ID, "wgContentId");
          if (e.wgContentId != null) return id === e.wgContentId;
          return id == null && i.getFlag(MODULE_ID, "homebrew") === true && i.type === type && i.name === e.name;
        });
        if (!world) { world = await Item.create(homebrewItemData(e, folder.id)); createdWorld.push(world); }
      }
    }
    if (!actor) {
      actor = createdActor = await Actor.create({ name: plan.name, type: "character", ownership: { default: 0, [game.user.id]: 3 }, flags: { [MODULE_ID]: { wgId: plan.wgId, host } } });
    }
    // Old managed items stay until every replacement exists.
    const old = existing ? managedTree(actor.items) : new Set();
    step("actor");
    await actor.update(forcedFields(plan, host, actor, existing));
    step("forced");
    const order = ["ancestry", "heritage", "background", "class", "feat", "spell", "equipment"];
    for (const kind of order) {
      if (kind === "spell" && entryData.length) {
        await createItems(entryData, { keepId: true });
        await restoreSpellcastingState(actor, runtime?.spellcasting);
      }
      // Items with GrantItem rules go first so their grants exist before the rest are checked
      // (e.g. Web Weaver grants Specialty Crafting, which WG also lists as a feat).
      const grants = (e) => (e.data.system?.rules ?? []).some((r) => r?.key === "GrantItem");
      const todo = matched.filter((x) => x.kind === kind && x.data);
      for (const pass of [todo.filter(grants), todo.filter((e) => !grants(e))]) {
      const batch = [];
      const batchEntries = [];
      // Dedupe only against items PF2e explicitly granted from something this run created
      // (grantedBy, the parent's itemGrants, or an ABC feature's system.location) and only when it is
      // the same compendium item (or, for a WG entry with no same-type match, the same slug).
      const granted = explicitGrants(actor.items, old);
      for (const e of pass) {
        const g = kind === "equipment" ? null : granted.find(({ item }) => sameThing(e, item));
        if (g) {
          e.outcome = "granted"; e.grantedBy = g.parent.name; e.itemId = g.item.id;
          // The planned pre-fill never reached the actor; drop its note so the report only shows applied choices.
          for (const n of e.notes ?? []) { const j = notes.indexOf(n); if (j >= 0) notes.splice(j, 1); }
          const k = misses.findIndex((m) => m === `${e.kind}: ${e.name}`); if (k >= 0) misses.splice(k, 1);
          if (kind === "spell" && e.entryId && g.item.system.location?.value !== e.entryId) await g.item.update({ "system.location.value": e.entryId });
          const hints = p.ctx.specific(e.name);
          const sel = [...Object.values(g.item._source.flags?.pf2e?.rulesSelections ?? {}), ...(g.item._source.system?.rules ?? []).filter((r) => r?.key === "ChoiceSet" && r.selection != null).map((r) => r.selection)].map(String);
          if (hints.length && !hints.some((h) => sel.some((v) => sluggify(v) === sluggify(h) || sluggify(g.item.name).includes(sluggify(h))))) {
            p.ctx.unresolved.push({ owner: g.item.name, flag: null, reason: `WG answer ${hints.join(", ")} differs from PF2e's grant via ${g.parent.name}; kept PF2e's grant` });
            for (const k of p.ctx.hints.keys?.get(sluggify(e.name)) ?? []) p.ctx.conflicts.set(k, `WG answer ${hints.join(", ")} for ${e.name}; PF2e's ${g.parent.name} grant fixes it (${sel.join(", ") || "no selection"}); kept PF2e's rule`);
          }
          continue;
        }
        e.outcome = e.match ? "created" : "homebrew";
        batch.push(foundry.utils.deepClone(e.data));
        batchEntries.push(e);
      }      step(`build ${kind} ${batch.length}`);
      const made = await createItems(batch);
      made.forEach((doc, i) => { if (batchEntries[i]) batchEntries[i].itemId = doc.id; });
      }
      step(`created ${kind}`);
    }
    // Prepared casters: fill each entry's slots with the spells WG prepared in them.
    const prepared = preparedSlotUpdates(matched);
    if (prepared.length) await actor.updateEmbeddedDocuments("Item", prepared, { render: false });
    step("prepared slots");
    // Leftovers (coverage status leftover-preserved) are kept verbatim on the actor.
    // Use Document flag APIs when available. The -= embedded-key update form
    // is deprecated in newer Foundry versions and will be removed in v16.
    const leftovers = leftoverValues(exp, p.coverage);
    if (typeof actor.unsetFlag === "function") await actor.unsetFlag(MODULE_ID, "wgLeftovers");
    else await actor.update({ [`flags.${MODULE_ID}.-=wgLeftovers`]: null });
    if (typeof actor.setFlag === "function") await actor.setFlag(MODULE_ID, "wgLeftovers", leftovers);
    else await actor.update({ [`flags.${MODULE_ID}.wgLeftovers`]: leftovers });
    // Replacements exist: now remove the previous module-managed items.
    const stale = [...old].filter((id) => actor.items.has(id));
    if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale);
    step("old removed");

    if (plan.maxHp != null) {
      // HP adjustment (PLAN 7.2): WG's max HP wins; a flagged effect carries the difference.
      const computed = actor.system.attributes.hp.max;
      const delta = plan.maxHp - computed;
      if (delta !== 0) {
        await actor.createEmbeddedDocuments("Item", [hpEffect(plan.maxHp, computed, delta)], { render: false });
        notes.push(`HP: PF2e computed ${computed}, WG ${plan.maxHp}; adjustment ${delta > 0 ? "+" : ""}${delta}`);
      }
      const hpValue = preservedCurrentHp(runtime, plan.maxHp, existing);
      const hpPatch = {};
      if (hpValue != null) hpPatch["system.attributes.hp.value"] = hpValue;
      if (existing && runtime?.tempHp != null) hpPatch["system.attributes.hp.temp"] = runtime.tempHp;
      if (Object.keys(hpPatch).length) {
        // Do this after the HP adjustment effect is embedded. PF2e prepares the
        // actor again when that effect is created, and a fresh actor otherwise
        // retains the system default current HP (the source of low fresh-import HP).
        // Use Foundry's normal nested update here. A forced full-diff update can
        // leave a freshly prepared actor with its system-derived current HP
        // instead of the WG value, while also making this write more sensitive
        // to prepared-system changes.
        await actor.update(hpPatch, { render: false });
      }
    }
    // Focus resources are independent of HP. Some valid WG exports omit
    // content.max_hp, but their focus spells still require initializing the
    // PF2e pool (for example a level-1 Champion at 1/1).
    const focusPatch = focusResourcePatch(plan, runtime, existing);
    if (focusPatch) await actor.update(focusPatch, { render: false });
  } catch (err) {
    stopPrompts();
    closeChoicePrompts();
    const rb = await rollback({ actor, snapshot, createdActor, createdWorld, createdFolder });
    err.rollback = rb;
    throw err;
  } finally { stopPrompts(); }
  const parityResult = parity ? parityCheck(plan, summarizeActor(actor)) : null;
  p.coverage = auditImportCoverage(exp, { ...plan, entries: matched }, { applied: true, grantedSlugs: grantedSlugsOf(actor), choiceUsed: p.ctx.used, choiceConflicts: p.ctx.conflicts, slug: sluggify });
  return { actor, parity: parityResult, existing };
}

function hpEffect(wgMaxHp, computed, delta) {
  return {
    name: "Wanderer's Guide HP Adjustment",
    type: "effect",
    img: "icons/svg/regen.svg",
    system: {
      description: { value: `<p>Wanderer's Guide max HP is ${wgMaxHp}; PF2e computed ${computed}. This effect adds ${delta} so they match. Re-import recalculates it. Source: WG export content.max_hp.</p>` },
      rules: [{ key: "FlatModifier", selector: "hp", value: delta, label: "Wanderer's Guide HP adjustment" }],
      duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
      tokenIcon: { show: false },
    },
    flags: { [MODULE_ID]: { kind: "hp-adjust", wgContentId: null, computed, wgMaxHp, sourcePath: "content.max_hp" } },
  };
}

function closeChoicePrompts() {
  for (const app of foundry.applications?.instances?.values?.() ?? []) if (Array.isArray(app.choices) && typeof app.close === "function") app.close();
}

/** Undo a failed apply. Restores the snapshot in place (no item create workflow, so no PF2e prompts or re-grants). */
async function rollback({ actor, snapshot, createdActor, createdWorld, createdFolder }) {
  const out = { restored: false, backup: null, removedWorld: 0 };
  try {
    if (createdActor) { await createdActor.delete(); out.restored = true; }
    else if (actor && snapshot) {
      await actor.update({ name: snapshot.name, img: snapshot.img, prototypeToken: snapshot.prototypeToken, system: snapshot.system, items: snapshot.items, effects: snapshot.effects, flags: snapshot.flags }, { diff: false, recursive: false, render: false });
      const want = new Set(snapshot.items.map((i) => i._id));
      out.restored = actor.items.size === want.size && actor.items.every((i) => want.has(i.id));
      if (!out.restored) throw new Error("restored item set differs from snapshot");
    }
  } catch (e) {
    // Keep a recoverable copy rather than lose the pre-import state.
    try {
      const data = foundry.utils.deepClone(snapshot);
      delete data._id;
      data.name = `${snapshot.name} (WG backup)`;
      data.flags = { ...(data.flags ?? {}), [MODULE_ID]: { backupOf: actor?.id ?? null } };
      out.backup = (await Actor.create(data))?.id ?? null;
    } catch (e2) { out.backupError = e2.message; }
    out.restoreError = e.message;
  }
  for (const w of createdWorld) { try { await w.delete(); out.removedWorld++; } catch { /* keep going */ } }
  if (createdFolder && !createdFolder.contents?.length) await createdFolder.delete().catch(() => {});
  return out;
}

/**
 * Import one WG export. `confirm(planResult)` must resolve true before anything is written; returning
 * false cancels with no changes. Without a confirm callback the plan is applied directly.
 */
export async function importCharacter(exp, { host, onStep = () => {}, parity = false, confirm = null, failAfter = null }) {
  const step = (s) => { console.debug(`${MODULE_ID} | ${s}`); onStep(s); };
  const p = await planImport(exp, { host });
  step("plan");
  if (!p.valid) throw new Error(`plan invalid, nothing written: ${p.problems.join("; ")}`);
  if (confirm && !(await confirm(p))) {
    step("cancelled");
    return { cancelled: true, actor: p.actor, misses: p.misses, notes: p.notes, plan: p.plan };
  }
  const { actor, parity: parityResult } = await applyImport(p, { onStep: step, parity, failAfter });
  const { plan, matched, misses, notes } = p;
  const duplicateDiagnostics = duplicateItemDiagnostics(actor.items);
  const duplicateHtml = duplicateDiagnostics.length
    ? `<p>Duplicate-name diagnostics:</p><ul>${duplicateDiagnostics.map((d) => `<li>${esc(d.key)}: ${d.expectedGrantPair ? "expected PF2e grant relationship" : "unexpected duplicate; review provenance"}</li>`).join("")}</ul>`
    : "";
  await ChatMessage.create({
    whisper: [game.user.id],
    content: `<h3>WG import: ${esc(plan.name)}</h3><p>${matched.length - misses.length} matched, ${misses.length} created as homebrew or missed.</p>${misses.length ? `<ul>${misses.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}${notes.length ? `<p>Choices:</p><ul>${notes.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}${p.ctx.unresolved.length ? `<p>Unresolved choices:</p><ul>${p.ctx.unresolved.map((u) => `<li>${esc(u.owner)}${u.flag ? ` [${esc(u.flag)}]` : ""}: ${esc(u.reason)}</li>`).join("")}</ul>` : ""}${p.warnings.length ? `<p><strong>Warnings:</strong></p><ul>${p.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}${duplicateHtml}${parityResult ? parityHtml(plan.name, parityResult) : ""}${coverageHtml(p.coverage)}`,
  });
  return { actor, misses, notes, warnings: p.warnings, unresolved: p.ctx.unresolved, coverage: p.coverage, matched: matched.length - misses.length, parity: parityResult };
}
