import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, matchEntries, missReport, sluggify, normalizeMatchCatalog } from "../scripts/mapping.js";
import { applyFeatSlotData, choiceContext } from "../scripts/importer.js";
import { summarizeCharacters, callFunction, parseClientId, resolveFunctionsUrl, listCharacters, listCampaigns, getCampaign, campaignLabel, friendlyError } from "../scripts/api.js";

const exp = JSON.parse(readFileSync(new URL("./fixtures/sample-v4.json", import.meta.url)));

test("sluggify", () => {
  assert.equal(sluggify("Sudden Charge"), "sudden-charge");
  assert.equal(sluggify("Champion's Reaction (Remastered)"), "champions-reaction");
});

test("database match catalog aliases are applied before semantic fallback", () => {
  const catalog = normalizeMatchCatalog({ aliases: [{
    item_kind: "feat", source_slug: "wg-special", target_slug: "pf2e-special",
    priority: 10, status: "active", evidence_ref: "fixture:test",
  }] });
  const [hit] = matchEntries(
    [{ kind: "feat", packType: "feat", name: "WG Special", slug: "wg-special", level: 1 }],
    [{ type: "feat", slug: "pf2e-special", name: "PF2e Special", level: 1, uuid: "U1" }],
    { catalog },
  );
  assert.equal(hit.via, "catalog-alias");
  assert.equal(hit.match.uuid, "U1");
  assert.equal(hit.matchEvidence, "fixture:test");
});

test("database match catalog preserves the ambiguity gate", () => {
  const [hit] = matchEntries(
    [{ kind: "feat", packType: "feat", name: "WG Special", slug: "wg-special", level: 1 }],
    [
      { type: "feat", slug: "pf2e-special", name: "PF2e Special", level: 1, uuid: "U1" },
      { type: "feat", slug: "pf2e-special", name: "PF2e Special", level: 1, uuid: "U2" },
    ],
    { catalog: { aliases: [{ item_kind: "feat", source_slug: "wg-special", target_slug: "pf2e-special", status: "active" }] } },
  );
  assert.equal(hit.match, null);
  assert.equal(hit.via, "miss");
});

test("PR74 catalog is forwarded through preview and real import planning", () => {
  const importer = readFileSync(new URL("../scripts/importer.js", import.meta.url), "utf8");
  assert.match(importer, /previewImport\(exp, \{ host, matchCatalog = null \}\)/);
  assert.match(importer, /const p = await planImport\(exp, \{ host, matchCatalog \}\);/);
  assert.match(importer, /importCharacter\(exp, \{ host, matchCatalog = null,/);
});

test("PR74 log replacement serializes best-row updates and preserves supersession", () => {
  const migration = readFileSync(new URL("../db/migrations/007_create_import_log_summary.sql", import.meta.url), "utf8");
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_import_logs_best/);
  assert.match(migration, /supersedes_log_id = CASE/);
  assert.match(migration, /old_best IS NOT NULL AND old_best <> pc_import_logs\.log_id/);
});

test("buildPlan maps core fields", () => {
  const p = buildPlan(exp);
  assert.equal(p.wgId, 9001);
  assert.equal(p.level, 3);
  assert.equal(p.maxHp, 47);
  assert.deepEqual(p.attributes, { str: 4, dex: 2, con: 2, int: 0, wis: 1, cha: -1 });
  assert.deepEqual(p.languages, ["common", "tempestine"]);
  assert.equal(p.entries.filter((e) => e.kind === "feat").length, 4);
  assert.equal(p.entries.filter((e) => e.kind === "equipment").length, 2);
});

test("buildPlan carries WG key ability and focus pool", () => {
  const exp81 = JSON.parse(readFileSync(new URL("./fixtures/pcs/81.json", import.meta.url)));
  const p = buildPlan(exp81);
  assert.equal(p.keyAbility, "int");
  assert.equal(p.focusMax, 1);
});

test("selected feats carry PF2e feat-slot locations", () => {
  const ancestry = { kind: "feat", featGroup: "ancestry", level: 1, data: { type: "feat", system: { category: "ancestry", level: { value: 1 } } } };
  const classFeat = { kind: "feat", featGroup: "class", level: 1, data: { type: "feat", system: { category: "class", level: { value: 1 } } } };
  const skill = { kind: "feat", level: 1, data: { type: "feat", system: { category: "skill", level: { value: 1 } } } };
  const feature = { kind: "feat", featGroup: "class", level: 1, data: { type: "feat", system: { category: "classfeature", level: { value: 1 } } } };
  assert.equal(applyFeatSlotData(ancestry, ancestry.data).system.location, "ancestry-1");
  assert.equal(applyFeatSlotData(classFeat, classFeat.data).system.location, "class-1");
  assert.equal(applyFeatSlotData(skill, skill.data).system.location, "skill-1");
  assert.equal(applyFeatSlotData(feature, feature.data).system.location, undefined);
  assert.equal(feature.data.system.level.taken, undefined);
});

test("matchEntries slug -> name -> miss", () => {
  const index = [
    { type: "ancestry", slug: "human", name: "Human" },
    { type: "class", slug: "fighter", name: "Fighter" },
    { type: "background", slug: "guard", name: "Guard" },
    { type: "heritage", slug: "versatile-heritage", name: "Versatile Heritage" },
    { type: "feat", slug: "natural-ambition", name: "Natural Ambition", level: 1 },
    { type: "feat", slug: null, name: "Sudden Charge", level: 1 },
    { type: "feat", slug: "toughness", name: "Toughness", level: 1 },
    { type: "weapon", slug: "longsword", name: "Longsword" },
  ];
  const m = matchEntries(buildPlan(exp).entries, index);
  assert.equal(m.find((x) => x.name === "Sudden Charge").via, "name");
  assert.equal(m.find((x) => x.name === "Longsword").via, "slug");
  assert.deepEqual(missReport(m), ["feat: Stormwarden Dedication", "equipment: Stormforge Covenant Blade"]);
});

test("feat entries can match PF2e action documents", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/pcs/81.json", import.meta.url)));
  const entry = buildPlan(fixture).entries.find((e) => e.name === "Consume Thrall");
  const [hit] = matchEntries([entry], [{ type: "action", slug: "consume-thrall", name: "Consume Thrall" }]);
  assert.equal(hit.match.type, "action");
});

test("WG skill selections are available as ChoiceSet hints", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/pcs/81.json", import.meta.url)));
  const hints = (await import("../scripts/mapping.js")).wgChoiceHints(fixture);
  assert.ok(hints.get("scholar")?.includes("Occultism"));
});

test("repeated Exemplar ikon prompts consume distinct WG answers", () => {
  const operations = ["a", "b", "c"].map((id) => ({
    id,
    type: "select",
    data: { optionsPredefined: [
      { id: `${id}-1`, title: "Gleaming Blade" },
      { id: `${id}-2`, title: "Skin Hard as Horn" },
      { id: `${id}-3`, title: "Victor's Wreath" },
    ] },
  }));
  const exp = {
    character: {
      operation_data: { selections: {
        class_a: "a-1",
        class_b: "b-2",
        class_c: "c-3",
      } },
      details: { class: { name: "Exemplar", operations } },
    },
    content: { feats_features: { classFeatures: [{ name: "Exemplar", operations }] } },
  };
  const ctx = choiceContext(exp, {}, [], null);
  assert.equal(ctx.pick("Exemplar", ["Gleaming Blade", "Skin Hard as Horn", "Victor's Wreath"]), 0);
  assert.equal(ctx.pick("Exemplar", ["Gleaming Blade", "Skin Hard as Horn", "Victor's Wreath"]), 1);
  assert.equal(ctx.pick("Exemplar", ["Gleaming Blade", "Skin Hard as Horn", "Victor's Wreath"]), 2);
  assert.equal(ctx.pick("Exemplar", ["Gleaming Blade", "Skin Hard as Horn", "Victor's Wreath"]), null);
});

test("summarizeCharacters reads wgui-ext rows", () => {
  const s = summarizeCharacters([{ id: 1, name: "A", level: 2, class: "Bard", ancestry: "Gnome", campaign_id: 7, image_url: "u", updated_at: "t" }]);
  assert.deepEqual(s[0], { id: 1, name: "A", level: 2, ancestry: "Gnome", class: "Bard", campaignId: 7, imageUrl: "u", updatedAt: "t", player: null });
});
test("callFunction retries 429 and never puts key in errors", async () => {
  let n = 0;
  const key = "11111111-2222-3333-4444-555555555555";
  const fetchImpl = async () => (++n === 1
    ? { status: 429, ok: false, headers: { get: () => "0.01" }, json: async () => ({}) }
    : { status: 403, ok: false, headers: { get: () => null }, json: async () => ({ status: "fail", data: { message: "nope" } }) });
  await assert.rejects(callFunction({ baseUrl: "http://x", apiKey: key, fn: "f", fetchImpl }), (e) => e.status === 403 && !e.message.includes(key));
  assert.equal(n, 2);
});

const real = JSON.parse(readFileSync(new URL("./fixtures/real-test2-v4.json", import.meta.url)));

test("real local export (test2 Inkwhisk, Gnome Bard 2) maps", () => {
  const p = buildPlan(real);
  assert.equal(p.name, "Inkwhisk");
  assert.equal(p.level, 2);
  assert.equal(p.maxHp, 28);
  assert.deepEqual(p.coins, { cp: 0, sp: 150, gp: 0, pp: 0 });
  assert.equal(p.heroPoints, 1);
  assert.deepEqual(p.attributes, { str: 0, dex: 2, con: 2, int: 1, wis: 1, cha: 3 });
  assert.deepEqual(p.languages, ["common", "fey", "gnomish"]);
  const names = (k) => p.entries.filter((e) => e.kind === k).map((e) => e.name);
  assert.deepEqual(names("ancestry"), ["Gnome"]);
  assert.deepEqual(names("class"), ["Bard"]);
  assert.deepEqual(names("heritage"), ["Chameleon Gnome"]);
  assert.ok(names("feat").includes("Polymath Muse"));
  assert.deepEqual(names("spell").sort(), ["Counter Performance", "Courageous Anthem", "Phantasmal Minion"]);
});

test("Fist is not imported as an item", () => {
  const p = buildPlan({ version: 4, character: { id: 1, name: "x", level: 1, details: {} }, content: { inventory_flat: [{ item: { id: 1, name: "Fist" } }, { item: { id: 2, name: "Versatile Vial (Lesser)" } }] } });
  assert.deepEqual(p.entries.map((e) => e.name), ["Versatile Vial (Lesser)"]);
});


test("parseClientId reads client_id from WG Auth URL or bare id", () => {
  assert.equal(parseClientId("http://localhost:5194/oauth/access?user_id=28&client_id=4a273aa9&character_id=<ID>"), "4a273aa9");
  assert.equal(parseClientId("  4a273aa9 "), "4a273aa9");
  assert.equal(parseClientId(""), "");
  assert.equal(parseClientId("http://localhost:5194/oauth/access?user_id=28"), "");
});
test("resolveFunctionsUrl picks prod or custom", () => {
  assert.equal(resolveFunctionsUrl("production", "http://x"), "https://amba.wandersguide.site/functions/v1");
  assert.equal(resolveFunctionsUrl("custom", "http://10.0.0.5:8000/functions/v1/"), "http://10.0.0.5:8000/functions/v1");
  assert.equal(resolveFunctionsUrl("custom", ""), "http://127.0.0.1:8000/functions/v1");
});
const KEY = "11111111-2222-3333-4444-555555555555";
const ok = (data) => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ status: "success", data }) });

test("listCharacters posts {} to wgui-ext-list-key-characters with bearer key", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return ok([{ id: 3, name: "C", level: 1, class: "Rogue", ancestry: "Elf", campaign_id: null }]); };
  const rows = await listCharacters({ baseUrl: "http://h/functions/v1", apiKey: KEY, fetchImpl });
  assert.equal(seen.url, "http://h/functions/v1/wgui-ext-list-key-characters");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(seen.init.body, "{}");
  assert.equal(rows[0].class, "Rogue");
});

test("campaigns: list names and fetch one", async () => {
  const bodies = [];
  const fetchImpl = async (_u, init) => { const b = JSON.parse(init.body); bodies.push(b);
    return b.campaign_id ? ok({ campaign: { id: 5, name: "Abomination Vaults" }, characters: [{ id: 9, name: "Z", level: 3 }] }) : ok({ campaigns: [{ id: 5, name: "Abomination Vaults", character_ids: [9] }] }); };
  const list = await listCampaigns({ baseUrl: "http://h", apiKey: KEY, fetchImpl });
  assert.deepEqual(list, [{ id: 5, name: "Abomination Vaults", imageUrl: null, imageFocusY: null, characterIds: [9], owned: false }]);
  const one = await getCampaign({ baseUrl: "http://h", apiKey: KEY, fetchImpl }, "5");
  assert.equal(one.campaign.name, "Abomination Vaults");
  assert.equal(one.characters[0].id, 9);
  assert.deepEqual(bodies, [{}, { campaign_id: 5 }]);
  assert.equal(campaignLabel(5, new Map([[5, "Abomination Vaults"]])), "Abomination Vaults");
  assert.equal(campaignLabel(6, new Map()), "Campaign #6");
  assert.equal(campaignLabel(null, new Map()), "");
});

test("wgui-ext fail codes become friendly messages without the key", async () => {
  for (const [status, code, want] of [[401, "INVALID_API_KEY", /rejected the API key/], [401, "AUTH_REQUIRED", /No API key/], [403, "CAMPAIGN_FORBIDDEN", /no access to that campaign/], [400, "CAMPAIGN_ID_INVALID", /Invalid campaign id/]]) {
    const fetchImpl = async () => ({ status, ok: false, headers: { get: () => null }, json: async () => ({ status: "fail", data: { message: "raw", code } }) });
    await assert.rejects(listCampaigns({ baseUrl: "http://h", apiKey: KEY, fetchImpl }), (e) => e.status === status && want.test(e.message) && !e.message.includes(KEY));
  }
  assert.match(friendlyError(404, null), /not found/);
});

test("name match confidence gate: ambiguous names are unresolved, never list[0]", () => {
  const e = [{ kind: "feat", packType: "feat", name: "Twin", slug: "twin-x", level: 2 }];
  const two = [{ type: "feat", slug: "a", name: "Twin", level: 1, uuid: "U1" }, { type: "feat", slug: "b", name: "Twin", level: 4, uuid: "U2" }];
  const m = matchEntries(e, two)[0];
  assert.equal(m.via, "ambiguous");
  assert.equal(m.match, null);
  assert.deepEqual(m.candidates, ["U1", "U2"]);
  const lvl = matchEntries([{ ...e[0], level: 4 }], two)[0];
  assert.equal(lvl.via, "name+level");
  assert.equal(lvl.match.uuid, "U2");
});

test("Champion Redemption Cause resolves to PF2e's canonical Redemption item", () => {
  const entry = [{ kind: "feat", packType: "feat", name: "Redemption Cause", slug: "redemption-cause", level: 1 }];
  const index = [{ type: "feat", slug: "redemption", name: "Redemption", level: 1, uuid: "Compendium.pf2e.feats-srd.Item.redemption" }];
  const [match] = matchEntries(entry, index);
  assert.equal(match.via, "semantic-name");
  assert.equal(match.match.name, "Redemption");
  assert.equal(match.canonicalSlug, "redemption");
});

const fixtureCatalog = JSON.parse(readFileSync(new URL("./fixtures/match-catalog.min.json", import.meta.url)));
test("WG issue aliases resolve only their evidence-backed canonical targets (from the catalog)", () => {
  assert.ok(!matchEntries([{ kind: "feat", packType: "feat", name: "Flurry Edge", slug: "flurry-edge" }], [{ type: "feat", slug: "flurry", name: "Flurry", uuid: "U:flurry" }])[0].match, "no built-in alias without a catalog");
  const cases = [
    ["Animal Companion (Druid)", "animal-companion"],
    ["Animal Empathy (Druid)", "animal-empathy"],
    ["Imperial Bloodline", "bloodline-imperial"],
    ["Inexorable Iron Hybrid Study", "inexorable-iron"],
    ["Telekinetic Hand (Psi)", "telekinetic-hand"],
    ["Telekinetic Projectile (Psi)", "telekinetic-projectile"],
    ["Flurry Edge", "flurry"],
    ["Precision Edge", "precision"],
  ];
  for (const [source, target] of cases) {
    const [hit] = matchEntries(
      [{ kind: source.includes("Telekinetic") ? "spell" : "feat", packType: source.includes("Telekinetic") ? "spell" : "feat", name: source, slug: sluggify(source) }],
      [{ type: source.includes("Telekinetic") ? "spell" : "feat", slug: target, name: target, uuid: `U:${target}` }],
      { catalog: fixtureCatalog },
    );
    assert.equal(hit.match?.uuid, `U:${target}`, source);
    assert.equal(hit.via, "catalog-alias", source);
  }
});

test("semantic-name matching is confidence gated by type and level", () => {
  const entry = [{ kind: "feat", packType: "feat", name: "Liberation Cause", slug: "liberation-cause", level: 1 }];
  const index = [
    { type: "feat", slug: "liberation", name: "Liberation", level: 1, uuid: "U1" },
    { type: "feat", slug: "liberation", name: "Liberation", level: 2, uuid: "U2" },
  ];
  const [match] = matchEntries(entry, index);
  assert.equal(match.via, "semantic-name");
  assert.equal(match.match.uuid, "U1");
});

test("semantic-name matching stays unresolved when canonical candidates remain ambiguous", () => {
  const entry = [{ kind: "feat", packType: "feat", name: "Justice Cause", slug: "justice-cause", level: 1 }];
  const index = [
    { type: "feat", slug: "justice", name: "Justice", level: 1, uuid: "U1" },
    { type: "feat", slug: "justice", name: "Justice", level: 1, uuid: "U2" },
  ];
  const [match] = matchEntries(entry, index);
  assert.equal(match.match, null);
  assert.equal(match.via, "miss");
});

test("uniqueChoice: only an explicit WG answer naming exactly one legal option", async () => {
  const { uniqueChoice } = await import("../scripts/importer.js");
  assert.equal(uniqueChoice(["Enigma", "Maestro", "Polymath"], ["Polymath Muse"]), 2);
  assert.equal(uniqueChoice(["Enigma", "Maestro"], ["Bard Muse"]), -1);
  assert.equal(uniqueChoice(["Enigma", "Maestro"], []), -1, "no answer -> unresolved, not the first option");
  assert.equal(uniqueChoice(["Fire", "Fire"], ["Fire"]), -1, "two legal options fit -> unresolved");
  assert.equal(uniqueChoice(["Enigma", "Maestro"], ["Enigma", "Maestro"]), -1, "conflicting answers -> unresolved");
});

test("portrait: image_url from v4 export, resolved for Foundry", async () => {
  const { buildPlan, resolveImageUrl } = await import("../scripts/mapping.js");
  const p = buildPlan({ version: 4, character: { id: 1, name: "x", level: 1, details: { image_url: "https://h/storage/v1/object/public/portraits/a.png" } }, content: {} });
  assert.equal(p.imageUrl, "https://h/storage/v1/object/public/portraits/a.png");
  assert.equal(buildPlan({ version: 4, character: { id: 1, name: "x", level: 1, details: {} }, content: {} }).imageUrl, null);
  const f = "http://127.0.0.1:8000/functions/v1";
  assert.equal(resolveImageUrl("/storage/v1/object/public/p/b.png", f), "http://127.0.0.1:8000/storage/v1/object/public/p/b.png");
  assert.equal(resolveImageUrl("portraits/c.png", f), "http://127.0.0.1:8000/storage/v1/object/public/portraits/c.png");
  assert.equal(resolveImageUrl("", f), null);
});

// ---- importer TODOs (feat/importer-todos) ------------------------------------------------------
import { wgChoiceHints, matchChoice, defaultFlag, parseComposedName, spellcastingPlan, entryKeyFor, diffPlan, parityCheck } from "../scripts/mapping.js";

test("wgChoiceHints reads WG select answers per feature", () => {
  const exp2 = { character: { operation_data: { selections: { "class-feature-1_op-a": "opt-2", "class-feature-2_op-b": "77" } }, details: {} },
    content: { feats_features: { classFeatures: [
      { id: 1, name: "Specialty Crafting", operations: [{ id: "op-a", type: "select", data: { optionsPredefined: [{ id: "opt-1", title: "Alchemy" }, { id: "opt-2", title: "Woodworking" }] } }] },
      { id: 2, name: "Muses", operations: [{ id: "op-b", type: "select", data: { optionsPredefined: [] } }] }],
      otherFeats: [{ id: 77, name: "Polymath Muse" }] } } };
  const h = wgChoiceHints(exp2);
  assert.deepEqual(h.get("specialty-crafting"), ["Woodworking"]);
  assert.deepEqual(h.get("muses"), ["Polymath Muse"]);
  assert.deepEqual(h.byId.get("1"), ["Woodworking"]);
  assert.deepEqual(h.byId.get("2"), ["Polymath Muse"]);
  assert.deepEqual(wgChoiceHints(real).get("muses"), ["Polymath Muse"]);
});

test("wgChoiceHints keeps stable owner IDs separate when display names repeat", () => {
  const exp2 = { character: { operation_data: { selections: { "class-feature-1_op-a": "opt-1", "class-feature-2_op-b": "opt-2" } }, details: {} },
    content: { feats_features: { classFeatures: [
      { id: 1, name: "Shared Feature", operations: [{ id: "op-a", type: "select", data: { optionsPredefined: [{ id: "opt-1", title: "First" }] } }] },
      { id: 2, name: "Shared Feature", operations: [{ id: "op-b", type: "select", data: { optionsPredefined: [{ id: "opt-2", title: "Second" }] } }] },
    ] } } };
  const h = wgChoiceHints(exp2);
  assert.deepEqual(h.get("shared-feature"), ["First", "Second"]);
  assert.deepEqual(h.byId.get("1"), ["First"]);
  assert.deepEqual(h.byId.get("2"), ["Second"]);
});

test("choiceContext prefers the WG owner ID over a duplicate display name", async () => {
  const exp2 = { character: { operation_data: { selections: { "class-feature-1_op-a": "opt-1", "class-feature-2_op-b": "opt-2" } }, details: {} },
    content: { feats_features: { classFeatures: [
      { id: 1, name: "Shared Feature", operations: [{ id: "op-a", type: "select", data: { optionsPredefined: [{ id: "opt-1", title: "First" }] } }] },
      { id: 2, name: "Shared Feature", operations: [{ id: "op-b", type: "select", data: { optionsPredefined: [{ id: "opt-2", title: "Second" }] } }] },
    ] } } };
  const { choiceContext } = await import("../scripts/importer.js");
  const ctx = choiceContext(exp2, {}, [], null);
  assert.deepEqual(ctx.specific("Shared Feature", 1), ["First"]);
  assert.deepEqual(ctx.specific("Shared Feature", 2), ["Second"]);
});

test("wgChoiceHints names selected skill adjValue options", () => {
  const exp2 = { character: { operation_data: { selections: { "class-feature-1_skill-op": "arcana-option" } }, details: {} },
    content: { feats_features: { classFeatures: [{ id: 1, name: "Runesmith", operations: [{ id: "skill-op", type: "select", data: { optionsPredefined: [{ id: "arcana-option", operation: { type: "adjValue", data: { variable: "SKILL_ARCANA" } } }] } }] }] } } };
  assert.deepEqual(wgChoiceHints(exp2).get("runesmith"), ["Arcana"]);
});

test("fixed physical-feature grants resolve only a unique equivalent PF2e option", async () => {
  const exp = JSON.parse(readFileSync(new URL("./fixtures/pcs/81.json", import.meta.url)));
  const { choiceContext, uniqueFixedChoice } = await import("../scripts/importer.js");
  const ctx = choiceContext(exp, {}, [], null);
  assert.ok(ctx.fixedNames.has("clan-dagger"));
  assert.equal(uniqueFixedChoice(["Clan Dagger", "Clan Poniard"], ctx.fixedNames), "Clan Dagger");
  assert.equal(uniqueFixedChoice(["Clan Dagger", "Clan Dagger"], ctx.fixedNames), null);
});

test("matchChoice and defaultFlag", () => {
  assert.equal(matchChoice(["Enigma", "Polymath", "Maestro"], ["Polymath Muse"]), 1);
  assert.equal(matchChoice(["Alchemy", "Woodworking"], ["Woodworking"]), 1);
  assert.equal(matchChoice(["Alchemy"], ["Nope"]), -1);
  assert.equal(defaultFlag("Specialty Crafting"), "specialtyCrafting");
});

test("parseComposedName splits runes and materials", () => {
  const a = parseComposedName("+1 Striking Flaming Cold Iron Longsword (Low-Grade)");
  assert.equal(a.base, "Longsword");
  assert.deepEqual(a.runes, { potency: 1, striking: 1, resilient: 0, property: ["flaming"] });
  assert.deepEqual(a.material, { type: "cold-iron", grade: "low" });
  const b = parseComposedName("+2 Greater Resilient Leather Armor");
  assert.equal(b.base, "Leather Armor");
  assert.equal(b.runes.resilient, 2);
  const c = parseComposedName("Healing Potion (Minor)");
  assert.equal(c.composed, false);
  assert.equal(c.base, "Healing Potion (Minor)");
  const d = parseComposedName("Anadi Fangs", { runes: { striking: 0, potency: 2, property: ["Shock"] } });
  assert.deepEqual(d.runes, { potency: 2, striking: 0, resilient: 0, property: ["shock"] });
  const p = buildPlan({ character: {}, content: { inventory_flat: [{ item: { id: 5, name: "+1 Striking Longsword" } }] } });
  const m = matchEntries(p.entries, [{ type: "weapon", slug: "longsword", name: "Longsword" }]);
  assert.equal(m[0].via, "base+runes");
});

test("spellcastingPlan builds entries and keys", () => {
  const sp = spellcastingPlan(real);
  assert.deepEqual(sp.map((e) => [e.key, e.mode, e.tradition, e.ability]), [["src:BARD", "spontaneous", "occult", "cha"], ["focus:BARD", "focus", "occult", "cha"]]);
  assert.deepEqual(sp[0].slots, { 0: 5, 1: 3 });
  const plan = buildPlan(real);
  const keys = plan.entries.filter((e) => e.kind === "spell").map((e) => `${e.name}->${entryKeyFor(e)}`);
  assert.ok(keys.includes("Phantasmal Minion->src:BARD"));
  assert.ok(keys.includes("Courageous Anthem->focus:BARD"));
  assert.equal(entryKeyFor({ innate: true, tradition: "occult" }), "innate:occult");
});

test("diffPlan and parityCheck", () => {
  const plan = buildPlan(exp);
  assert.equal(diffPlan(plan, null).insert, true);
  const actor = { name: plan.name, level: plan.level, hpMax: plan.maxHp, attributes: plan.attributes, languages: plan.languages,
    items: plan.entries.map((e) => ({ type: e.kind === "equipment" ? "equipment" : e.kind, name: e.name, slug: e.slug, ours: true, rank: e.rank ?? null, entryMode: e.kind === "spell" ? (e.innate ? "innate" : e.focus ? "focus" : "spontaneous") : null })) };
  const d = diffPlan(plan, actor);
  assert.deepEqual([d.fields.length, d.add.length, d.remove.length], [0, 0, 0]);
  assert.equal(parityCheck(plan, actor).ok, true);
  const worse = { ...actor, hpMax: plan.maxHp - 3, items: actor.items.slice(1) };
  const pc = parityCheck(plan, worse);
  assert.equal(pc.ok, false);
  assert.ok(pc.failed.some((r) => r.check === "max HP"));
  assert.equal(diffPlan(plan, worse).add.length, 1);
});

test("re-import preserves live HP without exceeding the new maximum", async () => {
  const { preservedCurrentHp } = await import("../scripts/importer.js");
  assert.equal(preservedCurrentHp({ currentHp: 17, maxHp: 30 }, 35, true), 17);
  assert.equal(preservedCurrentHp({ currentHp: 40, maxHp: 40 }, 25, true), 25);
  assert.equal(preservedCurrentHp({ currentHp: 0, maxHp: 20 }, 20, true), 0);
  assert.equal(preservedCurrentHp(null, 20, false), 20);
  assert.equal(preservedCurrentHp(undefined, 15, false), 15, "fresh imports initialize current HP to WG max");
});

test("captureRuntimeState records HP, temporary HP, and spell slot usage", async () => {
  const { captureRuntimeState } = await import("../scripts/importer.js");
  const item = {
    type: "spellcastingEntry",
    name: "Bard Spells",
    system: { slots: { slot1: { max: 2, value: 1, prepared: ["spell-a"] }, slot2: { max: 2, value: 0, prepared: [] } } },
    flags: { "foundry-wanderersguide-import": { kind: "spellcasting", wgSource: "BARD" } },
  };
  const state = captureRuntimeState({ system: { attributes: { hp: { value: 12, max: 28, temp: 4 } } }, items: [item] });
  assert.deepEqual(state, {
    currentHp: 12,
    maxHp: 28,
    tempHp: 4,
    spellcasting: { BARD: { slot1: { max: 2, value: 1, prepared: ["spell-a"] }, slot2: { max: 2, value: 0, prepared: [] } } },
  });
});

test("summarizeCampaign carries WG campaign art", async () => {
  const { summarizeCampaign } = await import("../scripts/api.js");
  assert.deepEqual(summarizeCampaign({ id: 42, name: "C", image_url: "https://x/a.png", image_focus_y: 40, character_ids: [1], owned: true }), { id: 42, name: "C", imageUrl: "https://x/a.png", imageFocusY: 40, characterIds: [1], owned: true });
  assert.equal(summarizeCampaign(null), null);
});

test("API summaries tolerate empty or malformed list payloads", async () => {
  const { summarizeCharacters, summarizeCampaign, friendlyError } = await import("../scripts/api.js");
  assert.deepEqual(summarizeCharacters(null), []);
  assert.deepEqual(summarizeCharacters({ id: 4, name: "Solo" }), [{ id: 4, name: "Solo", level: undefined, ancestry: "", class: "", campaignId: null, imageUrl: "", updatedAt: "", player: null }]);
  assert.equal(summarizeCampaign(undefined), null);
  assert.doesNotMatch(friendlyError(500, { data: { message: "Bearer 11111111-2222-3333-4444-555555555555 rejected" } }), /11111111-2222-3333-4444-555555555555/);
});

test("exportCharacter rejects non-v4 exports", async () => {
  const { exportCharacter } = await import("../scripts/api.js");
  const fetchImpl = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ version: 3, character: {} }) });
  await assert.rejects(exportCharacter({ baseUrl: "http://h", apiKey: KEY, fetchImpl }, 7), /JSON v4 character/);
});

test("exportCharacter uses the slim export and falls back to the full one only when slim is missing", async () => {
  const { exportCharacter } = await import("../scripts/api.js");
  const v4 = { version: 4, character: { id: 7 }, content: {} };
  const reply = (status, json) => ({ status, ok: status < 400, headers: { get: () => null }, json: async () => json });
  const run = async (slimStatus) => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url.split("/").pop());
      if (url.endsWith("-slim")) return slimStatus === 200 ? reply(200, { ...v4, slim: { version: 1 } }) : reply(slimStatus, slimStatus === 500 ? null : { status: "fail", data: { message: "no" } });
      return reply(200, v4);
    };
    const out = await exportCharacter({ baseUrl: "http://h", apiKey: KEY, fetchImpl, maxRetries: 0 }, 7).catch((e) => e);
    return { urls, out };
  };
  let r = await run(200);
  assert.deepEqual(r.urls, ["wgui-export-character-slim"]);
  assert.equal(r.out.slim.version, 1);
  for (const status of [404, 500]) {
    r = await run(status);
    assert.deepEqual(r.urls, ["wgui-export-character-slim", "wgui-export-character"], String(status));
    assert.equal(r.out.version, 4);
  }
  for (const status of [401, 403, 429]) {
    r = await run(status);
    assert.deepEqual(r.urls, ["wgui-export-character-slim"], String(status));
    assert.ok(r.out instanceof Error, String(status));
  }
});
