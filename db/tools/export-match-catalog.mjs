#!/usr/bin/env node
// Build-time export of the WG -> PF2e match catalog from wgi_rules.
// Reads ACTIVE rows only (never proposed / ambiguous / unresolved) from two sources:
//   1. compendium_match_aliases (curated aliases), and
//   2. wg_pf2e_catalog_matches where the WG and PF2e names differ after sluggify (priority 200, so a
//      curated alias wins). A 60-row random sample of these was reviewed on 2026-10-28 (0 wrong).
// Each run stores the snapshot as a versioned row in match_catalog_snapshots (migration 033) and
// writes the same JSON to a git-ignored file (default data/match-catalog.json) that the module loads.
//
// Usage:
//   node db/tools/export-match-catalog.mjs [--out data/match-catalog.json] [--wg-commit <sha>] [--no-db]
// Env: WGI_PSQL (default: docker exec -i my-postgres psql -U appuser -d wgi_rules), WG_REPO (for the commit).
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sluggify } from "../../scripts/mapping.js";

export const SCHEMA_VERSION = 1;
export const PF2E_VERSION = "8.6.1";
// WG "action" rows are matched on the feat pack type (typesFor("feat") = feat + action).
const KIND_TO_PACK = { action: "feat" };
// pf2e_catalog_entries.item_kind -> the importer's pack kind. Kinds the importer never matches are skipped.
export const CATALOG_KIND_TO_PACK = Object.freeze({
  feat: "feat", action: "feat", classfeature: "feat", ancestryfeature: "feat",
  heritage: "heritage", class: "class", ancestry: "ancestry", background: "background", spell: "spell", equipment: "equipment",
});

const canon = (v) => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`
  : JSON.stringify(v);
export const checksum = (body) => createHash("sha256").update(canon(body)).digest("hex");

/** Pure: active wg_pf2e_catalog_matches rows -> alias rows (only where the slugs differ). */
export function catalogMatchAliases(rows) {
  const out = [];
  for (const r of rows ?? []) {
    if (r?.status !== "active") continue;
    const item_kind = CATALOG_KIND_TO_PACK[r.pf2e_kind];
    if (!item_kind) continue;
    const source_slug = sluggify(r.wg_name), target_slug = sluggify(r.pf2e_name);
    if (!source_slug || !target_slug || source_slug === target_slug) continue;
    out.push({ item_kind, source_name: r.wg_name, target_name: r.pf2e_name, source_slug, target_slug, priority: 200,
      match_strategy: `catalog-${r.match_strategy}`, evidence_ref: r.evidence_ref ?? null, status: "active" });
  }
  return out;
}

/** Pure: raw alias rows -> catalog. Drops anything not active and anything that maps a name to itself. */
export function buildCatalog(rows, { wgContentCommit = null, generatedAt = new Date().toISOString(), pf2eVersion = PF2E_VERSION } = {}) {
  const seen = new Set();
  const aliases = [];
  for (const r of rows ?? []) {
    if (r?.status !== "active") continue;
    const source_slug = String(r.source_slug ?? "").trim();
    const target_slug = String(r.target_slug ?? "").trim();
    if (!source_slug || !target_slug || source_slug === target_slug) continue;
    const item_kind = KIND_TO_PACK[r.item_kind] ?? String(r.item_kind ?? "*");
    const key = `${item_kind}:${source_slug}:${target_slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push({ item_kind, source_name: r.source_name, target_name: r.target_name, source_slug, target_slug,
      priority: Number(r.priority ?? 100), match_strategy: r.match_strategy ?? "canonical", evidence_ref: r.evidence_ref ?? null, status: "active" });
  }
  aliases.sort((a, b) => a.item_kind.localeCompare(b.item_kind) || a.source_slug.localeCompare(b.source_slug) || a.priority - b.priority || a.target_slug.localeCompare(b.target_slug));
  const body = { aliases };
  return { header: { schemaVersion: SCHEMA_VERSION, pf2eVersion, wgContentCommit, generatedAt, rowCount: aliases.length, sha256: checksum(body) }, ...body };
}

/** True when the catalog body still matches its header checksum. */
export const verifyCatalog = (cat) => !!cat?.header && cat.header.schemaVersion === SCHEMA_VERSION && checksum({ aliases: cat.aliases ?? [] }) === cat.header.sha256;

/** Pure: SQL that stores a catalog as one match_catalog_snapshots row (dollar-quoted payload). */
export function snapshotInsertSql(cat) {
  const h = cat.header;
  const json = JSON.stringify(cat);
  let tag = "cat";
  while (json.includes(`$${tag}$`)) tag += "x";
  const lit = (v) => v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
  return `INSERT INTO match_catalog_snapshots (schema_version, pf2e_version, wg_content_commit, created_at, checksum, row_count, payload) VALUES (${Number(h.schemaVersion)}, ${lit(h.pf2eVersion)}, ${lit(h.wgContentCommit)}, ${lit(h.generatedAt)}, ${lit(h.sha256)}, ${Number(h.rowCount)}, $${tag}$${json}$${tag}$::jsonb) RETURNING id;\n`;
}

const SQL_ALIASES = "select coalesce(json_agg(t), '[]') from (select item_kind, source_name, target_name, source_slug, target_slug, priority, match_strategy, evidence_ref, status from compendium_match_aliases where status = 'active') t";
const SQL_MATCHES = "select coalesce(json_agg(t), '[]') from (select m.wg_name, e.pf2e_name, e.item_kind as pf2e_kind, m.match_strategy, m.evidence_ref, m.status from wg_pf2e_catalog_matches m join pf2e_catalog_entries e using (entry_id) where m.status = 'active' and lower(m.wg_name) <> lower(e.pf2e_name)) t";

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const out = arg("--out") ?? "data/match-catalog.json";
  const psql = process.env.WGI_PSQL ?? "docker exec -i my-postgres psql -U appuser -d wgi_rules";
  let wgContentCommit = arg("--wg-commit");
  if (!wgContentCommit && process.env.WG_REPO) {
    const repo = process.env.WG_REPO;
    wgContentCommit = execSync(`git -c safe.directory=${repo.replace(/\\/g, "/")} -C "${repo}" rev-parse HEAD`).toString().trim();
  }
  const q = (sql) => JSON.parse(execSync(`${psql} -Atc "${sql}"`, { maxBuffer: 256 << 20 }).toString());
  const cat = buildCatalog([...q(SQL_ALIASES), ...catalogMatchAliases(q(SQL_MATCHES))], { wgContentCommit });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(cat) + "\n");
  console.log(`wrote ${out}: ${cat.header.rowCount} aliases, sha256 ${cat.header.sha256}`);
  if (argv.includes("--no-db")) return;
  const id = execSync(`${psql} -v ON_ERROR_STOP=1 -At`, { input: snapshotInsertSql(cat), maxBuffer: 256 << 20 }).toString().trim().split(/\r?\n/)[0];
  console.log(`stored match_catalog_snapshots id ${id}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));