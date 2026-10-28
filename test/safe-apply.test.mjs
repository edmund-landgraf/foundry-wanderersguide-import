import test from "node:test";
import assert from "node:assert/strict";
import { managedTree, coverageHtml } from "../scripts/importer.js";

const M = "foundry-wanderersguide-import";
const item = (id, extra = {}) => ({ id, flags: extra.flags ?? {}, system: extra.system ?? {} });

test("managedTree: module items plus everything granted from them, nothing else", () => {
  const items = [
    item("cls", { flags: { [M]: { kind: "class" }, pf2e: { itemGrants: { x: { id: "viaParent" } } } } }),
    item("feat", { flags: { pf2e: { grantedBy: { id: "cls" } } } }),
    item("sub", { flags: { pf2e: { grantedBy: { id: "feat" } } } }),
    item("loc", { system: { location: "cls" } }),
    item("viaParent"),
    item("userAdded"),
    item("userChild", { flags: { pf2e: { grantedBy: { id: "userAdded" } } } }),
  ];
  assert.deepEqual([...managedTree(items)].sort(), ["cls", "feat", "loc", "sub", "viaParent"]);
});
import { applyKeyAbilityData, coverFeatureGaps, explicitGrants, sameThing, duplicateItemDiagnostics, focusResourcePatch, domainPromptWithoutDeity, deityPromptChoice, allChoiceHints, uniqueChoice } from "../scripts/importer.js";
test("dedupe: only explicit grants from this run's items, same compendium source", () => {
  const it = (id, type, name, src, extra = {}) => ({ id, type, name, _stats: { compendiumSource: src }, flags: extra.flags ?? {}, system: extra.system ?? {} });
  const items = [
    it("cls", "class", "Druid", "C:druid"),
    it("sbFeature", "feat", "Shield Block", "C:classfeatures.shieldBlock", { system: { location: "cls" }, flags: { pf2e: { itemGrants: { shieldBlock: { id: "sbFeat" } } } } }),
    it("sbFeat", "feat", "Shield Block", "C:feats.shieldBlock", { flags: { pf2e: { grantedBy: { id: "sbFeature" } } } }),
    it("ww", "feat", "Web Weaver", "C:feats.webWeaver", { flags: { pf2e: { itemGrants: { specialtyCrafting: { id: "scW" } } } } }),
    it("scW", "feat", "Specialty Crafting (Weaving)", "C:feats.specialtyCrafting", { flags: { pf2e: { grantedBy: { id: "ww" } } } }),
    it("oldGrant", "feat", "Toughness", "C:feats.toughness", { flags: { pf2e: { grantedBy: { id: "oldParent" } } } }),
    it("oldParent", "feat", "Old", "C:old"),
    it("userFeat", "feat", "Fleet", "C:feats.fleet"),
  ];
  const g = explicitGrants(items, new Set(["oldParent", "oldGrant"]));
  assert.deepEqual(g.map((x) => `${x.item.id}<-${x.parent.id}`).sort(), ["sbFeat<-sbFeature", "sbFeature<-cls", "scW<-ww"]);
  const e = (name, uuid, kind = "feat") => ({ kind, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), match: uuid ? { uuid, type: "feat" } : null });
  const hit = (entry) => g.find(({ item }) => sameThing(entry, item))?.item.id ?? null;
  assert.equal(hit(e("Shield Block", "C:feats.shieldBlock")), "sbFeat", "WG Shield Block = PF2e-granted Shield Block feat");
  assert.equal(hit(e("Specialty Crafting", "C:feats.specialtyCrafting")), "scW", "WG Specialty Crafting = Web Weaver's grant");
  assert.equal(hit(e("Toughness", "C:feats.toughness")), null, "grant from an old (non-run) parent does not count");
  assert.equal(hit(e("Fleet", "C:feats.fleet")), null, "an ungranted item never dedupes");
  assert.equal(hit(e("Shield", null)), null, "no prefix matching");
});

test("duplicate diagnostics distinguish a PF2e grant pair from an unexplained duplicate", () => {
  const pair = [
    { id: "feature", type: "feat", name: "Shield Block", system: {}, flags: {} },
    { id: "granted", type: "feat", name: "Shield Block", system: {}, flags: { pf2e: { grantedBy: { id: "feature" } } } },
  ];
  const unexplained = [
    { id: "a", type: "feat", name: "Shield Block", system: {}, flags: {} },
    { id: "b", type: "feat", name: "Shield Block", system: {}, flags: {} },
  ];
  assert.equal(duplicateItemDiagnostics(pair)[0].expectedGrantPair, true);
  assert.equal(duplicateItemDiagnostics(unexplained)[0].expectedGrantPair, false);

  const differentlyNamedGrant = [
    { id: "animist-feature", type: "feat", name: "Animist Apparition", system: {}, flags: { pf2e: { itemGrants: { tangleVine: { id: "tangle-vine-action" } } } } },
    { id: "tangle-vine-direct", type: "feat", name: "Tangle Vine", system: {}, flags: {} },
    { id: "tangle-vine-action", type: "feat", name: "Tangle Vine", system: {}, flags: { pf2e: { grantedBy: { id: "animist-feature" } } } },
  ];
  assert.equal(duplicateItemDiagnostics(differentlyNamedGrant)[0].expectedGrantPair, true);
});

test("Exemplar inventory is scheduled before class grants", () => {
  const source = rf(new URL("../scripts/importer.js", import.meta.url));
  assert.match(source, /const order = \["ancestry", "heritage", "background", "equipment", "class", "feat", "spell"\]/);
});

test("WG key ability populates the PF2e class-item selection", () => {
  const data = { system: { keyAbility: { value: [], selected: null } } };
  applyKeyAbilityData({ kind: "class", keyAbility: "cha" }, data);
  assert.deepEqual(data.system.keyAbility, { value: [], selected: "cha" });
  applyKeyAbilityData({ kind: "feat", keyAbility: "str" }, data);
  assert.equal(data.system.keyAbility.selected, "cha");
});

test("Cleric feature gaps are covered by PF2e grants", () => {
  const entries = [
    { name: "Divine Font (Healing)", match: { uuid: "Compendium.pf2e.classfeatures.Item.font" } },
    { name: "Domain Initiate (Luck)", match: { uuid: "Compendium.pf2e.classfeatures.Item.domain" } },
    { name: "Healing Font", match: null },
    { name: "Domains", match: null },
  ];
  coverFeatureGaps(entries, null, []);
  assert.equal(entries[2].coveredBy, "Divine Font (Healing)");
  assert.equal(entries[3].coveredBy, "Domain Initiate (Luck)");
});

test("Spark Transcendence is covered by Divine Spark and Ikons without a homebrew copy", () => {
  const entries = [
    { name: "Divine Spark and Ikons", match: { uuid: "Compendium.pf2e.classfeatures.Item.divine" } },
    { name: "Spark Transcendence", match: null },
  ];
  coverFeatureGaps(entries);
  assert.equal(entries[1].coveredBy, "Divine Spark and Ikons");
  assert.equal(entries[1].unresolved, undefined);

  const missing = [{ name: "Spark Transcendence", match: null }];
  coverFeatureGaps(missing);
  assert.match(missing[0].unresolved, /^PF2e gap:/);
});

test("focus resources initialize even when the export has no max HP", () => {
  assert.deepEqual(focusResourcePatch({ focusMax: 1 }, undefined, false), {
    "system.resources.focus.max": 1,
    "system.resources.focus.value": 1,
  });
  assert.deepEqual(focusResourcePatch({ focusMax: 1 }, { focus: { value: 2 } }, true), {
    "system.resources.focus.max": 1,
    "system.resources.focus.value": 1,
  });
  assert.equal(focusResourcePatch({ maxHp: 20 }, undefined, false), null);
});

test("a beliefs deity answers the cleric deity prompt when exactly one option matches", () => {
  const choices = [{ label: "Aakriti" }, { label: "Sarenrae" }, { label: "Abadar" }];
  assert.equal(deityPromptChoice({ title: "Deity (Cleric)", item: { name: "Deity (Cleric)" }, choices }, "Sarenrae"), 1);
  assert.equal(deityPromptChoice({ title: "Deity (Cleric)", choices }, ""), null);
  assert.equal(deityPromptChoice({ title: "Doctrine", choices }, "Sarenrae"), null);
  assert.equal(deityPromptChoice({ title: "Deity (Cleric)", choices: [{ label: "Sarenrae" }, { label: "Sarenrae" }] }, "Sarenrae"), null);
});

test("a different WG deity answers the Cleric deity prompt", () => {
  const choices = [{ label: "Desna" }, { label: "Abadar" }, { label: "Sarenrae" }];
  assert.equal(deityPromptChoice({ title: "Deity (Cleric)", choices }, "Desna"), 0);
});

test("domain prompts with no deity are closed instead of waited on", () => {
  assert.equal(domainPromptWithoutDeity({ title: "Domain Initiate", choices: [], item: { name: "Domain Initiate" } }), true);
  assert.equal(domainPromptWithoutDeity({ title: "Domain Focus", choices: [] }), true);
  assert.equal(domainPromptWithoutDeity({ title: "Doctrine", choices: [{ label: "Cloistered Cleric" }] }), false);
  assert.equal(domainPromptWithoutDeity({ title: "Domain Initiate", choices: [{ label: "Healing" }] }), false);
});

test("a longer WG doctrine name matches the shorter PF2e option", () => {
  const hints = new Map([["doctrine", ["Cloistered Cleric Doctrine"]], ["domain", ["Healing"]]]);
  const labels = ["Battle Creed", "Cloistered Cleric", "Warpriest"];
  assert.equal(uniqueChoice(labels, allChoiceHints(hints)), 1);
  assert.equal(uniqueChoice(["Healing", "Fire"], ["Healing", "Fire"]), -1);
});
import { auditImportCoverage, leftoverValues, CLASS_SUPPORT_NOTE } from "../scripts/coverage.js";
import { buildPlan, sluggify } from "../scripts/mapping.js";
import { readFileSync as rf } from "node:fs";
test("coverage ledger: every source path once, built from plan actions, classes experimental", () => {
  const exp = JSON.parse(rf(new URL("./fixtures/pcs/64.json", import.meta.url)));
  const plan = buildPlan(exp);
  assert.ok(plan.entries.every((e) => typeof e.sourcePath === "string"), "every plan entry cites its source path");
  const entries = plan.entries.map((e) => ({ ...e, match: { uuid: "U" }, outcome: e.name === "Specialty Crafting" ? "granted" : "created", grantedBy: "Web Weaver" }));
  const sc = entries.find((e) => e.name === "Specialty Crafting");
  const led = auditImportCoverage(exp, { ...plan, entries }, { applied: true, slug: sluggify });
  const paths = led.rows.map((r) => r.path);
  assert.equal(new Set(paths).size, paths.length, "no path counted twice");
  assert.ok(led.rows.every((r) => r.reason), "every status has a reason");
  assert.deepEqual(led.rows.find((r) => r.path === sc.sourcePath), { path: sc.sourcePath, status: "included", reason: "granted by PF2e via Web Weaver" });
  assert.equal(led.classSupport, CLASS_SUPPORT_NOTE);
  assert.match(CLASS_SUPPORT_NOTE, /experimental for every class/);
  // An entry that was planned but never applied is reported as dropped, not silently mapped.
  const lost = auditImportCoverage(exp, { ...plan, entries: entries.map((e) => (e === sc ? { ...e, outcome: undefined } : e)) }, { applied: true, slug: sluggify });
  assert.equal(lost.rows.find((r) => r.path === sc.sourcePath).status, "dropped");
  const left = leftoverValues(exp, led);
  assert.ok(Object.keys(left).length === led.counts["leftover-preserved"]);
  assert.equal(left["character.notes"], exp.character.notes);
});

test("coverage HTML keeps ledger paths and reasons visible", () => {
  const html = coverageHtml({
    counts: { mapped: 0, included: 0, unresolved: 1, "leftover-preserved": 1, dropped: 1 },
    rows: [
      { path: "content.foo", status: "unresolved", reason: "review manually" },
      { path: "content.bar", status: "leftover-preserved", reason: "kept in flags.wgLeftovers" },
      { path: "content.baz", status: "dropped", reason: "derived by PF2e" },
    ],
  });
  assert.match(html, /content\.foo: review manually/);
  assert.match(html, /content\.bar: kept in flags\.wgLeftovers/);
  assert.match(html, /content\.baz: derived by PF2e/);
  assert.doesNotMatch(html, /<code>/);
});
