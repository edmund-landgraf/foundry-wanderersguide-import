import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wgChoiceHints } from "../scripts/mapping.js";
import {
  choiceContext,
  uniqueFixedChoice,
  uniqueFeatOption,
  uniqueChoice,
  watchPrompts,
} from "../scripts/importer.js";

const exp81 = JSON.parse(readFileSync(new URL("./fixtures/pcs/81.json", import.meta.url)));

const CLAN_LABELS = ["Clan Dagger", "Clan Pistol (Ancestry Feat)"];
const SKILLS = ["Acrobatics", "Arcana", "Athletics", "Crafting", "Deception", "Diplomacy", "Intimidation", "Medicine", "Nature", "Occultism", "Performance", "Religion", "Society", "Stealth", "Survival", "Thievery"];

async function runPrompt(ctx, app, ms = 450) {
  const prevFoundry = globalThis.foundry, prevUi = globalThis.ui;
  globalThis.foundry = { applications: { instances: new Map([["a", app]]) } };
  globalThis.ui = { notifications: { warn: () => {} } };
  const notes = [];
  const stop = watchPrompts(ctx, notes);
  try { await new Promise((r) => setTimeout(r, ms)); }
  finally { stop(); globalThis.foundry = prevFoundry; globalThis.ui = prevUi; }
  return notes;
}

function app(title, owner, labels) {
  return {
    rendered: true,
    title,
    item: { name: owner },
    choices: labels.map((label) => ({ label, value: label })),
    close() { this.closed = true; },
  };
}

test("#22 PC 81 hints include Scholar Occultism and Assurance Occultism, and Clan Dagger is a fixed grant", () => {
  const hints = wgChoiceHints(exp81);
  assert.deepEqual(hints.get("scholar"), ["Int", "Occultism"]);
  assert.deepEqual(hints.get("assurance"), ["Occultism"]);
  const ctx = choiceContext(exp81, {}, [], null);
  assert.ok(ctx.fixedNames.has("clan-dagger"));
  assert.equal(uniqueFixedChoice(CLAN_LABELS, ctx.fixedNames), "Clan Dagger");
  assert.equal(uniqueFeatOption(CLAN_LABELS, ctx.featNames), null, "PC 81 has no Clan Pistol feat");
});

test("#22 Clan Pistol ancestry feat uniquely matches the parenthetical Clan Weapon option", () => {
  assert.equal(uniqueFeatOption(CLAN_LABELS, ["Clan Pistol"]), 1);
  assert.equal(uniqueFeatOption(CLAN_LABELS, ["Clan Dagger"]), 0);
  assert.equal(uniqueFeatOption(CLAN_LABELS, ["Clan Pistol", "Something Else"]), 1);
});

test("#22 the Clan Weapon prompt is answered Clan Dagger from the WG physical-feature grant", async () => {
  const ctx = choiceContext(exp81, {}, [], null);
  const prompt = app("Clan Weapon", "Clan Dagger", CLAN_LABELS);
  const notes = await runPrompt(ctx, prompt);
  assert.equal(prompt.selection?.label, "Clan Dagger");
  assert.equal(prompt.closed, true);
  assert.match(notes.join("\n"), /Clan Dagger \(prompt answered from WG fixed grant\)/);
  assert.equal(ctx.unresolved.length, 0);
});

test("#22 Clan Pistol feat wins over a leftover Clan Dagger physical-feature grant", async () => {
  const ctx = choiceContext(exp81, {}, [], null);
  ctx.featNames = ["Clan Pistol"];
  const prompt = app("Clan Weapon", "Clan Dagger", CLAN_LABELS);
  const notes = await runPrompt(ctx, prompt);
  assert.equal(prompt.selection?.label, "Clan Pistol (Ancestry Feat)");
  assert.match(notes.join("\n"), /WG feat/);
});

test("#22 Scholar skill prompt is answered Occultism", async () => {
  const ctx = choiceContext(exp81, {}, [], null);
  assert.equal(ctx.pick("Scholar", SKILLS), SKILLS.indexOf("Occultism"));
  const prompt = app("Select a Skill", "Scholar", SKILLS);
  const notes = await runPrompt(ctx, prompt);
  assert.equal(prompt.selection?.label, "Occultism");
  assert.match(notes.join("\n"), /Occultism \(prompt answered from WG selection\)/);
});

test("#22 Assurance prompt is answered Occultism", async () => {
  const ctx = choiceContext(exp81, {}, [], null);
  assert.equal(uniqueChoice(SKILLS, ctx.specific("Assurance")), SKILLS.indexOf("Occultism"));
  const prompt = app("Select a Skill", "Assurance", SKILLS);
  const notes = await runPrompt(ctx, prompt);
  assert.equal(prompt.selection?.label, "Occultism");
  assert.match(notes.join("\n"), /Occultism \(prompt answered from WG selection\)/);
});
