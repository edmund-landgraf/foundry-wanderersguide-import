import test from "node:test";
import assert from "node:assert/strict";
import { choiceContext, resolveChoiceSet } from "../scripts/importer.js";
import { wgChoiceHints, selectedKeyAttributeAnswers } from "../scripts/mapping.js";
import { auditImportCoverage } from "../scripts/coverage.js";

// Minimal operation shapes from the PC 110/111 class-test scenarios. These
// are focused regressions, separate from the eight existing golden PCs.
const feature = (id, name, op, options) => ({ id, name, operations: [{ id: op, type: "select", data: { optionsPredefined: options } }] });
const thesis = feature(10, "Experimental Spellshaping", "thesis-op", [{ id: "reach", title: "Reach Spell" }, { id: "widen", title: "Widen Spell" }]);
const school = feature(20, "School of Unified Magical Theory", "school-op", [{ id: "counter", title: "Counterspell" }]);
const exp = () => ({ character: { details: {}, operation_data: { selections: { "class-feature-10_thesis-op-0": "reach", "class-feature-10_thesis-op-1": "widen", "class-feature-20_school-op": "counter", "class-feature-10_thesis-op_widen": "reach" } } }, content: { feats_features: { classFeatures: [thesis, school] } } });
const index = ["Reach Spell", "Widen Spell", "Counterspell"].map((name, i) => ({ name, uuid: "Compendium.test.Item." + i, type: "feat" }));
const rule = { choices: { filter: ["item:trait:wizard"] } };

test("Wizard repeated sub-picks retain Reach and Widen in order, excluding history", () => {
  assert.deepEqual(wgChoiceHints(exp()).byId.get("10"), ["Reach Spell", "Widen Spell"]);
});

test("filtered thesis picks consume distinct answers by stable owner ID", async () => {
  const original = globalThis.fromUuid;
  globalThis.fromUuid = async () => ({ type: "feat", system: { traits: { value: ["wizard"] } } });
  try {
    const ctx = choiceContext(exp(), {}, index, null);
    const a = await resolveChoiceSet(rule, thesis.name, ctx, { ownerWgId: 10 });
    const b = await resolveChoiceSet(rule, thesis.name, ctx, { ownerWgId: 10 });
    assert.deepEqual([a.label, b.label], ["Reach Spell", "Widen Spell"]);
    assert.equal(await resolveChoiceSet(rule, thesis.name, ctx, { ownerWgId: 10 }), null);
    const c = await resolveChoiceSet(rule, school.name, ctx, { ownerWgId: 20 });
    assert.equal(c.label, "Counterspell");
  } finally { globalThis.fromUuid = original; }
});

test("an explicit current answer blocks stale fallback even when it is unavailable", async () => {
  const ctx = choiceContext(exp(), {}, index, null);
  ctx.previous.set("school-source", { feat: "widen" });
  const opts = { choices: [{ value: "widen", label: "Widen Spell" }] };
  assert.equal(await resolveChoiceSet(opts, school.name, ctx, { ownerWgId: 20, sourceUuid: "school-source", flag: "feat" }), null);
  const legacy = choiceContext({ character: {}, content: {} }, {}, index, null);
  legacy.previous.set("school-source", { feat: "widen" });
  assert.equal((await resolveChoiceSet(opts, school.name, legacy, { sourceUuid: "school-source", flag: "feat" })).value, "widen");
});

test("Rogue ledger marks only the key-attribute selection actually applied", () => {
  const e = exp();
  e.character.details.class = feature(25, "Rogue", "key-op", [{ id: "str", title: "Strength", operations: [{ type: "setValue", data: { variable: "CLASS_DC", value: { attribute: "ATTRIBUTE_STR" } } }] }]);
  e.character.operation_data.selections["class_key-op"] = "str";
  const answers = selectedKeyAttributeAnswers(e);
  assert.deepEqual(answers, [{ key: "class_key-op", attribute: "ATTRIBUTE_STR" }]);
  const row = (used) => auditImportCoverage(e, { entries: [] }, { applied: true, keyAbilityUsed: used }).rows.find(r => r.path.endsWith(".class_key-op"));
  assert.equal(row(new Set()).status, "unresolved");
  assert.equal(row(new Set([answers[0].key])).status, "mapped");
  assert.match(row(new Set([answers[0].key])).reason, /class key attribute/);
});


test("Counterspell variants are selected only through one legal PF2e choice", async () => {
  const original = globalThis.fromUuid;
  const variants = ["Prepared", "Spontaneous"].map(x => ({ name: "Counterspell (" + x + ")", type: "feat", uuid: x }));
  globalThis.fromUuid = async uuid => ({ type: "feat", system: { traits: { value: uuid === "Prepared" ? ["wizard"] : ["sorcerer"] } } });
  try {
    const ctx = choiceContext(exp(), {}, variants, null);
    const hit = await resolveChoiceSet(rule, school.name, ctx, { ownerWgId: 20 });
    assert.equal(hit.value, "Prepared");
    assert.deepEqual([...ctx.used], ["class-feature-20_school-op"]);
    const { reconcileRuntimeGrants } = await import("../scripts/importer.js");
    const entry = { kind: "feat", name: "Counterspell", slug: "counterspell", unresolved: "no match" };
    const granted = { item: { id: "granted", name: "Counterspell (Prepared)", type: "feat", _stats: { compendiumSource: "Prepared" }, system: { slug: "counterspell-prepared" } }, parent: { name: school.name } };
    reconcileRuntimeGrants([entry], [granted], [], null, ctx.resolvedChoices);
    assert.equal(entry.outcome, "granted");
    assert.equal(entry.unresolved, undefined);
    globalThis.fromUuid = async () => ({ type: "feat", system: { traits: { value: ["wizard"] } } });
    const ambiguous = choiceContext(exp(), {}, variants, null);
    assert.equal(await resolveChoiceSet(rule, school.name, ambiguous, { ownerWgId: 20 }), null);
  } finally { globalThis.fromUuid = original; }
});

test("consuming Reach does not report Widen or the school selection as consumed", async () => {
  const original = globalThis.fromUuid;
  globalThis.fromUuid = async () => ({ type: "feat", system: { traits: { value: ["wizard"] } } });
  try {
    const ctx = choiceContext(exp(), {}, index, null);
    await resolveChoiceSet(rule, thesis.name, ctx, { ownerWgId: 10 });
    assert.deepEqual([...ctx.used], ["class-feature-10_thesis-op-0"]);
  } finally { globalThis.fromUuid = original; }
});

test("installed catalog aliases and direct action matching cover issue 81/82 names", async () => {
  const { readFileSync } = await import("node:fs");
  const { checkCatalog, loadMatchCatalog, resetMatchCatalogCache } = await import("../scripts/match-catalog.js");
  const { matchEntries, sluggify } = await import("../scripts/mapping.js");
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/rogue-wizard-catalog.json", import.meta.url)));
  const checked = checkCatalog(fixture, "8.6.1");
  assert.equal(checked.status, "loaded");
  resetMatchCatalogCache();
  const loaded = await loadMatchCatalog({ systemVersion: "8.6.1", fetchImpl: async () => ({ ok: true, json: async () => fixture }) });
  const entries = ["Ruffian Racket", "Mastermind Racket", "Cantrip Expansion (Wizard)", "Drain Bonded Item"].map(name => ({kind: "feat", packType: "feat", name, slug: sluggify(name)}));
  const matched = matchEntries(entries, fixture.index, {catalog: loaded.catalog});
  assert.deepEqual(matched.map(e => e.match?.name), ["Ruffian", "Mastermind", "Cantrip Expansion", "Drain Bonded Item"]);
  assert.deepEqual(matched.map(e => e.via), ["catalog-alias", "catalog-alias", "catalog-alias", "slug"]);
  resetMatchCatalogCache();
});
