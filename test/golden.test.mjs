import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PCS, goldenFor, goldenUrl } from "./golden/lib.mjs";

for (const id of PCS) {
  test(`golden: PC ${id} plan, match, preview, diff and parity unchanged`, () => {
    const want = JSON.parse(readFileSync(goldenUrl(id)));
    assert.deepEqual(JSON.parse(JSON.stringify(goldenFor(id))), want);
  });
}