import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KIND_TYPES, PACK_TYPES, FORMULA_TYPES, typesForKind } from "../scripts/item-types.js";

test("one shared kind map; catalog typeMap overrides; unknown kinds map to themselves", () => {
  assert.deepEqual(typesForKind("feat"), ["feat", "action"]);
  assert.deepEqual(typesForKind("feat", { feat: ["feat"] }), ["feat"]);
  assert.deepEqual(typesForKind("deity"), ["deity"]);
  assert.ok(PACK_TYPES.has("kit") && PACK_TYPES.has("action"));
});

test("no duplicate copies remain in importer/mapping/formulas", () => {
  for (const f of ["importer", "mapping", "formulas"]) {
    const src = readFileSync(new URL(`../scripts/${f}.js`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /const (KIND_TYPES|KIND_ITEM_TYPES|PACK_TYPES|FORMULA_PACK_ORDER|FORMULA_TYPES) =/, f);
  }
});

test("every mapped type is a PF2e 8.6.1 Item type (static/template.json)", () => {
  const pf2e = new Set(["action","ancestry","affliction","armor","background","backpack","book","campaignFeature","class","condition","consumable","ammo","deity","effect","equipment","feat","heritage","kit","lore","melee","shield","spell","spellcastingEntry","treasure","weapon"]);
  for (const t of [...PACK_TYPES, ...FORMULA_TYPES]) assert.ok(pf2e.has(t), t);
  assert.ok(Object.isFrozen(KIND_TYPES));
});
