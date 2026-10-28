import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, matchEntries, diffPlan, parityCheck, choiceNameKeys } from "../scripts/mapping.js";
import { itemNameCandidates } from "../scripts/item-renames.js";
import { resolveFormula, mergeFormulas, extraItemIds, containerParents, assignContainers, formulasHtml, packOf } from "../scripts/formulas.js";
import { auditImportCoverage } from "../scripts/coverage.js";

const pip = JSON.parse(readFileSync(new URL("./fixtures/pcs/95.json", import.meta.url)));
const row = (type, name, pack, id, level = 1) => ({ type, name, slug: name.toLowerCase().replace(/['()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""), level, uuid: `Compendium.${pack}.Item.${id}` });
const SRD = "pf2e.equipment-srd", LEG = "pf2e-legacy-content.formulas-legacy";
const index = [
  row("weapon", "Acid Flask (Lesser)", LEG, "legacyAcid"),
  row("weapon", "Acid Flask (Lesser)", SRD, "acid"),
  row("weapon", "Alchemist's Fire (Lesser)", SRD, "fire"),
  row("consumable", "Antidote (Lesser)", SRD, "antidote"),
  row("consumable", "Elixir of Life (Minor)", SRD, "eol"),
  row("backpack", "Backpack", SRD, "backpack", 0),
  row("weapon", "Glue Bomb (Lesser)", SRD, "glue"),
  row("equipment", "Alchemist's Toolkit", SRD, "toolkit", 0),
];

test("item name candidates: exact, rename table, grade swap both ways", () => {
  assert.deepEqual(itemNameCandidates("Greater Acid Flask").map(([, n]) => n), ["Greater Acid Flask", "Acid Flask (Greater)"]);
  assert.deepEqual(itemNameCandidates("Antidote (Lesser)").map(([, n]) => n), ["Antidote (Lesser)", "Lesser Antidote"]);
  assert.ok(itemNameCandidates("Lesser Tanglefoot Bag").some(([v, n]) => v === "grade-swap+rename" && n === "Glue Bomb (Lesser)"));
  assert.deepEqual(itemNameCandidates("Alchemist's Tools")[1], ["rename", "Alchemist's Toolkit"]);
});

test("resolveFormula prefers pack order and keeps the matched type", () => {
  const r = resolveFormula({ kind: "formula", name: "Acid Flask (Lesser)", level: 1 }, index);
  assert.equal(r.match.uuid, `Compendium.${SRD}.Item.acid`);
  assert.equal(r.match.type, "weapon");
  assert.equal(packOf(r.match.uuid), SRD);
  assert.equal(resolveFormula({ kind: "formula", name: "Lesser Tanglefoot Bag" }, index).match.uuid, `Compendium.${SRD}.Item.glue`);
  assert.equal(resolveFormula({ kind: "formula", name: "Nope Elixir" }, index).via, "miss");
});

test("mergeFormulas keeps existing order and dedupes by UUID", () => {
  assert.deepEqual(mergeFormulas([{ uuid: "a" }, "b"], ["b", "c", "a"]), [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }]);
  assert.deepEqual(mergeFormulas(undefined, []), []);
});

test("Pip 95: formulas split out of the inventory, vial skipped, backpack parents", () => {
  const plan = buildPlan(pip);
  const f = plan.entries.filter((e) => e.kind === "formula").map((e) => e.name).sort();
  assert.deepEqual(f, ["Acid Flask (Lesser)", "Alchemist's Fire (Lesser)", "Antidote (Lesser)", "Elixir of Life (Minor)"]);
  const eq = plan.entries.filter((e) => e.kind === "equipment");
  assert.ok(!eq.some((e) => /Versatile Vial/.test(e.name)));
  const bag = eq.find((e) => e.name === "Backpack");
  const fire = eq.find((e) => e.name === "Alchemist's Fire (Lesser)");
  assert.ok(bag?.wgInvId && fire?.parentInvId === bag.wgInvId);
  assert.ok(extraItemIds(pip).size >= 0 && containerParents(pip).get(fire.wgInvId) === bag.wgInvId);

  const matched = matchEntries(plan.entries, index);
  const fm = matched.filter((e) => e.kind === "formula");
  assert.equal(fm.filter((e) => e.match).length, 4);
  assert.equal(fm.find((e) => e.name === "Alchemist's Fire (Lesser)").match.type, "weapon");
  // formulas are not inventory items: diff and parity ignore them
  assert.ok(!diffPlan(plan, { items: [] }).add.some((x) => x.startsWith("formula")));
  assert.ok(!parityCheck(plan, { items: [], attributes: {}, languages: [] }).failed.some((r) => r.check.startsWith("formula")));
  // every inventory_flat path still has a coverage row, formulas mapped
  const cov = auditImportCoverage(pip, { ...plan, entries: matched });
  for (let i = 0; i < pip.content.inventory_flat.length; i++) assert.ok(cov.rows.some((r) => r.path === `content.inventory_flat[${i}]`), `path ${i}`);
  assert.ok(cov.rows.filter((r) => /^formula -> /.test(r.reason)).length === 4);

  // containers: backpack gets an _id, fire points at it
  for (const e of matched) if (e.kind === "equipment" && e.match) e.data = { type: e.match.type, system: {} };
  let n = 0;
  const warn = assignContainers(matched, () => `id${++n}`);
  const mb = matched.find((e) => e.name === "Backpack"), mf = matched.find((e) => e.kind === "equipment" && e.name === "Alchemist's Fire (Lesser)");
  assert.deepEqual(warn, []);
  assert.equal(mf.data.system.containerId, mb.data._id);

  const html = formulasHtml(matched, plan);
  assert.match(html, /<h4>Formulas<\/h4><p>4\/4 formulas/);
});

test("research field feat name maps to the PF2e research field option", () => {
  assert.ok(choiceNameKeys("Bomber Research Field").includes("bomber"));
});

test("assignContainers leaves children loose when the parent is not a PF2e container", () => {
  const es = [{ kind: "equipment", name: "Pouch", wgInvId: "p", data: { type: "equipment" } }, { kind: "equipment", name: "Fire", wgInvId: "c", parentInvId: "p", data: { system: {} } }];
  assert.equal(assignContainers(es, () => "x").length, 1);
  assert.equal(es[1].data.system.containerId, undefined);
});
