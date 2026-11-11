import test from "node:test";
import assert from "node:assert/strict";
import { grantFixedChoice, validChoiceIndex, watchPrompts, takenOnceFilter, suppressWarnings } from "../scripts/importer.js";

// PC 111 live test (2026-11-11): Mastermind's skill ChoiceSet stores a data path, and WG's answer list
// for the racket also carries the key attribute. The report listed this as a conflict although
// PF2e picked the same skill WG did.
test("Mastermind skill path selection matches WG's skill answer", () => {
  assert.equal(grantFixedChoice(["Occultism", "Intelligence"], ["system.skills.occultism.rank"], "Mastermind"), false);
  assert.equal(grantFixedChoice(["Occultism"], ["system.skills.occultism"], "Mastermind"), false);
  assert.equal(grantFixedChoice(["Arcana", "Intelligence"], ["system.skills.occultism.rank"], "Mastermind"), true, "a different skill is still a real conflict");
  assert.equal(grantFixedChoice(["Occult"], ["system.skills.occultism.rank"], "Mastermind"), true, "no partial skill-name match");
});

test("validChoiceIndex rejects null, negatives and out-of-range indexes", () => {
  const choices = [{ label: "A" }, { label: "B" }];
  assert.equal(validChoiceIndex(null, choices), null);
  assert.equal(validChoiceIndex(undefined, choices), null);
  assert.equal(validChoiceIndex(-1, choices), null);
  assert.equal(validChoiceIndex(2, choices), null);
  assert.equal(validChoiceIndex(1, choices), 1);
  assert.equal(validChoiceIndex(0, []), null);
});

// PC 111: the Clan Weapon prompt's owner (Clan Dagger) has WG answers, none of which is an option.
// ctx.pick returned null and `null >= 0` sent tick() into app.choices[null].value.
test("prompt with WG answers but no fitting option is left for the user without throwing", async () => {
  const warnings = [];
  const prevFoundry = globalThis.foundry, prevUi = globalThis.ui;
  const app = { rendered: true, title: "Clan Weapon", item: { name: "Clan Dagger", flags: {} }, choices: [{ label: "Clan Dagger", value: "Compendium.pf2e.x.Item.a" }, { label: "Clan Pistol (Ancestry Feat)", value: "Compendium.pf2e.x.Item.b" }], closed: 0, close() { this.closed++; } };
  globalThis.foundry = { applications: { instances: new Map([["a", app]]) } };
  globalThis.ui = { notifications: { warn: (m) => warnings.push(m) } };
  const ctx = { unresolved: [], previous: new Map(), resolvedChoices: new Map(), specific: () => ["Some Other Answer"], pick: () => null };
  const notes = [];
  const errors = [];
  const onErr = (e) => errors.push(e);
  process.on("uncaughtException", onErr);
  const stop = watchPrompts(ctx, notes);
  try {
    await new Promise((r) => setTimeout(r, 450));
  } finally {
    stop();
    process.off("uncaughtException", onErr);
    globalThis.foundry = prevFoundry; globalThis.ui = prevUi;
  }
  assert.deepEqual(errors, []);
  assert.equal(app.selection, undefined, "nothing was guessed");
  assert.equal(ctx.unresolved.length, 1);
  assert.equal(ctx.unresolved[0].owner, "Clan Dagger");
  assert.match(ctx.unresolved[0].reason, /no explicit WG answer/);
  assert.deepEqual(warnings, ["Wanderer's Guide import needs your choice: Clan Weapon"]);
  assert.deepEqual(notes, []);
});

test("takenOnceFilter matches only PF2e's warning for replaced items on this actor", () => {
  const f = takenOnceFilter(null, new Set(["Mug", "Twin Feint"]), "Sable Knucklebone");
  assert.equal(f("Mug may only be taken once, but Sable Knucklebone has selected it an additional time."), true);
  assert.equal(f("Twin Feint may only be taken once, but Sable Knucklebone has selected it an additional time."), true);
  assert.equal(f("Brutal Beating may only be taken once, but Sable Knucklebone has selected it an additional time."), false, "not a replaced item");
  assert.equal(f("Mug may only be taken once, but Someone Else has selected it an additional time."), false, "other actor");
  assert.equal(f("Wanderer's Guide import needs your choice: Mug"), false);
  assert.equal(takenOnceFilter(null, new Set(), "Sable")("Mug may only be taken once, but Sable has selected it an additional time."), false, "fresh import suppresses nothing");
});

test("takenOnceFilter uses PF2e's localized template", () => {
  const i18n = { has: (k) => k === "PF2E.Item.Feat.Warning.TakenMoreThanOnce", localize: () => "{actor} hat {item} (nur einmal) erneut gewählt." };
  const f = takenOnceFilter(i18n, new Set(["Mug (Rogue)"]), "Sable K.");
  assert.equal(f("Sable K. hat Mug (Rogue) (nur einmal) erneut gewählt."), true);
  assert.equal(f("Sable X. hat Mug (Rogue) (nur einmal) erneut gewählt."), false);
});

test("suppressWarnings drops matching warnings, passes others, and restores", () => {
  const seen = [];
  class Notifications { warn(m) { seen.push(m); return "shown"; } }
  const n = new Notifications();
  const restore = suppressWarnings(n, (m) => m === "drop me");
  assert.equal(n.warn("drop me"), null);
  assert.equal(n.warn("keep me"), "shown");
  restore();
  assert.equal(Object.prototype.hasOwnProperty.call(n, "warn"), false, "prototype method restored");
  n.warn("drop me");
  assert.deepEqual(seen, ["keep me", "drop me"]);
  assert.doesNotThrow(() => suppressWarnings(undefined, () => true)());
});
