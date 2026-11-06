import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog, verifyCatalog, catalogMatchAliases, snapshotInsertSql, activeMatchRules, PF2E_VERSION } from "../db/tools/export-match-catalog.mjs";

const rows = [
  { item_kind: "feat", source_name: "Flurry Edge", target_name: "Flurry", source_slug: "flurry-edge", target_slug: "flurry", status: "active" },
  { item_kind: "action", source_name: "A", target_name: "B", source_slug: "a", target_slug: "b", status: "active" },
  { item_kind: "feat", source_name: "Same", target_name: "Same", source_slug: "same", target_slug: "same", status: "active" },
  { item_kind: "feat", source_name: "P", target_name: "Q", source_slug: "p", target_slug: "q", status: "proposed" },
  { item_kind: "feat", source_name: "U", target_name: "V", source_slug: "u", target_slug: "v", status: "ambiguous" },
  { item_kind: "feat", source_name: "Flurry Edge", target_name: "Flurry", source_slug: "flurry-edge", target_slug: "flurry", status: "active" },
];

test("export keeps only active, non-identity, de-duplicated aliases", () => {
  const cat = buildCatalog(rows, { wgContentCommit: "abc", generatedAt: "2026-10-28T00:00:00.000Z" });
  assert.deepEqual(cat.aliases.map((a) => `${a.item_kind}:${a.source_slug}>${a.target_slug}`), ["feat:a>b", "feat:flurry-edge>flurry"]);
  assert.equal(cat.header.pf2eVersion, PF2E_VERSION);
  assert.equal(cat.header.wgContentCommit, "abc");
  assert.equal(cat.header.rowCount, 2);
  assert.ok(cat.aliases.every((a) => a.status === "active"));
});

test("checksum is order-independent and detects tampering", () => {
  const a = buildCatalog(rows, { generatedAt: "x" });
  const b = buildCatalog([...rows].reverse(), { generatedAt: "y" });
  assert.equal(a.header.sha256, b.header.sha256);
  assert.ok(verifyCatalog(a));
  a.aliases[0].target_slug = "evil";
  assert.ok(!verifyCatalog(a));
});

test("committed fixture catalog is valid", () => {
  const cat = JSON.parse(readFileSync(new URL("./fixtures/match-catalog.min.json", import.meta.url)));
  assert.ok(verifyCatalog(cat));
  assert.equal(cat.header.pf2eVersion, "8.6.1");
});

test("active match rules are exported and covered by the checksum", () => {
  const rules = [
    { item_kind: "*", rule_key: "type-map", rule_kind: "type-map", payload: { feat: ["feat", "action"] }, priority: 10, status: "active" },
    { item_kind: "*", rule_key: "old", rule_kind: "semantic-suffix", payload: { suffixes: ["cause"] }, priority: 30, status: "retired" },
  ];
  assert.equal(activeMatchRules(rules).length, 1);
  const cat = buildCatalog(rows, { generatedAt: "x", rules });
  assert.equal(cat.rules.length, 1);
  assert.equal(cat.rules[0].rule_kind, "type-map");
  assert.ok(verifyCatalog(cat));
  cat.rules[0].payload.feat.push("heritage");
  assert.ok(!verifyCatalog(cat));
});

test("catalog matches become aliases only when slugs differ and kind is importable", () => {
  const al = catalogMatchAliases([
    { wg_name: "Barbarian (legacy)", pf2e_name: "Barbarian Dedication", pf2e_kind: "feat", match_strategy: "alias", status: "active" },
    { wg_name: "Cleave (legacy)", pf2e_name: "Cleave", pf2e_kind: "feat", match_strategy: "keyword", status: "active" },
    { wg_name: "Mighty Rage", pf2e_name: "Mighty Rage!", pf2e_kind: "classfeature", match_strategy: "keyword", status: "active" },
    { wg_name: "Foo", pf2e_name: "Bar", pf2e_kind: "deity", match_strategy: "exact", status: "active" },
    { wg_name: "Foo", pf2e_name: "Baz", pf2e_kind: "feat", match_strategy: "exact", status: "proposed" },
    { wg_name: "Opportune Riposte X", pf2e_name: "Opportune Riposte", pf2e_kind: "classfeature", match_strategy: "keyword", status: "active" },
  ]);
  assert.deepEqual(al.map((a) => `${a.item_kind}:${a.source_slug}>${a.target_slug}:${a.priority}`), ["feat:barbarian>barbarian-dedication:200", "feat:opportune-riposte-x>opportune-riposte:200"]);
  const cat = buildCatalog([...rows, ...al], { generatedAt: "x" });
  assert.ok(verifyCatalog(cat));
});

test("snapshot insert SQL carries header fields and a safely quoted payload", () => {
  const cat = buildCatalog([{ item_kind: "feat", source_name: "O'Neil $cat$", target_name: "B", source_slug: "o-neil", target_slug: "b", status: "active" }], { wgContentCommit: "abc", generatedAt: "2026-10-28T00:00:00.000Z" });
  const sql = snapshotInsertSql(cat);
  assert.match(sql, /^INSERT INTO match_catalog_snapshots/);
  assert.ok(sql.includes(`'${cat.header.sha256}'`) && sql.includes("'abc'") && sql.includes(", 1, $catx$"));
  assert.ok(sql.includes("$catx$::jsonb"));
});