// Foundry-side import. Uses Foundry/PF2e globals (game, Actor, Item, Folder, ChatMessage).
import { MODULE_ID, HOMEBREW_FOLDER } from "./constants.js";
import { buildPlan, matchEntries, missReport, sluggify, resolveImageUrl, FALLBACK_IMG, wgChoiceHints, matchChoice, defaultFlag, spellcastingPlan, entryKeyFor, diffPlan, parityCheck } from "./mapping.js";

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
    spellcasting: slots,
  };
}

export function preservedCurrentHp(state, newMaxHp, existing) {
  if (!existing) return newMaxHp;
  if (state?.currentHp == null || newMaxHp == null) return null;
  return Math.max(0, Math.min(Number(state.currentHp), Number(newMaxHp)));
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
// on an item we create, or on an item granted by its GrantItem rules, we look up the WG answer for
// the feature with the same name and write it into the rule source (rule.selection +
// flags.pf2e.rulesSelections, or GrantItem.preselectChoices) so PF2e never prompts. Anything we
// cannot resolve still falls back to the prompt auto-answer below.
function choiceContext(exp, plan, index) {
  const hints = wgChoiceHints(exp);
  const global = [...exportNames(exp), ...plan.entries.map((e) => e.name)];
  const uuidName = new Map(index.map((r) => [r.uuid, r.name]));
  return { hints, global, index, uuidName, specific: (owner) => hints.get(sluggify(owner)) ?? [] };
}

async function resolveChoiceSet(rule, ownerName, ctx) {
  const specific = ctx.specific(ownerName);
  const c = rule.choices;
  if (Array.isArray(c)) {
    const opts = c.map((o) => {
      const value = typeof o === "object" ? o.value : o;
      const label = (typeof o === "object" && o.label ? game.i18n.localize(o.label) : null) ?? (typeof value === "string" ? ctx.uuidName.get(value) : null) ?? String(value);
      return { value, label: typeof value === "string" && ctx.uuidName.has(value) ? ctx.uuidName.get(value) : label };
    });
    for (const [hints, via] of [[specific, "WG selection"], [ctx.global, "WG name"]]) {
      if (!hints.length) continue;
      let i = matchChoice(opts.map((o) => o.label), hints);
      if (i < 0) i = matchChoice(opts.map((o) => String(o.value)), hints);
      if (i >= 0) return { value: opts[i].value, label: opts[i].label, via };
    }
    return null;
  }
  if (c && typeof c === "object" && Array.isArray(c.filter)) {
    const tags = c.filter.filter((f) => typeof f === "string" && f.startsWith("item:tag:")).map((f) => f.slice(9));
    const traits = c.filter.filter((f) => typeof f === "string" && f.startsWith("item:trait:")).map((f) => f.slice(11));
    if (!tags.length && !traits.length) return null;
    const type = c.itemType ?? "feat";
    for (const [hints, via] of [[specific, "WG selection"], [ctx.global, "WG name"]]) {
      for (const h of hints) {
        const rows = ctx.index.filter((r) => r.type === type && matchChoice([r.name], [h]) === 0)
          .sort((a, b) => (sluggify(a.name) === sluggify(h) ? -1 : 0) - (sluggify(b.name) === sluggify(h) ? -1 : 0)).slice(0, 8);
        for (const r of rows) {
          const doc = await fromUuid(r.uuid);
          const t = doc?.system?.traits ?? {};
          if (tags.every((x) => (t.otherTags ?? []).includes(x)) && traits.every((x) => (t.value ?? []).includes(x))) return { value: r.uuid, label: r.name, via };
        }
      }
    }
  }
  return null;
}

async function prefillChoices(data, ctx, notes) {
  const rules = data.system?.rules;
  if (!Array.isArray(rules)) return;
  for (const rule of rules) {
    if (rule?.key === "ChoiceSet" && rule.selection == null) {
      const hit = await resolveChoiceSet(rule, data.name, ctx);
      if (!hit) continue;
      rule.selection = hit.value;
      const flag = rule.flag ?? defaultFlag(data.name);
      foundry.utils.setProperty(data, `flags.pf2e.rulesSelections.${flag}`, hit.value);
      notes.push(`choice ${data.name}: ${hit.label} (pre-filled from ${hit.via})`);
    } else if (rule?.key === "GrantItem" && typeof rule.uuid === "string" && rule.uuid.startsWith("Compendium.")) {
      const granted = await fromUuid(rule.uuid).catch(() => null);
      for (const gr of granted?.system?.rules ?? []) {
        if (gr?.key !== "ChoiceSet" || gr.selection != null) continue;
        const flag = gr.flag ?? defaultFlag(granted.name);
        if (rule.preselectChoices?.[flag] != null) continue;
        const hit = await resolveChoiceSet(gr, granted.name, ctx);
        if (!hit) continue;
        rule.preselectChoices = { ...(rule.preselectChoices ?? {}), [flag]: hit.value };
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
  if (["ancestry", "heritage", "background", "class", "feat"].includes(entry.kind)) await prefillChoices(data, ctx, notes);
  return data;
}

// PF2e opens a ChoiceSet prompt (PickAThingPrompt, e.g. "Muses") while ancestry/class/feat items are
// created, and item creation awaits it. Class features granted by the class item cannot be pre-filled
// from outside, so while importing we answer prompts from the WG export: first WG's own selection for
// the prompting feature (operation_data.selections), then any WG feature/feat name; otherwise close
// the prompt and report it.
export function pickChoice(labels, hintNames) {
  const hints = hintNames.map((n) => sluggify(n));
  for (const [i, label] of labels.entries()) {
    const l = sluggify(label);
    if (!l) continue;
    if (hints.some((h) => h === l || h.startsWith(`${l}-`) || h.endsWith(`-${l}`))) return i;
  }
  return -1;
}

function exportNames(exp) {
  const out = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { if (typeof v.name === "string") out.push(v.name); Object.values(v).forEach((x) => (x && typeof x === "object" ? walk(x) : null)); } };
  walk(exp?.content?.feats_features ?? {});
  return out;
}

function autoAnswerPrompts(ctx, notes) {
  const seen = new Set();
  const tick = () => {
    for (const app of foundry.applications?.instances?.values?.() ?? []) {
      if (seen.has(app) || !Array.isArray(app.choices) || typeof app.resolveSelection !== "function") continue;
      if (!app.rendered) continue;
      seen.add(app);
      const labels = app.choices.map((c) => c.label ?? "");
      const owner = app.item?.name ?? app.options?.item?.name ?? "";
      const specific = ctx.specific(owner);
      let i = specific.length ? matchChoice(labels, specific) : -1;
      const via = i >= 0 ? "WG selection" : "WG name";
      if (i < 0) i = pickChoice(labels, ctx.global);
      // PickAThingPrompt resolves its pending promise with app.selection on close (button and select-menu UIs alike).
      if (i >= 0) { notes.push(`choice ${app.title}: ${app.choices[i].label} (prompt answered from ${via})`); app.selection = app.choices[i]; app.close(); }
      else { notes.push(`choice ${app.title}: unresolved (skipped)`); app.close(); }
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
  const plan = buildPlan(exp);
  const matched = matchEntries(plan.entries, await compendiumIndex());
  const actor = findActor(plan, host);
  return { plan, diff: diffPlan(plan, summarizeActor(actor)), misses: missReport(matched), actor };
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
  const ctx = choiceContext(exp, plan, index);
  const actor = findActor(plan, host) ?? null;
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
  for (const e of matched) if (e.kind === "spell") e.entryId = entryIds[entryKeyFor(e)] ?? (e.focus || e.innate ? null : Object.values(entryIds)[0] ?? null);
  // Build every item's data now; homebrew world items are only described here and created on apply.
  for (const e of matched) {
    try { e.data = await itemDataFor(e, null, ctx, notes); }
    catch (err) { problems.push(`${e.kind}: ${e.name} (${err.message})`); }
  }
  const diff = diffPlan(plan, summarizeActor(actor));
  const homebrew = matched.filter((e) => !e.match && e.data);
  return { exp, plan, host, index, ctx, matched, misses, notes, problems, actor, entryData, diff, homebrew, valid: problems.length === 0 };
}

export function reviewHtml(p) {
  const li = (xs) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>none</p>");
  return `${diffHtml(p.plan, p.diff, p.misses)}`
    + (p.homebrew.length ? `<p>World homebrew items to create or reuse (folder "${esc(HOMEBREW_FOLDER)}"):</p>${li(p.homebrew.map((e) => `${e.kind}: ${e.name}`))}` : "")
    + (p.notes.length ? `<p>Choices:</p>${li(p.notes)}` : "")
    + (p.problems.length ? `<p><strong>Plan problems (import blocked):</strong></p>${li(p.problems)}` : "");
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
  const stopPrompts = autoAnswerPrompts(p.ctx, notes);
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
      const batch = [];
      // Only items created by this run count as "already present"; old managed items are about to go.
      const fresh = actor.items.filter((i) => !old.has(i.id) && i.type !== "spellcastingEntry");
      const have = new Set(fresh.map((i) => sluggify(i.name)));
      for (const e of matched.filter((x) => x.kind === kind && x.data)) {
        if (kind !== "equipment" && kind !== "spell" && (have.has(sluggify(e.name)) || (kind === "feat" && [...have].some((h) => sluggify(e.name).startsWith(`${h}-`))))) { const k = misses.findIndex((m) => m === `${e.kind}: ${e.name}`); if (k >= 0) misses.splice(k, 1); continue; }
        if (kind === "spell") {
          const g = fresh.find((i) => i.type === "spell" && sluggify(i.name) === sluggify(e.name));
          if (g) { if (e.entryId && g.system.location?.value !== e.entryId) await g.update({ "system.location.value": e.entryId }); const k = misses.findIndex((m) => m === `${e.kind}: ${e.name}`); if (k >= 0) misses.splice(k, 1); continue; }
        }
        batch.push(foundry.utils.deepClone(e.data));

      }
      step(`build ${kind} ${batch.length}`);
      await createItems(batch);
      step(`created ${kind}`);
    }
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
      if (Object.keys(hpPatch).length) await actor.update(hpPatch);
    }
  } catch (err) {
    stopPrompts();
    closeChoicePrompts();
    const rb = await rollback({ actor, snapshot, createdActor, createdWorld, createdFolder });
    err.rollback = rb;
    throw err;
  } finally { stopPrompts(); }
  const parityResult = parity ? parityCheck(plan, summarizeActor(actor)) : null;
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
  await ChatMessage.create({
    whisper: [game.user.id],
    content: `<h3>WG import: ${esc(plan.name)}</h3><p>${matched.length - misses.length} matched, ${misses.length} created as homebrew or missed.</p>${misses.length ? `<ul>${misses.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}${notes.length ? `<p>Choices:</p><ul>${notes.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}${parityResult ? parityHtml(plan.name, parityResult) : ""}`,
  });
  return { actor, misses, notes, matched: matched.length - misses.length, parity: parityResult };
}