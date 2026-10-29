import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog, verifyCatalog, PF2E_VERSION } from "../db/tools/export-match-catalog.mjs";

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
