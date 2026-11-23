import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRelayUrl, validateReadConfig, listFoundryCharacters,
  readFoundryCharacter, runFoundryReadRelay, jsonUtf8ByteLength, createRelayLease,
} from "../scripts/foundry-read-relay.js";

const CODE = "random-test-code-0123456789";
const config = {
  code: CODE,
  worldId: "TestWorld",
  origin: "http://localhost:30000",
  relayUrl: "http://127.0.0.1:8787",
};

function fixture({ isGM = true } = {}) {
  const actor = {
    id: "ACTOR123", type: "character", name: "Kota",
    folder: { id: "PARTY1", name: "The Party" },
    system: { details: { level: { value: 3 } } },
    items: { contents: [
      { type: "class", name: "Rogue" },
      { type: "ancestry", name: "Human" },
      { type: "feat", name: "Nimble Dodge" },
    ] },
    toObject: () => ({
      _id: "ACTOR123", name: "Kota", type: "character",
      system: {
        details: {
          level: { value: 3 },
          biography: { gmNotes: "GM-only secret" },
          privateNotes: "private text",
        },
        attributes: { hp: { value: 22 } },
      },
      flags: {
        someModule: { password: "secret" },
        pf2e: { rulesSelections: { skill: "stealth" }, gmNotes: "never export" },
      },
      items: [{
        _id: "ITEM123", name: "Nimble Dodge", type: "feat",
        system: { description: { value: "private item description" }, level: { value: 1 } },
        flags: { myModule: { privateNotes: "private" }, pf2e: { rulesSelections: { choice: "yes" } } },
      }],
    }),
  };
  const npc = { id: "NPC123", type: "npc", name: "NPC" };
  return {
    user: { isGM },
    actors: { contents: [actor, npc], get: (id) => id === actor.id ? actor : npc },
  };
}

test("relay accepts only HTTPS or loopback HTTP and never a credentialed URL", () => {
  assert.equal(validateRelayUrl("http://127.0.0.1:8787/"), "http://127.0.0.1:8787");
  assert.equal(validateRelayUrl("https://relay.example.org"), "https://relay.example.org");
  assert.throws(() => validateRelayUrl("http://relay.example.org"));
  assert.throws(() => validateRelayUrl("http://127.0.0.1:8787/private"));
  assert.throws(() => validateRelayUrl("https://name:secret@relay.example.org"));
});

test("connection credentials validate before any relay call", () => {
  assert.equal(validateReadConfig(config).code, CODE);
  assert.throws(() => validateReadConfig({ ...config, code: "short" }));
  assert.throws(() => validateReadConfig({ ...config, worldId: "world-with-hyphens" }));
  assert.throws(() => validateReadConfig({ ...config, origin: "http://localhost:30000/game" }));
});

test("GM sees only PC summaries, never NPCs or secret notes", () => {
  assert.deepEqual(listFoundryCharacters(fixture()), [{
    id: "ACTOR123", name: "Kota", level: 3, ancestry: "Human", className: "Rogue",
    folderId: "PARTY1", folderName: "The Party",
  }]);
  assert.deepEqual(listFoundryCharacters(fixture({ isGM: false })), []);
});

test("actor source strips biographies, private notes, descriptions and arbitrary flags", () => {
  const data = readFoundryCharacter(fixture(), "ACTOR123");
  assert.equal(data._id, "ACTOR123");
  assert.equal(data.system.details.level.value, 3);
  assert.equal(data.system.attributes.hp.value, 22);
  assert.deepEqual(data.flags, { pf2e: { rulesSelections: { skill: "stealth" } } });
  assert.deepEqual(data.items[0].flags, { pf2e: { rulesSelections: { choice: "yes" } } });
  const json = JSON.stringify(data);
  for (const forbidden of ["GM-only secret", "private text", "private item description", "someModule", "myModule", "gmNotes"]) {
    assert.equal(json.includes(forbidden), false, "should not export " + forbidden);
  }
  assert.equal(readFoundryCharacter(fixture({ isGM: false }), "ACTOR123"), null);
  assert.equal(readFoundryCharacter(fixture(), "NPC123"), null);
  assert.equal(readFoundryCharacter(fixture(), "../etc/passwd"), null);
});

test("GM client connects, waits, responds to list and one actor, then stops", async () => {
  const controller = new AbortController();
  const calls = [];
  const states = [];
  const jobs = [
    { type: "list", requestId: "0123456789abcdef" },
    { type: "actor", actorId: "ACTOR123", requestId: "0123456789abcdee" },
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ path: new URL(url).pathname, body: JSON.parse(options.body), headers: options.headers });
    let body = { ok: true };
    if (url.endsWith("/connect")) body = { worldId: "TestWorld", session: "opaque-session-0123456789" };
    if (url.endsWith("/wait")) body = jobs.shift() ?? { type: "idle" };
    if (url.endsWith("/respond") && jobs.length === 0) controller.abort();
    return { ok: true, json: async () => body };
  };
  await runFoundryReadRelay({
    gameRef: fixture(), config, fetchImpl, signal: controller.signal,
    onState: (state) => states.push(state),
    backoffMs: 0,
  });
  assert.deepEqual(calls.map((x) => x.path), [
    "/foundry-relay/v1/connect", "/foundry-relay/v1/wait", "/foundry-relay/v1/respond",
    "/foundry-relay/v1/wait", "/foundry-relay/v1/respond",
  ]);
  assert.equal(calls[0].body.code, CODE);
  assert.deepEqual(calls[2].body.characters[0].name, "Kota");
  assert.equal(calls[4].body.actor._id, "ACTOR123");
  assert.equal(calls[1].headers["X-WGI-Relay-Session"], "opaque-session-0123456789");
  assert.deepEqual(states, ["connected"]);
});

test("actor read refuses unknown IDs without exposing other actors", async () => {
  const controller = new AbortController();
  let responseBody;
  let n = 0;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/connect")) return { ok: true, json: async () => ({ session: "opaque-session-0123456789", worldId: "TestWorld" }) };
    if (path.endsWith("/wait")) return { ok: true, json: async () => ({ type: "actor", actorId: "NPC123", requestId: "0123456789abcdef" }) };
    if (path.endsWith("/respond")) {
      responseBody = JSON.parse(options.body);
      controller.abort();
      n++;
      return { ok: true, json: async () => ({ ok: true }) };
    }
  };
  await runFoundryReadRelay({ gameRef: fixture(), config, fetchImpl, signal: controller.signal });
  assert.equal(n, 1);
  assert.equal(responseBody.ok, false);
  assert.equal(responseBody.actor, undefined);
  assert.equal(responseBody.status, 403);
});

test("relay size uses UTF-8 bytes and a second tab does not take the lease", async () => {
  const wide = "あ".repeat(500000);
  assert.ok(wide.length < 1400000);
  assert.ok(jsonUtf8ByteLength(wide) > 1400000);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const now = () => 1_000;
  const first = createRelayLease({ storage, key: "relay", ownerId: "tab-a", ttlMs: 60_000, now });
  const second = createRelayLease({ storage, key: "relay", ownerId: "tab-b", ttlMs: 60_000, now });
  assert.equal(first.tryAcquire(), true);
  assert.equal(second.tryAcquire(), false);
  let called = false;
  const controller = new AbortController();
  const waiting = runFoundryReadRelay({
    gameRef: fixture(), config, signal: controller.signal, leaseWaitMs: 15,
    lease: second,
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(called, false);
  controller.abort();
  await waiting;
  first.release();
  assert.equal(second.tryAcquire(), true);
});

test("non-GM clients do not contact the relay", async () => {
  let called = false;
  await runFoundryReadRelay({
    gameRef: fixture({ isGM: false }), config,
    fetchImpl: async () => { called = true; throw Error("should not call"); },
  });
  assert.equal(called, false);
});
