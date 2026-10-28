import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, matchEntries, missReport } from "../scripts/mapping.js";
import { customItemData, translateOp, customItemsHtml, descriptionHtml, needsTraitCatalog, homebrewSourceIds } from "../scripts/custom-items.js";

// PC 98 "Quill Hollowmere" on local WGUI: 7 FWI test items (source 907) plus Lantern of Last Echoes (source 905).
const exp = JSON.parse(readFileSync(new URL("./fixtures/custom-items-98.json", import.meta.url), "utf8"));
const ODDITY_UUID = "Compendium.pf2e.feats-srd.Item.oddity";
const plan = buildPlan(exp);
const custom = plan.entries.filter((e) => e.custom);
const byName = (n) => exp.content.inventory_flat.find((i) => i.item.name === n);
const traits = new Map(exp.content.all_traits.map((t) => [t.id, t.name]));
const look = {
  traitName: (id) => traits.get(id) ?? null,
  abilityUuid: (type, id) => (type === "feat" && id === 20375 ? ODDITY_UUID : null),
  linkUuid: (kind, id) => (kind === "feat" && id === 20375 ? ODDITY_UUID : null),
  spellCovered: (id, type) => (type === "INNATE" && exp.content.innate_spells.some((s) => s.spell_id === id) ? "innate" : null),
  languagesCovered: true,
};
const build = (n) => customItemData(byName(n), look);

test("homebrew sources and custom entries come from all_sources user_id", () => {
  assert.deepEqual([...homebrewSourceIds(exp.content)].sort(), [905, 907]);
  assert.equal(custom.length, 8);
  const m = matchEntries(custom, [{ type: "equipment", slug: "fwi-oddity-tome", name: "FWI Oddity Tome", uuid: "x" }]);
  assert.ok(m.every((e) => e.match === null && e.via === "custom"), "custom items never match a compendium item by name");
  assert.deepEqual(missReport(m), []);
  assert.ok(custom.every((e) => e.wgInvId && e.customInv));
});

test("Lantern of Last Echoes: type, stats, GrantItem, covered innate spell, description", () => {
  const { data, report } = build("Lantern of Last Echoes");
  assert.equal(data.type, "equipment");
  assert.equal(data.system.level.value, 2);
  assert.equal(data.system.traits.rarity, "uncommon");
  assert.deepEqual(data.system.traits.value, ["occult"]);
  assert.deepEqual(data.system.price.value, { gp: 30 });
  assert.equal(data.system.bulk.value, 0.1);
  assert.equal(data.system.usage.value, "held-in-one-hand");
  assert.deepEqual(data.system.equipped, { carryType: "held", handsHeld: 1 });
  assert.deepEqual(data.system.rules, [], "PF2e rejects GrantItem on physical items");
  const give = report.ops.find((o) => o.type === "giveAbilityBlock");
  assert.equal(give.status, "covered"); assert.equal(give.uuid, ODDITY_UUID);
  assert.deepEqual(translateOp(give.raw, { ...look, physical: false }).rule, { key: "GrantItem", uuid: ODDITY_UUID, allowDuplicate: false });
  assert.equal(report.ops.find((o) => o.type === "giveSpell").status, "covered");
  assert.match(data.system.description.value, /Final Glimmer/);
  assert.match(data.system.description.value, /@UUID\[Compendium\.pf2e\.feats-srd\.Item\.oddity\]\{Oddity Identification\}/);
  assert.ok(!data.system.description.value.includes("\\n"), "no literal \\n");
  const f = data.flags["foundry-wanderersguide-import"];
  assert.equal(f.customItem, true); assert.equal(f.wgItemId, 23470); assert.equal(f.wgSourceId, 905); assert.equal(f.wgInvId, byName("Lantern of Last Echoes").id);
});

test("bonuses, resistances, senses, speeds and hp become rule elements", () => {
  assert.deepEqual(build("FWI Climber's Grip Gloves").data.system.rules, [{ key: "FlatModifier", selector: "athletics", type: "item", value: 1, label: "FWI Climber's Grip Gloves" }]);
  const charm = build("FWI Emberward Charm").data.system.rules;
  assert.deepEqual(charm[0], { key: "Resistance", type: "fire", value: 5 });
  assert.equal(charm[1].selector, "reflex");
  assert.equal(charm[2].key, "Note"); assert.match(charm[2].text, /against fire effects/);
  const lenses = build("FWI Owl-Eye Lenses").data.system.rules;
  assert.deepEqual(lenses.slice(0, 2), [{ key: "Sense", selector: "darkvision", acuity: "precise" }, { key: "Sense", selector: "scent", acuity: "imprecise", range: 30 }]);
  const ank = build("FWI Windstride Anklets");
  assert.deepEqual(ank.data.system.rules.map((r) => [r.key, r.selector, r.value]), [["FlatModifier", "land-speed", 5], ["BaseSpeed", "swim", 15], ["FlatModifier", "hp", 3]]);
  assert.equal(ank.report.ops.find((o) => o.type === "giveLanguage").status, "covered");
});

test("unmappable operations are unresolved with the raw op, never guessed", () => {
  const { data, report } = build("FWI Oddity Tome");
  const un = report.ops.filter((o) => o.status === "unresolved");
  assert.deepEqual(un.map((o) => o.type).sort(), ["conditional", "giveTrait", "injectText", "sendNotification"]);
  assert.ok(un.every((o) => o.raw && o.raw.data));
  assert.deepEqual(data.system.rules, [{ key: "ActiveEffectLike", mode: "upgrade", path: "system.skills.stealth.rank", value: 1 }]);
  assert.equal(data.flags["foundry-wanderersguide-import"].wgUnresolvedOps.length, 4);
  assert.equal(translateOp({ type: "addBonusToValue", data: { variable: "SKILL_LORE_SAILING", value: 1, type: "item" } }).status, "unresolved");
  assert.equal(translateOp({ type: "addBonusToValue", data: { variable: "AC_BONUS", value: 1, type: "circumstance", text: "vs ranged" } }).status, "unresolved");
  assert.equal(translateOp({ type: "giveAbilityBlock", data: { type: "feat", abilityBlockId: 1 } }).status, "unresolved");
});

test("weapon and armor stats", () => {
  const g = build("FWI Starfall Glaive").data;
  assert.equal(g.type, "weapon");
  assert.deepEqual([g.system.category, g.system.group, g.system.damage, g.system.runes.potency], ["martial", "polearm", { dice: 1, die: "d10", damageType: "slashing" }, 1]);
  assert.deepEqual(g.system.traits.value, ["reach", "forceful"]);
  const a = build("FWI Duskweave Coat").data;
  assert.equal(a.type, "armor");
  assert.deepEqual([a.system.category, a.system.group, a.system.acBonus, a.system.dexCap, a.system.checkPenalty, a.system.strength], ["light", "leather", 2, 3, -1, 1]);
});

test("traits missing from the export are reported; slim exports trigger the full fetch", () => {
  const { data, report } = customItemData(byName("FWI Starfall Glaive"), { ...look, traitName: () => null });
  assert.deepEqual(data.system.traits.value, []);
  assert.equal(report.traits.unresolved.length, 2);
  assert.equal(needsTraitCatalog(exp), false);
  assert.equal(needsTraitCatalog({ ...exp, content: { ...exp.content, all_traits: [] } }), true);
});

test("foundry rules in meta_data pass through; report section lists every op", () => {
  const inv = { id: "x", item: { id: 1, name: "Rules Item", group: "GENERAL", operations: [], meta_data: { foundry: { rules: [{ key: "RollOption", option: "x" }] } } } };
  assert.deepEqual(customItemData(inv).data.system.rules, [{ key: "RollOption", option: "x" }]);
  const html = customItemsHtml(exp.content.inventory_flat.map((i) => customItemData(i, look).report));
  assert.match(html, /<h4>Custom items<\/h4>/);
  assert.match(html, /Unresolved \(not applied\)/);
  assert.match(html, /sendNotification/);
  assert.equal(descriptionHtml("a <b>\n\nb [x](link_trait_9)"), "<p>a &lt;b&gt;</p><p>b x</p>");
});
