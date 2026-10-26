import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, matchEntries, missReport, sluggify } from "../scripts/mapping.js";
import { summarizeCharacters, callFunction, parseClientId, resolveFunctionsUrl } from "../scripts/api.js";

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

test("summarizeCharacters keeps only rows granted to this client", () => {
  const s = summarizeCharacters([{ id: 1, name: "A", level: 2, details: { class: { name: "Bard" }, api_clients: { client_access: [{ clientId: "x", publicUserId: "28" }] } } }, { id: 2, name: "B", level: 1, details: {} }], { clientId: "x", publicUserId: "28" });
  assert.deepEqual(s.map((r) => r.id), [1]);
  assert.equal(s[0].class, "Bard");
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

test("list filter is strict: other clients, other owners, and no client id hide rows", () => {
  const rows = [
    { id: 1, details: { api_clients: { client_access: [{ clientId: "other", publicUserId: "28" }] } } },
    { id: 2, details: { api_clients: { client_access: [{ clientId: "mine", publicUserId: "5" }] } } },
    { id: 3, details: { api_clients: { client_access: [{ clientId: "mine", publicUserId: "28" }] } } },
  ];
  assert.deepEqual(summarizeCharacters(rows, { clientId: "mine", publicUserId: "28" }).map((r) => r.id), [3]);
  assert.deepEqual(summarizeCharacters(rows, "mine").map((r) => r.id), [2, 3]);
  assert.deepEqual(summarizeCharacters(rows), []);
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
test("pickChoice maps a PF2e ChoiceSet label to the WG feature name", async () => {
  globalThis.foundry ??= {};
  const { pickChoice } = await import("../scripts/importer.js");
  assert.equal(pickChoice(["Enigma", "Maestro", "Polymath"], ["Bard Muse", "Polymath Muse"]), 2);
  assert.equal(pickChoice(["Enigma", "Maestro"], ["Bard Muse"]), -1);
});
