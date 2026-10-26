// Foundry-side import. Uses Foundry/PF2e globals (game, Actor, Item, Folder, ChatMessage).
import { MODULE_ID, HOMEBREW_FOLDER } from "./constants.js";
import { buildPlan, matchEntries, missReport, sluggify } from "./mapping.js";

const PACK_TYPES = new Set(["ancestry", "heritage", "background", "class", "feat", "spell", "weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "kit"]);

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
async function homebrewFolder() {
  return game.folders.find((f) => f.type === "Item" && f.name === HOMEBREW_FOLDER)
    ?? Folder.create({ name: HOMEBREW_FOLDER, type: "Item" });
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

async function itemDataFor(entry, folderId) {
  let data;
  if (entry.match) {
    const doc = await fromUuid(entry.match.uuid);
    data = doc.toObject();
    delete data._id;
  } else {
    // Homebrew / unmatched: reuse or create a world item (PLAN section 9).
    let world = game.items.find((i) => i.getFlag(MODULE_ID, "wgContentId") === entry.wgContentId && entry.wgContentId != null);
    if (!world) world = await Item.create(homebrewItemData(entry, folderId));
    data = world.toObject();
    delete data._id;
  }
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULE_ID]: { wgContentId: entry.wgContentId ?? null, kind: entry.kind } });
  if (entry.kind === "equipment" && data.system) {
    data.system.quantity = entry.quantity ?? 1;
    // TODO(PLAN 6, milestone 6): split composed names into base + runes/material.
  }
  if (entry.kind === "spell" && data.system && entry.rank != null) {
    // TODO(PLAN 6, milestone 6): spellcasting entries, heightening, focus/innate placement.
    data.system.location = { ...(data.system.location ?? {}), heightenedLevel: entry.rank || undefined };
  }
  // TODO(PLAN 7.2, milestone 5): pre-fill flags.pf2e.rulesSelections from the export so no ChoiceSet prompts.
  return data;
}

// PF2e opens a ChoiceSet prompt (PickAThingPrompt, e.g. "Muses") while ancestry/class/feat items are
// created, and item creation awaits it. Unattended, that hung the import forever. While importing we
// answer prompts from the WG export: pick the choice whose label matches a WG feature/feat name
// ("Polymath" <- "Polymath Muse"); otherwise close the prompt and report it.
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

function autoAnswerPrompts(hintNames, notes) {
  const seen = new Set();
  const tick = () => {
    for (const app of foundry.applications?.instances?.values?.() ?? []) {
      if (seen.has(app) || !Array.isArray(app.choices) || typeof app.resolveSelection !== "function") continue;
      if (!app.rendered) continue;
      seen.add(app);
      const i = pickChoice(app.choices.map((c) => c.label ?? ""), hintNames);
      // PickAThingPrompt resolves its pending promise with app.selection on close (button and select-menu UIs alike).
      if (i >= 0) { notes.push(`choice ${app.title}: ${app.choices[i].label}`); app.selection = app.choices[i]; app.close(); }
      else { notes.push(`choice ${app.title}: unresolved (skipped)`); app.close(); }
    }
  };
  const timer = setInterval(tick, 200);
  return () => clearInterval(timer);
}

export async function importCharacter(exp, { host, onStep = () => {} }) {
  const step = (s) => { console.debug(`${MODULE_ID} | ${s}`); onStep(s); };
  const plan = buildPlan(exp);
  step("plan");
  const index = await compendiumIndex();
  step(`index ${index.length}`);
  const matched = matchEntries(plan.entries, index);
  const misses = missReport(matched);
  step("match");
  const folder = await homebrewFolder();

  let actor = game.actors.find((a) => a.getFlag(MODULE_ID, "wgId") === plan.wgId && a.getFlag(MODULE_ID, "host") === host);
  const forced = {
    name: plan.name,
    "system.details.level.value": plan.level,
    "system.details.languages.value": plan.languages,
    // Forced values from WG (PLAN 7.2). Attributes are set as manual modifiers.
    "system.build.attributes.manual": true,
    ...Object.fromEntries(Object.entries(plan.attributes).map(([k, v]) => [`system.abilities.${k}.mod`, v])),
  };
  if (!actor) {
    actor = await Actor.create({
      name: plan.name,
      type: "character",
      ownership: { default: 0, [game.user.id]: 3 },
      flags: { [MODULE_ID]: { wgId: plan.wgId, host } },
    });
  } else {
    // Update: remove only items this module created (PLAN 8); Foundry-only state is kept.
    const ours = actor.items.filter((i) => i.getFlag(MODULE_ID, "wgContentId") !== undefined || i.getFlag(MODULE_ID, "kind")).map((i) => i.id);
    if (ours.length) await actor.deleteEmbeddedDocuments("Item", ours);
    // TODO(PLAN 8, milestone 9): dry-run diff before writing.
  }
  const notes = [];
  const stopPrompts = autoAnswerPrompts([...exportNames(exp), ...plan.entries.map((e) => e.name)], notes);
  try {
  step("actor");
  await actor.update(forced);
  step("forced");

  // ABC first, then the rest (PLAN 5).
  const order = ["ancestry", "heritage", "background", "class", "feat", "spell", "equipment"];
  const sorted = [...matched].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const kind of order) {
    const batch = [];
    // Skip entries PF2e already granted (class features, muse, etc.) so they are neither duplicated nor reported as misses.
    const have = new Set(actor.items.map((i) => sluggify(i.name)));
    for (const e of sorted.filter((x) => x.kind === kind)) {
      if (kind !== "equipment" && (have.has(sluggify(e.name)) || (kind === "feat" && [...have].some((h) => sluggify(e.name).startsWith(`${h}-`))))) { const k = misses.findIndex((m) => m === `${e.kind}: ${e.name}`); if (k >= 0) misses.splice(k, 1); continue; }
      try { batch.push(await itemDataFor(e, folder.id)); } catch (err) { misses.push(`${e.kind}: ${e.name} (error: ${err.message})`); }
    }
    step(`build ${kind} ${batch.length}`);
    if (batch.length) await actor.createEmbeddedDocuments("Item", batch, { render: false });
    step(`created ${kind}`);
  }

  } finally { stopPrompts(); }

  if (plan.maxHp != null) {
    // TODO(PLAN 7.2): add a flagged HP adjustment effect when PF2e's computed max differs.
    await actor.update({ "system.attributes.hp.value": plan.maxHp });
  }
  // TODO(PLAN 7.3, milestone 7): parity check against the export.

  await ChatMessage.create({
    whisper: [game.user.id],
    content: `<h3>WG import: ${foundry.utils.escapeHTML?.(plan.name) ?? plan.name}</h3><p>${matched.length - misses.length} matched, ${misses.length} created as homebrew or missed.</p>${misses.length ? `<ul>${misses.map((m) => `<li>${m}</li>`).join("")}</ul>` : ""}${notes.length ? `<p>Choices:</p><ul>${notes.map((m) => `<li>${m}</li>`).join("")}</ul>` : ""}`,
  });
  return { actor, misses, notes, matched: matched.length - misses.length };
}
