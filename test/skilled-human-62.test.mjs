import test from "node:test";
import assert from "node:assert/strict";
import { wgChoiceHints } from "../scripts/mapping.js";
import { configChoices, uniqueChoice } from "../scripts/importer.js";

// #62: WG Skilled Human "Select a Skill" is a FILTERED ADJ_VALUE select with no
// predefined options; WG stores the raw variable (SKILL_STEALTH) as the answer.
const exp = (answer) => ({
  character: { operation_data: { selections: { "ancestry-section-1_abc_20753_op-1": answer } } },
  content: { feats_features: { heritages: [{ id: 20753, name: "Skilled Human", type: "heritage", operations: [{
    id: "c-1", type: "conditional", data: { trueOperations: [], falseOperations: [{
      id: "op-1", type: "select", data: { title: "Select a Skill", modeType: "FILTERED", optionType: "ADJ_VALUE", optionsPredefined: [] } }] } }] }] } },
});
// PF2e 8.6.1 Skilled Human: ChoiceSet { choices: { config: "skills" }, flag: "skill" }
const PF2E = { skills: Object.fromEntries(["acrobatics","arcana","athletics","crafting","deception","diplomacy","intimidation","medicine","nature","occultism","performance","religion","society","stealth","survival","thievery"].map((k) => [k, { label: k[0].toUpperCase() + k.slice(1) }])) };

test("#62 raw SKILL_* answer to a FILTERED select becomes a Skilled Human hint", () => {
  assert.deepEqual(wgChoiceHints(exp("SKILL_STEALTH")).get("skilled-human"), ["Stealth"]);
});

test("#62 lore and non-skill raw values are not turned into hints", () => {
  assert.equal(wgChoiceHints(exp("SKILL_LORE_SAILING")).get("skilled-human"), undefined);
  assert.equal(wgChoiceHints(exp("ATTRIBUTE_WIS")).get("skilled-human"), undefined);
});

test("#62 config-based ChoiceSet expands to CONFIG.PF2E skills and matches exactly one", () => {
  const opts = configChoices({ config: "skills" }, PF2E);
  assert.equal(opts.length, 16);
  const i = uniqueChoice(opts.map((o) => o.label), ["Stealth"]);
  assert.equal(opts[i].value, "stealth");
  assert.equal(uniqueChoice(opts.map((o) => o.label), []), -1); // no WG answer -> no guess
});

test("#62 non-config choices pass through unchanged", () => {
  const arr = [{ value: "a" }];
  assert.equal(configChoices(arr, PF2E), arr);
  assert.deepEqual(configChoices({ config: "missing" }, PF2E), { config: "missing" });
});
