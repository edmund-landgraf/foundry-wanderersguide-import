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
  assert.deepEqual(s[0], { id: 1, name: "A", level: 2, ancestry: "Gnome", class: "Bard", campaignId: 7, imageUrl: "u", updatedAt: "t" });
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
  assert.deepEqual(list, [{ id: 5, name: "Abomination Vaults", characterIds: [9] }]);
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