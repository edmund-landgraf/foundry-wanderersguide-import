import test from "node:test";
import assert from "node:assert/strict";
import { wgChoiceHints, rawVariableName, selectionKeyFor, selectedKeyAttribute, matchChoice } from "../scripts/mapping.js";
import { configChoices, choiceLabel, uniqueChoice, applyKeyAbilityData } from "../scripts/importer.js";

// Fixtures follow WG content defs read in the pretest (block ids / op shapes); no WG characters exist for these classes.
const feat = (id, name, ops) => ({ id, name, type: "class-feature", operations: ops });
const selectOp = (id, extra) => ({ id, type: "select", data: { title: "Select", ...extra } });
const exp = (features, selections, cls = null) => ({
  character: { operation_data: { selections }, details: { class: cls } },
  content: { feats_features: { classFeatures: features } },
});
const PF2E_8_6_1 = { weaponGroups: Object.fromEntries(["axe","brawling","club","dart","flail","hammer","knife","pick","polearm","shield","spear","sword","bomb","bow","corrosive","crossbow","cryo","firearm","flame","grenade","laser","mental","plasma","poison","projectile","shock","sling","sniper","sonic"].map((k) => [k, `PF2E.WeaponGroup${k[0].toUpperCase()}${k.slice(1)}`])) };

test("weapon group: WEAPON_GROUP_* answer names a PF2e weaponGroups option (Fighter Weapon Mastery)", () => {
  const e = exp([feat(20764, "Fighter Weapon Mastery", [selectOp("fwm-op", { modeType: "FILTERED", optionType: "ADJ_VALUE", optionsPredefined: [] })])],
    { "class-feature-20764_fwm-op": "WEAPON_GROUP_SWORD" });
  assert.deepEqual(wgChoiceHints(e).get("fighter-weapon-mastery"), ["Sword"]);
  const opts = configChoices("weaponGroups", PF2E_8_6_1).map((o) => ({ ...o, label: choiceLabel(o.label, o.value) }));
  const i = uniqueChoice(opts.map((o) => o.label), ["Sword"]);
  assert.equal(opts[i].value, "sword");
});

test("weapon group: laser and projectile exist in PF2e 8.6.1 CONFIG; unknown groups stay unresolved", () => {
  const opts = configChoices("weaponGroups", PF2E_8_6_1);
  for (const g of ["laser", "projectile"]) assert.ok(opts.some((o) => o.value === g));
  assert.equal(uniqueChoice(opts.map((o) => choiceLabel(o.label, o.value)), ["Boomerang"]), -1);
  assert.equal(rawVariableName("WEAPON_GROUP_SWORD"), "Sword");
  assert.equal(rawVariableName("SKILL_LORE_SAILING"), null);
  assert.equal(rawVariableName("ATTRIBUTE_DEX"), null);
});

test("configChoices leaves non-CONFIG string choices alone", () => {
  assert.equal(configChoices("flags.pf2e.whatever", PF2E_8_6_1), "flags.pf2e.whatever");
});

test("Barbarian dragon: WG option id -> WG option title -> PF2e PF2E.Dragon.* label", () => {
  const options = ["Adamantine", "Conspirator", "Diabolic", "Empyreal", "Fortune", "Horned", "Mirage", "Omen"].map((t, k) => ({ id: `dragon-opt-${k}`, type: "CUSTOM", title: t }));
  const e = exp([feat(31311, "Dragon Instinct", [selectOp("dr-op", { modeType: "PREDEFINED", optionType: "CUSTOM", optionsPredefined: options })])],
    { "class-feature-31311_dr-op": "dragon-opt-2" });
  const hints = wgChoiceHints(e).get("dragon-instinct");
  assert.deepEqual(hints, ["Diabolic"]);
  const pf = ["Adamantine", "Barrage", "Diabolic", "Empyreal"].map((n) => ({ label: `PF2E.Dragon.${n}`, value: { dragonType: n.toLowerCase() } }));
  const labels = pf.map((o) => choiceLabel(o.label, o.value));
  assert.equal(pf[uniqueChoice(labels, hints)].value.dragonType, "diabolic");
});

test("Path to Perfection: shared WG option ids still route each save to its own feature", () => {
  const saves = (ids) => ["Fortitude", "Reflex", "Will"].map((t, k) => ({ id: ids[k], type: "CUSTOM", title: t }));
  const shared = ["p-fort", "p-ref", "p-will"];
  const e = exp([
    feat(31263, "Path to Perfection", [selectOp("ptp1", { modeType: "PREDEFINED", optionType: "CUSTOM", optionsPredefined: saves(shared) })]),
    feat(31266, "Second Path to Perfection", [selectOp("ptp2", { modeType: "PREDEFINED", optionType: "CUSTOM", optionsPredefined: saves(shared) })]),
    feat(31269, "Third Path to Perfection", [selectOp("ptp3", { modeType: "PREDEFINED", optionType: "CUSTOM", optionsPredefined: saves(["t-fort", "t-ref", "t-will"]) })]),
  ], { "class-feature-31263_ptp1": "p-will", "class-feature-31266_ptp2": "p-fort", "class-feature-31269_ptp3": "t-will" });
  const h = wgChoiceHints(e);
  assert.deepEqual(h.byId.get("31263"), ["Will"]);
  assert.deepEqual(h.byId.get("31266"), ["Fortitude"]);
  assert.deepEqual(h.byId.get("31269"), ["Will"]);
  // PF2e 8.6.1 pathToPerfection values; unlocalized labels fall back to the value.
  const pf = ["fortitude", "reflex", "will"].map((v) => ({ value: v, label: choiceLabel(`PF2E.Saves${v}`, v) }));
  assert.equal(pf[matchChoice(pf.map((o) => o.label), h.byId.get("31266"))].value, "fortitude");
});

test("selection hygiene: exact key only; stray <key>_<oldValue> history entries are ignored", () => {
  const options = [{ id: "31313", title: "Animal Instinct" }, { id: "31314", title: "Dragon Instinct" }];
  const e = exp([feat(31305, "Instinct", [selectOp("inst-op", { optionsPredefined: options })])], {
    "class-feature-31305_inst-op": "31314",
    "class-feature-31305_inst-op_31314": "31313",
  });
  assert.deepEqual(wgChoiceHints(e).get("instinct"), ["Dragon Instinct"]);
});

test("selection hygiene: one op id under two blocks reads only the owner's key; unscoped duplicates are skipped", () => {
  const keys = ["class-feature-31263_op", "class-feature-31266_op"];
  assert.equal(selectionKeyFor(keys, "op", 31266), "class-feature-31266_op");
  assert.equal(selectionKeyFor(keys, "op", null), null);
  assert.equal(selectionKeyFor(["x_op"], "op"), "x_op");
  assert.equal(selectionKeyFor(["x_op_31314"], "op"), null);
});

test("key attribute: selected WG class option (CLASS_DC.attribute) fills the PF2e class keyAbility when raw_data_dump lacks it", () => {
  const opt = (id, a) => ({ id, type: "CUSTOM", title: a, operations: [{ type: "setValue", data: { variable: "CLASS_DC", value: { value: "T", attribute: `ATTRIBUTE_${a}` } } }] });
  const cls = { id: 20, name: "Fighter", operations: [selectOp("key-op", { modeType: "PREDEFINED", optionType: "CUSTOM", optionsPredefined: [opt("o-str", "STR"), opt("o-dex", "DEX")] })] };
  assert.equal(selectedKeyAttribute(exp([], { "class_key-op": "o-dex" }, cls)), "ATTRIBUTE_DEX");
  assert.equal(selectedKeyAttribute(exp([], {}, cls)), null);
  const data = { system: { keyAbility: { value: ["dex", "str"], selected: null } } };
  assert.equal(applyKeyAbilityData({ kind: "class", keyAbility: "dex" }, structuredClone(data)).system.keyAbility.selected, "dex");
  // never force an attribute the PF2e class does not offer
  assert.equal(applyKeyAbilityData({ kind: "class", keyAbility: "wis" }, structuredClone(data)).system.keyAbility.selected, null);
});
