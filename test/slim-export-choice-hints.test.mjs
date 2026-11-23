import test from "node:test";
import assert from "node:assert/strict";
import { domainNameForSpell, namedSpells, wgChoiceHints } from "../scripts/mapping.js";
import { DOMAIN_BY_SPELL_SLUG } from "../scripts/domain-spells.js";
import { needsTraitCatalog, unnamedOfficialSelectionIds } from "../scripts/custom-items.js";
import { choiceContext, watchPrompts, grantOrigin, exactUniqueHintIndex, allChoiceHints } from "../scripts/importer.js";
import { MODULE_ID } from "../scripts/constants.js";

// Faithful slim-shaped fixtures reconstructed from the Nov 22 #64 / #77 issue comments.
// Real slim dumps for PCs 103 and 109 were not on the box (evidence stays on DAEDALUS
// under D:\tmp\verify-20261122\). These keep the live ids, selection keys, and the
// slim shape (no content.all_traits / all_spells). They are not hand-built full exports.

const KEY = "11111111-2222-3333-4444-555555555555";
const flags = (wgContentId) => (wgContentId == null ? { flags: {} } : { flags: { [MODULE_ID]: { wgContentId } } });

const slim103 = () => ({
  version: 4,
  slim: { version: 1, dropped: { all_spells: 1, all_traits: 1 } },
  character: {
    id: 103,
    name: "Liesl Starwhisper",
    details: {
      class: { id: 22, name: "Cleric" },
      info: { beliefs: "Desna" },
    },
    operation_data: {
      selections: {
        // Doctrine-nested live key started with class-feature-21206_ and stored spell id 4413.
        "class-feature-21206_domain-select": 4413,
        "class-feature-deity_sanctification": "holy",
      },
    },
  },
  content: {
    feats_features: {
      classFeatures: [
        { id: 21206, name: "Domains", type: "class-feature", operations: [{ id: "domain-select", type: "select", data: { title: "Domain", optionsPredefined: [] } }] },
        { id: "deity", name: "Deity", type: "class-feature", operations: [{ id: "sanctification", type: "select", data: { title: "Sanctification", optionsPredefined: [{ id: "holy", title: "Holy" }, { id: "unholy", title: "Unholy" }] } }] },
      ],
    },
    focus_spells: [{ id: 4413, name: "Bit of Luck", rank: 1, casting_source: "CLERIC", traits: [2520] }],
  },
});

const slim109 = () => ({
  version: 4,
  slim: { version: 1, dropped: { all_spells: 1, all_traits: 1 } },
  character: {
    id: 109,
    name: "Mei Stillwater",
    details: { ancestry: { id: 9, name: "Halfling" }, class: { id: 23, name: "Monk" } },
    operation_data: {
      selections: {
        "ancestry-section-491735390724817_9f26290c-a2db-4c45-9b34-5053e60c106d-1_20031_d624594a-2cdc-4d45-82f3-c5a90a341c61_e45b21ec-7ce6-4a0e-8c09-63072f2bc9e7": "1436",
        "ancestry-section-1_20031_feat-op": "20205",
      },
    },
  },
  content: {
    feats_features: {
      ancestryFeats: [
        { id: 20031, name: "Cultural Adaptability", operations: [{ id: "feat-op", type: "select", data: { optionsPredefined: [{ id: "20205", title: "Halfling Luck" }] } }] },
        { id: 20205, name: "Halfling Luck", operations: [] },
      ],
    },
  },
});

const officialTraits = [{ id: 1436, name: "Human", meta_data: { ancestry_trait: true } }, { id: 9, name: "Common", meta_data: {} }];

async function runPrompts(ctx, app) {
  const prevFoundry = globalThis.foundry, prevUi = globalThis.ui;
  globalThis.foundry = { applications: { instances: new Map([["a", app]]) } };
  globalThis.ui = { notifications: { warn: () => {} } };
  const notes = [];
  const stop = watchPrompts(ctx, notes);
  try { await new Promise((r) => setTimeout(r, 450)); }
  finally { stop(); globalThis.foundry = prevFoundry; globalThis.ui = prevUi; }
  return notes;
}

test("official PF2e domain journal maps Bit of Luck uniquely to Luck and omits collisions", () => {
  assert.equal(domainNameForSpell("Bit of Luck"), "Luck");
  assert.equal(domainNameForSpell("Healer's Blessing"), "Healing");
  assert.equal(domainNameForSpell("Sweet Dream"), "Dreams");
  assert.equal(domainNameForSpell("Moonbeam"), "Moon");
  assert.equal(domainNameForSpell("Agile Feet"), "Travel");
  assert.equal(domainNameForSpell("Ignite Ambition"), null, "Ambition and Change share this spell in the journal");
  assert.equal(domainNameForSpell("Competitive Edge"), null);
  assert.equal(domainNameForSpell("Not A Domain Spell"), null);
  const domains = new Map();
  for (const [slug, domain] of Object.entries(DOMAIN_BY_SPELL_SLUG)) {
    const owners = domains.get(domain) ?? [];
    owners.push(slug);
    domains.set(domain, owners);
  }
  assert.equal(DOMAIN_BY_SPELL_SLUG["bit-of-luck"], "Luck");
  assert.ok(!("ignite-ambition" in DOMAIN_BY_SPELL_SLUG));
});

test("#64 slim export names Luck from focus spell 4413 and answers Domain Initiate", async () => {
  const exp = slim103();
  assert.equal(exp.content.all_traits, undefined);
  assert.equal(namedSpells(exp).get("4413"), "Bit of Luck");
  const hints = wgChoiceHints(exp);
  assert.deepEqual(hints.get("domains"), ["Luck"]);
  assert.deepEqual(hints.byId.get("21206"), ["Luck"]);
  assert.deepEqual(hints.get("deity"), ["Holy"]);

  const ctx = choiceContext(exp, {}, [], null);
  const domains = ["Dreams", "Luck", "Moon", "Travel", "Travel (apocryphal)"];
  assert.equal(domains[ctx.pick("Domain Initiate", domains)], "Luck");
  assert.equal(["Holy", "Unholy"][ctx.pick("Deity (Cleric)", ["Holy", "Unholy"])], "Holy");

  const promptCtx = choiceContext(exp, {}, [], null);
  const app = { rendered: true, title: "Select a deity's domain.", item: { name: "Domain Initiate", ...flags(null) }, choices: domains.map((label) => ({ label, value: label.toLowerCase() })), close() { this.closed = true; } };
  const notes = await runPrompts(promptCtx, app);
  assert.equal(app.selection?.label, "Luck");
  assert.equal(app.closed, true);
  assert.match(notes.join("\n"), /Luck/);
  assert.deepEqual(promptCtx.unresolved, []);
});

test("#64 Holy sanctification under Deity answers the Deity (Cleric) prompt", async () => {
  const exp = slim103();
  const ctx = choiceContext(exp, {}, [], null);
  const app = { rendered: true, title: "Sanctification", item: { name: "Deity (Cleric)", ...flags(null) }, choices: [{ label: "Holy", value: "holy" }, { label: "Unholy", value: "unholy" }], close() { this.closed = true; } };
  const notes = await runPrompts(ctx, app);
  assert.equal(app.selection?.label, "Holy");
  assert.equal(app.closed, true);
  assert.deepEqual(ctx.unresolved, []);
  assert.match(notes.join("\n"), /Holy/);
});

test("#77 slim export without all_traits needs a catalog fetch to name Human", () => {
  const exp = slim109();
  assert.equal(exp.content.all_traits, undefined);
  assert.deepEqual(unnamedOfficialSelectionIds(exp).map((x) => x.id), [1436]);
  assert.equal(needsTraitCatalog(exp), true);
  assert.equal(wgChoiceHints(exp).byId.get("20031")?.includes("Human"), false);
  assert.deepEqual(wgChoiceHints(exp).byId.get("20031"), ["Halfling Luck"]);
});

test("#77 after official traits are named, Adopted Ancestry prompt uses the parent feat's hint", async () => {
  const exp = slim109();
  exp.content.all_traits = officialTraits;
  assert.equal(needsTraitCatalog(exp), false);
  const hints = wgChoiceHints(exp);
  assert.deepEqual(hints.byId.get("20031"), ["Halfling Luck", "Human"]);

  const parent = { id: "parent-1", name: "Cultural Adaptability", ...flags(20031) };
  const child = { id: "child-1", name: "Adopted Ancestry", ...flags(null), flags: { ...flags(null).flags, pf2e: { grantedBy: { id: "parent-1" } } } };
  const actor = { items: [parent, child] };
  assert.equal(grantOrigin(child, actor)?.id, "parent-1");

  const ancestries = ["Dwarf", "Elf", "Gnome", "Goblin", "Halfling", "Human"];
  const ctx = choiceContext(exp, {}, [], actor);
  // The live path: prompt item has no wgContentId, so pick("Adopted Ancestry") would miss.
  assert.equal(ctx.specific("Adopted Ancestry").length, 0);
  const app = { rendered: true, title: "Select a common ancestry.", item: child, choices: ancestries.map((label) => ({ label, value: label.toLowerCase() })), close() { this.closed = true; } };
  const notes = await runPrompts(ctx, app);
  assert.equal(app.selection?.label, "Human", "Halfling Luck must not steal the Halfling option");
  assert.equal(app.closed, true);
  assert.deepEqual(ctx.unresolved, []);
  assert.match(notes.join("\n"), /Human/);
});

test("exact unique fallback ignores suffix matches such as Halfling Luck -> Halfling", () => {
  assert.equal(exactUniqueHintIndex(["Dwarf", "Halfling", "Human"], ["Halfling Luck", "Human"]), 2);
  assert.equal(exactUniqueHintIndex(["Dwarf", "Halfling", "Human"], ["Halfling Luck"]), null);
  assert.equal(exactUniqueHintIndex(["Human", "Half-Elf"], allChoiceHints(new Map([["a", ["Human"]], ["b", ["Half-Elf"]]]))), null);
});

test("exportCharacter fetches the full file when slim official selections are unnamed", async () => {
  const { exportCharacter } = await import("../scripts/api.js");
  const slim = { ...slim109(), slim: { version: 1, dropped: { all_traits: 1 } } };
  const full = { version: 4, character: slim.character, content: { ...slim.content, all_traits: officialTraits } };
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url.split("/").pop());
    const json = url.endsWith("-slim") ? slim : full;
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => json, text: async () => JSON.stringify(json) };
  };
  const out = await exportCharacter({ baseUrl: "http://h", apiKey: KEY, fetchImpl, maxRetries: 0 }, 109);
  assert.deepEqual(urls, ["wgui-export-character-slim", "wgui-export-character"]);
  assert.deepEqual(out.content.all_traits, officialTraits);
  assert.ok(wgChoiceHints(out).byId.get("20031").includes("Human"));
});
