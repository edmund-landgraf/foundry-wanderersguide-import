import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { checkCatalog, loadMatchCatalog, resetMatchCatalogCache, unwrapCatalog, CATALOG_NOT_LOADED } from "../scripts/match-catalog.js";
import { matchEntries } from "../scripts/mapping.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/match-catalog.min.json", import.meta.url)));
// data/match-catalog.json is generated locally (git-ignored); check it only when present.
const bundledUrl = new URL("../data/match-catalog.json", import.meta.url);
const bundled = existsSync(bundledUrl) ? JSON.parse(readFileSync(bundledUrl)) : null;

test("fixture loads on the matching PF2e version without warnings", () => {
  const r = checkCatalog(fixture, "8.6.1");
  assert.equal(r.status, "loaded");
  assert.deepEqual(r.warnings, []);
  assert.equal(r.catalog.aliases.length, fixture.header.rowCount);
});

test("generated snapshot (if present) is valid, built for PF2e 8.6.1, active rows only", { skip: bundled ? false : "data/match-catalog.json not generated" }, () => {
  const r = checkCatalog(bundled, "8.6.1");
  assert.equal(r.status, "loaded");
  assert.equal(bundled.header.pf2eVersion, "8.6.1");
  assert.ok(bundled.aliases.every((a) => a.status === "active"));
});

test("PF2e version mismatch loads but warns", () => {
  const r = checkCatalog(fixture, "8.7.0");
  assert.equal(r.status, "loaded");
  assert.match(r.warnings.join(" "), /built for PF2e 8\.6\.1; this world runs PF2e 8\.7\.0/);
});

test("missing or invalid catalog is not loaded and says so", () => {
  assert.equal(checkCatalog(null).status, "missing");
  assert.match(checkCatalog(null).warnings[0], new RegExp(CATALOG_NOT_LOADED));
  assert.equal(checkCatalog({ header: { schemaVersion: 99 }, aliases: [] }).status, "invalid");
  assert.equal(checkCatalog({ header: { schemaVersion: 1, rowCount: 5 }, aliases: [] }).status, "invalid");
});

test("non-active rows are never shipped as matches", () => {
  const raw = { header: { schemaVersion: 1, pf2eVersion: "8.6.1", rowCount: 2 }, aliases: [
    { item_kind: "feat", source_slug: "x-edge", target_slug: "x", status: "proposed" },
    { item_kind: "feat", source_slug: "y-edge", target_slug: "y", status: "ambiguous" }] };
  const r = checkCatalog(raw, "8.6.1");
  assert.equal(r.catalog.aliases.length, 0);
  const index = [{ type: "feat", slug: "x", name: "X" }];
  const [m] = matchEntries([{ kind: "feat", packType: "feat", name: "X Edge", slug: "x-edge" }], index, { catalog: r.catalog });
  assert.ok(!m.match);
});

test("loader: 404 -> missing; fetch error -> missing; ok -> loaded; cached", async () => {
  resetMatchCatalogCache();
  assert.equal((await loadMatchCatalog({ fetchImpl: async () => ({ ok: false }), systemVersion: "8.6.1" })).status, "missing");
  resetMatchCatalogCache();
  assert.equal((await loadMatchCatalog({ fetchImpl: async () => { throw new Error("offline"); }, systemVersion: "8.6.1" })).status, "missing");
  resetMatchCatalogCache();
  let calls = 0;
  const f = async () => { calls++; return { ok: true, json: async () => fixture }; };
  assert.equal((await loadMatchCatalog({ fetchImpl: f, systemVersion: "8.6.1" })).status, "loaded");
  await loadMatchCatalog({ fetchImpl: f, systemVersion: "8.6.1" });
  assert.equal(calls, 1);
  resetMatchCatalogCache();
});

test("unwrapCatalog accepts raw catalogs (back-compat) and nothing", () => {
  assert.equal(unwrapCatalog(null).status, "missing");
  assert.equal(unwrapCatalog({ aliases: [] }).status, "loaded");
});