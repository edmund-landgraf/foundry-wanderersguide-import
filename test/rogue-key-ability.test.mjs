import test from "node:test";
import assert from "node:assert/strict";
import { reconcileClassKeyAbility } from "../scripts/importer.js";

// Issue #82 / PC 111: base Rogue offers Dex; racket subfeatures extend
// actor.system.build.attributes.keyOptions, not class.system.keyAbility.value.
const setup = () => {
  const cls = { id: "rogue", type: "class", flags: { "foundry-wanderersguide-import": { kind: "class" } }, system: { keyAbility: { value: ["dex"], selected: "dex" } } };
  const writes = [];
  const actor = { items: [cls], system: { build: { attributes: { keyOptions: ["dex", "str"] } } },
    async updateEmbeddedDocuments(type, updates) {
      writes.push(updates);
      cls.system.keyAbility.selected = updates[0]["system.keyAbility.selected"];
    } };
  return { cls, actor, writes };
};

test("Ruffian Str -> Mastermind Int -> identical re-import", async () => {
  const { cls, actor, writes } = setup();
  assert.equal(await reconcileClassKeyAbility(actor, "str"), true);
  assert.equal(cls.system.keyAbility.selected, "str");
  actor.system.build.attributes.keyOptions = ["dex", "int"];
  assert.equal(await reconcileClassKeyAbility(actor, "int"), true);
  assert.equal(cls.system.keyAbility.selected, "int");
  assert.equal(await reconcileClassKeyAbility(actor, "int"), true);
  assert.equal(writes.length, 2);
  assert.deepEqual(cls.system.keyAbility.value, ["dex"]);
  assert.equal(actor.items.length, 1);
  assert.equal(await reconcileClassKeyAbility(actor, "str"), false, "old racket option is no longer legal");
});

test("defaults, invalid choices and unmanaged classes remain safe", async () => {
  const { cls, actor, writes } = setup();
  for (const key of [null, undefined, "bad", "wis"]) assert.equal(await reconcileClassKeyAbility(actor, key), false);
  assert.equal(await reconcileClassKeyAbility(actor, "dex"), true);
  assert.equal(writes.length, 0);
  cls.flags = {};
  assert.equal(await reconcileClassKeyAbility(actor, "str"), false);
  cls.flags = { "foundry-wanderersguide-import": { kind: "class" } };
  actor.system.build.attributes.keyOptions = ["int"];
  assert.equal(await reconcileClassKeyAbility(actor, "int"), true, "Wizard Int uses the same prepared options");
});
