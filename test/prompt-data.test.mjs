import { test } from "node:test";
import assert from "node:assert/strict";
import { spellcastingPlan, spellListSource } from "../scripts/mapping.js";
import { DOMAIN_PROMPT, DEITY_PROMPT, INNATE_ATTRIBUTE } from "../scripts/prompt-data.js";
import { domainPromptWithoutDeity, deityPromptChoice } from "../scripts/importer.js";

test("unknown spellcasting attribute is unresolved, not Charisma", () => {
  const exp = { content: { spell_sources: [{ source: { name: "WIZARD", type: "PREPARED-LIST", tradition: "ARCANE", attribute: "ATTRIBUTE_XYZ" } }, { source: { name: "BARD", type: "SPONTANEOUS-REPERTOIRE", tradition: "OCCULT", attribute: "ATTRIBUTE_CHA" } }], spell_slots: [], focus_spells: [{ id: 1, casting_source: "NOPE" }], innate_spells: [{ tradition: "DIVINE" }] } };
  const by = Object.fromEntries(spellcastingPlan(exp).map((e) => [e.key, e]));
  assert.equal(by["src:WIZARD"].ability, null);
  assert.match(by["src:WIZARD"].unresolved, /ATTRIBUTE_XYZ/);
  assert.equal(by["src:BARD"].ability, "cha");
  assert.equal(by["src:BARD"].unresolved, undefined);
  assert.equal(by["focus:NOPE"].ability, null);
  assert.match(by["focus:NOPE"].unresolved, /unknown spellcasting attribute/);
  assert.equal(by["innate:divine"].ability, INNATE_ATTRIBUTE);
});

test("divine font suffix and prompt data", () => {
  assert.equal(spellListSource("CLERIC_DIVINE_FONT"), "CLERIC");
  assert.equal(spellListSource("CLERIC"), "CLERIC");
  assert.ok(DOMAIN_PROMPT.test("Domain Initiate") && DOMAIN_PROMPT.test("domain focus") && DOMAIN_PROMPT.test("Advanced Domain") && !DOMAIN_PROMPT.test("Domain Fluency"));
  assert.ok(DEITY_PROMPT.test("Select a Deity"));
  assert.equal(domainPromptWithoutDeity({ title: "Domain Initiate", choices: [] }), true);
  assert.equal(deityPromptChoice({ title: "Deity", choices: [{ label: "Sarenrae" }, { label: "Iomedae" }] }, "Iomedae"), 1);
});

test("Advanced Domain prompt with no deity is closed like Domain Initiate", () => {
  assert.equal(domainPromptWithoutDeity({ title: "Advanced Domain", choices: [] }), true);
  assert.equal(domainPromptWithoutDeity({ item: { name: "Advanced Domain" }, choices: [] }), true);
  assert.equal(domainPromptWithoutDeity({ title: "Advanced Domain", choices: [{ label: "Fire" }] }), false);
});
