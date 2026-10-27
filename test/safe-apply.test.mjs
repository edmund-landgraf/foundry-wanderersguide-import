import test from "node:test";
import assert from "node:assert/strict";
import { managedTree } from "../scripts/importer.js";

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
import { explicitGrants, sameThing } from "../scripts/importer.js";
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