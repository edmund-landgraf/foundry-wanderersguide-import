// Chosen-spell fixtures: WG test PCs 80 (Summoner, spontaneous primal repertoire) and 81 (Necromancer,
// prepared occult list), with real spells picked through the wgui-mcp spell tools and exported from WG.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, spellcastingPlan, entryKeyFor, spellSlotWarnings, preparedSlotUpdates, spellListSource } from "../scripts/mapping.js";

const load = (id) => JSON.parse(readFileSync(new URL(`./fixtures/pcs/${id}.json`, import.meta.url)));
const spellsOf = (plan) => plan.entries.filter((e) => e.kind === "spell");
const placed = (plan) => spellsOf(plan).map((e) => `${e.name}|${e.rank}|${entryKeyFor(e)}${e.prepared ? `|prepared ${e.prepared}` : ""}`).sort();

test("80 Veshka: every repertoire spell lands on the Summoner entry at its rank", () => {
  const exp = load(80);
  const sp = spellcastingPlan(exp);
  const summoner = sp.find((e) => e.key === "src:SUMMONER");
  assert.deepEqual([summoner.mode, summoner.tradition, summoner.ability], ["spontaneous", "primal", "cha"]);
  assert.deepEqual(summoner.slots, { 0: 5, 1: 1 });
  const got = placed(buildPlan(exp));
  for (const want of [
    "Tangle Vine|0|src:SUMMONER",
    "Electric Arc|0|src:SUMMONER",
    "Detect Magic|0|src:SUMMONER",
    "Light|0|src:SUMMONER",
    "Guidance|0|src:SUMMONER",
    "Fear|1|src:SUMMONER",
  ]) assert.ok(got.includes(want), `${want} in ${got.join(", ")}`);
  // Link spells stay on the focus entry.
  assert.ok(got.includes("Boost Eidolon|1|focus:SUMMONER"));
  assert.ok(got.includes("Evolution Surge|1|focus:SUMMONER"));
  assert.deepEqual(spellSlotWarnings(exp, buildPlan(exp).entries), []);
});

test("81 Morrow: prepared spells come from spell_slots onto the Necromancer entry and its slots", () => {
  const exp = load(81);
  const sp = spellcastingPlan(exp);
  const necro = sp.find((e) => e.key === "src:NECROMANCER");
  assert.deepEqual([necro.mode, necro.tradition, necro.ability], ["prepared", "occult", "int"]);
  assert.deepEqual(necro.slots, { 0: 5, 1: 1 });
  const plan = buildPlan(exp);
  const got = placed(plan);
  for (const want of [
    "Void Warp|0|src:NECROMANCER|prepared 1",
    "Daze|0|src:NECROMANCER|prepared 1",
    "Telekinetic Projectile|0|src:NECROMANCER|prepared 1",
    "Detect Magic|0|src:NECROMANCER|prepared 1",
    "Shield|0|src:NECROMANCER|prepared 1",
    "Grim Tendrils|1|src:NECROMANCER|prepared 1",
    "Harm|1|src:NECROMANCER",
  ]) assert.ok(got.includes(want), `${want} in ${got.join(", ")}`);
  for (const f of ["Create Thrall", "Thrall Charge", "Necrotic Bomb", "Bone Spear"]) assert.ok(got.some((g) => g.startsWith(`${f}|`) && g.includes("focus:NECROMANCER")), f);
  assert.deepEqual(spellSlotWarnings(exp, plan.entries), []);

  // Slot fill: one update for the entry, cantrips in slot0 and Grim Tendrils in slot1.
  const entries = spellsOf(plan).map((e, i) => ({ ...e, entryId: entryKeyFor(e) === "src:NECROMANCER" ? "necro" : "other", itemId: `item${i}` }));
  const [upd, ...rest] = preparedSlotUpdates(entries);
  assert.equal(rest.length, 0);
  assert.equal(upd._id, "necro");
  const name = (id) => entries.find((e) => e.itemId === id).name;
  assert.deepEqual(upd["system.slots.slot0.prepared"].map((s) => name(s.id)).sort(), ["Daze", "Detect Magic", "Shield", "Telekinetic Projectile", "Void Warp"]);
  assert.deepEqual(upd["system.slots.slot1.prepared"].map((s) => name(s.id)), ["Grim Tendrils"]);
  assert.ok(upd["system.slots.slot1.prepared"].every((s) => s.expended === false));
});

test("a spell prepared twice at the same rank is one item in two slots", () => {
  const exp = load(81);
  const slots = exp.content.spell_slots.map((s) => ({ ...s }));
  const daze = slots.find((s) => s.spell?.name === "Daze");
  const voidWarp = slots.find((s) => s.spell?.name === "Void Warp");
  Object.assign(voidWarp, { spell_id: daze.spell_id, spell: daze.spell });
  const plan = buildPlan({ ...exp, content: { ...exp.content, spell_slots: slots } });
  const dazes = spellsOf(plan).filter((e) => e.name === "Daze");
  assert.equal(dazes.length, 1);
  assert.equal(dazes[0].prepared, 2);
  const [upd] = preparedSlotUpdates(dazes.map((e) => ({ ...e, entryId: "n", itemId: "d" })));
  assert.deepEqual(upd["system.slots.slot0.prepared"], [{ id: "d", expended: false }, { id: "d", expended: false }]);
});

test("cleric divine font Heal slots are prepared on the cleric entry", () => {
  const exp = load(81);
  const cleric = {
    ...exp,
    content: {
      ...exp.content,
      spell_sources: [{ source: { name: "CLERIC", type: "PREPARED", tradition: "DIVINE", attribute: "ATTRIBUTE_WIS" } }, { source: { name: "CLERIC_DIVINE_FONT", type: "PREPARED", tradition: "DIVINE", attribute: "ATTRIBUTE_WIS" } }],
      spell_slots: [
        { source: "CLERIC", rank: 1, spell_id: 1, spell: { id: 1, name: "Bless" } },
        { source: "CLERIC_DIVINE_FONT", rank: 1, spell_id: 2, spell: { id: 2, name: "Heal" } },
        { source: "CLERIC_DIVINE_FONT", rank: 1, spell_id: 2, spell: { id: 2, name: "Heal" } },
        { source: "CLERIC_DIVINE_FONT", rank: 1, spell_id: 2, spell: { id: 2, name: "Heal" } },
        { source: "CLERIC_DIVINE_FONT", rank: 1, spell_id: 2, spell: { id: 2, name: "Heal" } },
      ],
      spells: { all: [] },
      focus_spells: [],
      innate_spells: [],
    },
  };
  assert.equal(spellListSource("CLERIC_DIVINE_FONT"), "CLERIC");
  const plan = buildPlan(cleric);
  const entries = spellcastingPlan(cleric);
  assert.equal(entries.some((e) => e.source === "CLERIC_DIVINE_FONT"), false);
  assert.deepEqual(entries.find((e) => e.source === "CLERIC").slots, { 1: 5 });
  const heal = spellsOf(plan).find((e) => e.name === "Heal");
  assert.equal(heal.castingSource, "CLERIC");
  assert.equal(heal.prepared, 4);
  assert.ok(placed(plan).includes("Bless|1|src:CLERIC|prepared 1"));
});

test("import report warns when a slotted caster has no spells from its source", () => {
  const e80 = load(80);
  const bare80 = { ...e80, content: { ...e80.content, spells: { ...e80.content.spells, all: [] } } };
  const w80 = spellSlotWarnings(bare80, buildPlan(bare80).entries);
  assert.equal(w80.length, 1);
  assert.match(w80[0], /Summoner Spells: 6 spell slots but no spells from WG source SUMMONER/);

  // 81 before spells were chosen: empty slots. Granted Harm alone does not count as a preparation.
  const e81 = load(81);
  const empty = e81.content.spell_slots.map(({ spell_id, spell, ...rest }) => rest);
  const bare81 = { ...e81, content: { ...e81.content, spell_slots: empty } };
  const w81 = spellSlotWarnings(bare81, buildPlan(bare81).entries);
  assert.equal(w81.length, 1);
  assert.match(w81[0], /Necromancer Spells: 6 spell slots but no prepared spells from WG source NECROMANCER/);
});
