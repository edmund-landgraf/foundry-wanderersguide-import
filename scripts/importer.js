// Foundry-side import. Uses Foundry/PF2e globals (game, Actor, Item, Folder, ChatMessage).
import { MODULE_ID, HOMEBREW_FOLDER } from "./constants.js";
import { buildPlan, matchEntries, missReport } from "./mapping.js";

const PACK_TYPES = new Set(["ancestry", "heritage", "background", "class", "feat", "spell", "weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "kit"]);

let indexCache = null;
async function compendiumIndex() {
  if (indexCache) return indexCache;
  const rows = [];
  for (const pack of game.packs.filter((p) => p.documentName === "Item")) {
    const idx = await pack.getIndex({ fields: ["system.slug", "system.level.value", "type"] });
    for (const e of idx) {
      if (!PACK_TYPES.has(e.type)) continue;
      rows.push({ type: e.type, slug: e.system?.slug ?? null, name: e.name, level: e.system?.level?.value ?? null, uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}` });
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

export async function importCharacter(exp, { host }) {
  const plan = buildPlan(exp);
  const matched = matchEntries(plan.entries, await compendiumIndex());
  const misses = missReport(matched);
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
  await actor.update(forced);

  // ABC first, then the rest (PLAN 5).
  const order = ["ancestry", "heritage", "background", "class", "feat", "spell", "equipment"];
  const sorted = [...matched].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const kind of order) {
    const batch = [];
    for (const e of sorted.filter((x) => x.kind === kind)) {
      try { batch.push(await itemDataFor(e, folder.id)); } catch (err) { misses.push(`${e.kind}: ${e.name} (error: ${err.message})`); }
    }
    if (batch.length) await actor.createEmbeddedDocuments("Item", batch, { render: false });
  }

  if (plan.maxHp != null) {
    // TODO(PLAN 7.2): add a flagged HP adjustment effect when PF2e's computed max differs.
    await actor.update({ "system.attributes.hp.value": plan.maxHp });
  }
  // TODO(PLAN 7.3, milestone 7): parity check against the export.

  await ChatMessage.create({
    whisper: [game.user.id],
    content: `<h3>WG import: ${foundry.utils.escapeHTML?.(plan.name) ?? plan.name}</h3><p>${matched.length - misses.length} matched, ${misses.length} created as homebrew or missed.</p>${misses.length ? `<ul>${misses.map((m) => `<li>${m}</li>`).join("")}</ul>` : ""}`,
  });
  return { actor, misses };
}
