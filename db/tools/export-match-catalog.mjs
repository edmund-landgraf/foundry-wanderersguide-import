#!/usr/bin/env node
// Build-time export of the WG -> PF2e match catalog from wgi_rules.
// Reads ACTIVE rows only (never proposed / ambiguous / unresolved) and writes a versioned JSON
// snapshot that the Foundry module loads at runtime (scripts/match-catalog.js).
//
// Usage:
//   node db/tools/export-match-catalog.mjs [--out data/match-catalog.json] [--wg-commit <sha>]
// Env: WGI_PSQL (default: docker exec my-postgres psql -U appuser -d wgi_rules), WG_REPO (for the commit).
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = 1;
export const PF2E_VERSION = "8.6.1";
// WG "action" rows are matched on the feat pack type (typesFor("feat") = feat + action).
const KIND_TO_PACK = { action: "feat" };

const canon = (v) => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`
  : JSON.stringify(v);
export const checksum = (body) => createHash("sha256").update(canon(body)).digest("hex");

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

const SQL = "select coalesce(json_agg(t), '[]') from (select item_kind, source_name, target_name, source_slug, target_slug, priority, match_strategy, evidence_ref, status from compendium_match_aliases where status = 'active') t";

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const out = arg("--out") ?? "data/match-catalog.json";
  const psql = process.env.WGI_PSQL ?? "docker exec my-postgres psql -U appuser -d wgi_rules";
  let wgContentCommit = arg("--wg-commit");
  if (!wgContentCommit && process.env.WG_REPO) {
    const repo = process.env.WG_REPO;
    wgContentCommit = execSync(`git -c safe.directory=${repo.replace(/\\/g, "/")} -C "${repo}" rev-parse HEAD`).toString().trim();
  }
  const rows = JSON.parse(execSync(`${psql} -Atc "${SQL}"`, { maxBuffer: 256 << 20 }).toString());
  const cat = buildCatalog(rows, { wgContentCommit });
  writeFileSync(out, JSON.stringify(cat) + "\n");
  console.log(`wrote ${out}: ${cat.header.rowCount} aliases, sha256 ${cat.header.sha256}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
