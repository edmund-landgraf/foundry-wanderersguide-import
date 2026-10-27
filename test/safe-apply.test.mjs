import test from "node:test";
import assert from "node:assert/strict";
import { managedTree } from "../scripts/importer.js";

const M = "foundry-wanderersguide-import";
const item = (id, extra = {}) => ({ id, flags: extra.flags ?? {}, system: extra.system ?? {} });

test("managedTree: module items plus everything granted from them, nothing else", () => {
  const items = [
    item("cls", { flags: { [M]: { kind: "class" }, pf2e: { itemGrants: { x: { id: "viaParent" } } } } }),
    item("feat", { flags: { pf2e: { grantedBy: { id: "cls" } } } }),
    item("sub", { flags: { pf2e: { grantedBy: { id: "feat" } } } }),
    item("loc", { system: { location: "cls" } }),
    item("viaParent"),
    item("userAdded"),
    item("userChild", { flags: { pf2e: { grantedBy: { id: "userAdded" } } } }),
  ];
  assert.deepEqual([...managedTree(items)].sort(), ["cls", "feat", "loc", "sub", "viaParent"]);
});