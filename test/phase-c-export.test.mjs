import test from "node:test";
import assert from "node:assert/strict";
import { readFoundryCharacter, LINK_FLAG } from "../scripts/foundry-read-relay.js";
import { scrubActorFlags } from "../../WandersGuideUI/server/foundry-actor-scrub.mjs";
import { findBuilderCharacter, planBuilderUpdate, applyConflict, serverCreateCharacter } from "../../WandersGuideUI/src/process/import/foundry/builder-delta.mjs";

const HOST = "https://amba.wandersguide.site/functions/v1";

function actorSource(flags) {
  return {
    user: { isGM: true },
    actors: {
      get: () => ({
        id: "ACTOR123",
        type: "character",
        toObject: () => ({
          _id: "ACTOR123",
          name: "Yutrexxvb",
          type: "character",
          system: { details: { level: { value: 1 }, biography: { value: "secret" } }, attributes: { hp: { value: 4 } } },
          flags,
          items: [{
            _id: "ITEM1",
            name: "Staff",
            flags: { "foundry-wanderersguide-import": { wgItemId: 8 }, secretMod: { password: "no" } },
            system: { flags: { "foundry-wanderersguide-import": { wgItemId: 99 } } },
          }],
        }),
      }),
    },
  };
}

function throughBothScrubs(flags) {
  const foundry = readFoundryCharacter(actorSource(flags), "ACTOR123");
  return scrubActorFlags(structuredClone(foundry));
}

test("both scrubs leave the allowlisted link and drop secrets", () => {
  const actor = throughBothScrubs({
    other: { token: "secret-token" },
    "foundry-wanderersguide-import": { wgId: 15, host: HOST, importDigest: "digest", wgLeftovers: { a: 1 } },
  });
  assert.deepEqual(actor.flags[LINK_FLAG], { wgId: 15, host: HOST });
  assert.equal(JSON.stringify(actor).includes("secret"), false);
  assert.equal(JSON.stringify(actor).includes("digest"), false);
  assert.equal(actor.items[0].system.flags?.[LINK_FLAG], undefined);
  assert.deepEqual(actor.items[0].flags[LINK_FLAG], { wgItemId: 8 });
  const bare = throughBothScrubs({ "foundry-wanderersguide-import": {} });
  assert.equal(Object.hasOwn(bare.flags, LINK_FLAG), false);
});

test("lookup, host mismatch, rejected link, idempotent create, and the write body", () => {
  const linked = throughBothScrubs({ "foundry-wanderersguide-import": { wgId: 15, host: HOST } });
  const characters = [{ id: 15, name: "Old", level: 1, updated_at: "t1", inventory: [{ id: 8, name: "Staff" }], meta_data: { calculated_stats: { hp_max: 11 } } }];
  const found = findBuilderCharacter(characters, { wgId: linked.flags[LINK_FLAG].wgId, host: HOST, signedInHost: HOST, worldId: "World1", actorId: "ACTOR123" });
  assert.equal(found.action, "update");
  const mismatch = findBuilderCharacter(characters, { wgId: 15, host: "http://127.0.0.1:8000/functions/v1", signedInHost: HOST });
  assert.equal(mismatch.action, "reject");
  const rejected = findBuilderCharacter(characters, { wgId: 99, host: HOST, signedInHost: HOST });
  assert.equal(rejected.reason, "rejected-link");

  const update = planBuilderUpdate(found.character, {
    name: "Yutrexxvb",
    hp_current: 4,
    inventory: { status: "paired", column: [{ id: 8, name: "Staff" }, { id: 9, name: "Dagger" }] },
    meta: { worldId: "World1", actorId: "ACTOR123" },
  });
  assert.equal(update.confirm, true);
  assert.equal(update.body.name, "Yutrexxvb");
  assert.equal(update.body.hp_current, undefined);
  assert.equal(update.body.inventory.length, 2);
  assert.equal(update.body.meta_data.calculated_stats.hp_max, 11);
  assert.equal(update.rows.find((row) => row.field === "hp_current").status, "not applied");
  const conflict = applyConflict(found.character, { ...found.character, name: "Newer", updated_at: "t2" });
  assert.equal(conflict.stale, true);
  assert.equal(conflict.character.updated_at, "t2");

  const store = new Map();
  const key = "World1:ACTOR123";
  const first = serverCreateCharacter(store, key, { name: "New", meta_data: { foundry: { worldId: "World1", actorId: "ACTOR123" } } });
  const second = serverCreateCharacter(store, key, { name: "New again" });
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
  assert.equal(second.character.id, first.character.id);
  const again = findBuilderCharacter([first.character], { worldId: "World1", actorId: "ACTOR123", host: HOST, signedInHost: HOST });
  assert.equal(again.action, "update");
});
