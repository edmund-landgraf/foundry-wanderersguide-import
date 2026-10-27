import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, matchEntries, missReport, sluggify } from "../scripts/mapping.js";
import { summarizeCharacters, callFunction, parseClientId, resolveFunctionsUrl, listCharacters, listCampaigns, getCampaign, campaignLabel, friendlyError } from "../scripts/api.js";

const exp = JSON.parse(readFileSync(new URL("./fixtures/sample-v4.json", import.meta.url)));

test("sluggify", () => {
  assert.equal(sluggify("Sudden Charge"), "sudden-charge");
  assert.equal(sluggify("Champion's Reaction (Remastered)"), "champions-reaction");
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
  assert.equal(m.find((x) => x.name === "Sudden Charge").via, "name+level");
  assert.equal(m.find((x) => x.name === "Longsword").via, "slug");
  assert.deepEqual(missReport(m), ["feat: Stormwarden Dedication", "equipment: Stormforge Covenant Blade"]);
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

test("pickChoice maps a PF2e ChoiceSet label to the WG feature name", async () => {
  globalThis.foundry ??= {};
  const { pickChoice } = await import("../scripts/importer.js");
  assert.equal(pickChoice(["Enigma", "Maestro", "Polymath"], ["Bard Muse", "Polymath Muse"]), 2);
  assert.equal(pickChoice(["Enigma", "Maestro"], ["Bard Muse"]), -1);
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
  assert.deepEqual(wgChoiceHints(real).get("muses"), ["Polymath Muse"]);
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
