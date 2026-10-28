// Regression tests for docs/RESOLVED_CHOICES.md. Every assertion cites WG export evidence from the
// sanitized fixtures in test/fixtures/pcs (selection key, value, content id / computed *_IDS).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifySelections, parseSelectionKey } from "../scripts/selections.js";
import { auditImportCoverage } from "../scripts/coverage.js";
import { buildPlan, wgChoiceHints, matchChoice } from "../scripts/mapping.js";

const pc = (id) => JSON.parse(readFileSync(new URL(`./fixtures/pcs/${id}.json`, import.meta.url)));
const get = (r, k) => (r instanceof Map ? r.get(k) : r[k]);
const SEL = "character.operation_data.selections.";

test("parseSelectionKey follows WG's ${scope}_${opId}[-N][_${parentValue}] shape (AMBA wgSelectionKey)", () => {
  const p = parseSelectionKey("class-feature-31082_3b6ac969-4dac-4647-96f4-0f133a169f77_31818");
  assert.equal(p.reader, "31818");
});

test("inactive-nested: PC 63 key ..._31818 = 31817 has no reading select op and 31817 is not in WG FEAT_IDS", () => {
  const e = pc(63);
  const k = "class-feature-31082_3b6ac969-4dac-4647-96f4-0f133a169f77_31818";
  assert.equal(e.character.operation_data.selections[k], "31817");
  assert.ok(!e.content.raw_data_dump.variables.FEAT_IDS.value.map(String).includes("31817"));
  const c = get(classifySelections(e), k);
  assert.equal(c.status, "dropped");
  assert.equal(c.category, "inactive-nested");
});

test("language: ancestry_957ee14b…-0 = 673 is TANUKI in WG LANGUAGE_IDS (PC 63) and 902 = PAHTRA (PC 64)", () => {
  const a = get(classifySelections(pc(63)), "ancestry_957ee14b-c6dc-44eb-881b-e99a1b4e5118-0");
  assert.deepEqual([a.status, a.category], ["included", "language"]);
  assert.match(a.reason, /673 = TANUKI/);
  const b = get(classifySelections(pc(64)), "ancestry_957ee14b-c6dc-44eb-881b-e99a1b4e5118-1");
  assert.match(b.reason, /902 = PAHTRA/);
});

test("attribute-option: background select values are adjValue ATTRIBUTE_* option ids", () => {
  for (const [id, key, val, attr] of [
    [63, "background_5b1ccf92-ae92-419a-8c69-826a0b00d71f", "b4534dca-667d-44b7-8fef-3ccbb7ece8fc", "ATTRIBUTE_STR"],
    [64, "background_77716721-c318-4dc4-9f09-2feb206fcd00", "ca495819-a0b7-4ffb-a004-6d563daaf288", "ATTRIBUTE_WIS"],
    [66, "background_b45f0fc2-ca52-4d47-83fb-5d00e2c8ccc5", "808ee9f7-7d16-48d7-b24a-e26951eafe85", "ATTRIBUTE_WIS"],
    [71, "background_0b62c294-14a5-49cc-a5d5-3d67dfeb021b", "646ec7b7-d426-4d8a-b0c0-1fac0be9f641", "ATTRIBUTE_CHA"],
  ]) {
    const e = pc(id);
    assert.equal(e.character.operation_data.selections[key], val);
    const c = get(classifySelections(e), key);
    assert.deepEqual([c.status, c.category], ["included", "attribute-option"], `PC ${id}`);
    assert.ok(c.reason.includes(attr), `PC ${id} ${attr}`);
  }
});

test("Voice of Nature (PC 66): option 0ddfce1c → ability block 20412 Plant Empathy becomes a ChoiceSet hint", () => {
  const e = pc(66);
  const k = "class-feature-21217_f78123ba-0c0a-4a65-8de5-f33d5523257c";
  assert.equal(e.character.operation_data.selections[k], "0ddfce1c-23f8-48bb-ab0e-b46f0362f823");
  assert.deepEqual(wgChoiceHints(e).get("voice-of-nature"), ["Plant Empathy"]);
  // PF2e classfeature Voice of Nature (d5BFFHXFJYKs5LXr) ChoiceSet: Animal Empathy / Plant Empathy
  assert.equal(matchChoice(["Animal Empathy", "Plant Empathy"], ["Plant Empathy"]), 1);
  const cov = auditImportCoverage(e, buildPlan(e), { applied: true, choiceUsed: new Set([k]) });
  const row = cov.rows.find((r) => r.path === SEL + k);
  assert.equal(row.status, "mapped");
});

test("Specialty Crafting under Web Weaver (PC 64): WG Woodworking vs PF2e fixed 'weaving' → documented exception", () => {
  const e = pc(64);
  const k = "ancestry-section-491735390724817_9f26290c-a2db-4c45-9b34-5053e60c106d-1_29476_9a604abf-0883-4211-9d4e-9aede390de8a_dc582144-1fc5-4af9-b319-c1d310f28185";
  assert.equal(e.character.operation_data.selections[k], "3b3b3378-43c0-4490-bd2e-365ea9bc38de");
  const c = get(classifySelections(e), k);
  assert.match(c.reason, /Specialty Crafting: WG chose Woodworking/);
  const conflicts = new Map([[k, "Web Weaver (CUrxG9CzT1hSfuhP) preselects specialtyCrafting=weaving"]]);
  const cov = auditImportCoverage(e, buildPlan(e), { applied: true, choiceUsed: new Set([k]), choiceConflicts: conflicts });
  const row = cov.rows.find((r) => r.path === SEL + k);
  assert.ok(row, "row present");
  assert.match(row.reason, /exception pf2e-fixed-choice/);
});

test("PC 91 nested Witch choices are included only when WG exports concrete descendants", () => {
  const e = pc(91);
  const familiarSpell = "class-feature-21170_f01737dd-b596-4d66-81f3-faa63b5b9d45";
  const tradition = "ancestry-section-5742419753466526_3fd6a268-771b-49fc-93ed-9b53695d1a29_20760_e28776c1-9de7-4032-97c4-dcd39030280e";
  const familiar = get(classifySelections(e), familiarSpell);
  const nested = get(classifySelections(e), tradition);
  assert.deepEqual([familiar.status, familiar.category], ["included", "spell-choice"]);
  assert.deepEqual([nested.status, nested.category], ["included", "nested-derived"]);
  assert.match(nested.reason, /4890/);
});

test("no PC fixture has an unresolved selection without a classified reason", () => {
  for (const id of [63, 64, 66, 71, 72, 74, 76, 78]) {
    const e = pc(id);
    const cov = auditImportCoverage(e, buildPlan(e));
    for (const r of cov.rows.filter((x) => x.status === "unresolved")) assert.doesNotMatch(r.reason, /review manually/, `PC ${id} ${r.path}`);
  }
});



