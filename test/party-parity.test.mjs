import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, matchEntries, selectionKeyFor } from "../scripts/mapping.js";
import { auditImportCoverage } from "../scripts/coverage.js";

const load = (id) => JSON.parse(readFileSync(new URL(`./fixtures/pcs/${id}.json`, import.meta.url)));

// These are the five distinct party-class fixtures currently available from the
// sanitized WG exports. This is intentionally a plan/coverage contract, not a
// claim that every class mechanic is complete.
const party = [
  ["71", "Bard"],
  ["76", "Druid"],
  ["80", "Summoner"],
  ["81", "Necromancer"],
  ["91", "Witch"],
];

test("five-party-class parity produces a reportable plan without silent drops", () => {
  const seen = new Set();
  for (const [id, expectedClass] of party) {
    const exp = load(id);
    const plan = buildPlan(exp);
    assert.equal(exp.character.details.class.name, expectedClass);
    assert.equal(seen.has(expectedClass), false, `duplicate party class ${expectedClass}`);
    seen.add(expectedClass);
    assert.ok(plan.entries.length > 0, `${expectedClass} should produce import entries`);
    const matched = matchEntries(plan.entries, []);
    const ledger = auditImportCoverage(exp, { ...plan, entries: matched });
    assert.ok(ledger.rows.length > 0, `${expectedClass} should produce coverage rows`);
    assert.equal(
      ledger.rows.length,
      Object.values(ledger.counts).reduce((sum, count) => sum + count, 0),
      `${expectedClass} coverage counts must account for every row`,
    );
    assert.ok(
      ledger.rows.every((row) => ["mapped", "included", "unresolved", "leftover-preserved", "dropped"].includes(row.status)),
      `${expectedClass} contains an unclassified coverage row`,
    );
  }
  assert.deepEqual([...seen], party.map(([, className]) => className));
});

test("source-choice lookup refuses an ambiguous operation key", () => {
  assert.equal(selectionKeyFor(["class_42", "ancestry_42"], 42), null);
  assert.equal(selectionKeyFor(["class_42", "ancestry_42"], 42, "class"), "class_42");
  assert.equal(selectionKeyFor(["class_42", "class_42_old"], 42), "class_42");
});
