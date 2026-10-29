#!/usr/bin/env node
// Export active WG/PF2e aliases from the local database into the runtime file.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sluggify } from "../../scripts/mapping.js";

export const SCHEMA_VERSION = 1;
export const PF2E_VERSION = "8.6.1";
const KIND_TO_PACK = { action: "feat" };
export const CATALOG_KIND_TO_PACK = Object.freeze({
  feat: "feat", action: "feat", classfeature: "feat", ancestryfeature: "feat",
  heritage: "heritage", class: "class", ancestry: "ancestry", background: "background",
  spell: "spell", equipment: "equipment",
});
const canon = (v) => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`
  : JSON.stringify(v);
export const checksum = (body) => createHash("sha256").update(canon(body)).digest("hex");

export function catalogMatchAliases(rows) {
  return (rows ?? []).filter((r) => r?.status === "active").flatMap((r) => {
    const item_kind = CATALOG_KIND_TO_PACK[r.pf2e_kind];
    const source_slug = sluggify(r.wg_name), target_slug = sluggify(r.pf2e_name);
    if (!item_kind || !source_slug || !target_slug || source_slug === target_slug) return [];
    return [{ item_kind, source_name: r.wg_name, target_name: r.pf2e_name, source_slug, target_slug,
      priority: 200, match_strategy: `catalog-${r.match_strategy}`, evidence_ref: r.evidence_ref ?? null, status: "active" }];
  });
}
export function buildCatalog(rows, { wgContentCommit = null, generatedAt = new Date().toISOString(), pf2eVersion = PF2E_VERSION } = {}) {
  const seen = new Set(), aliases = [];
  for (const r of rows ?? []) {
    if (r?.status !== "active") continue;
    const source_slug = String(r.source_slug ?? "").trim(), target_slug = String(r.target_slug ?? "").trim();
    if (!source_slug || !target_slug || source_slug === target_slug) continue;
    const item_kind = KIND_TO_PACK[r.item_kind] ?? String(r.item_kind ?? "*");
    const key = `${item_kind}:${source_slug}:${target_slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push({ item_kind, source_name: r.source_name, target_name: r.target_name, source_slug, target_slug,
      priority: Number(r.priority ?? 100), match_strategy: r.match_strategy ?? "catalog", evidence_ref: r.evidence_ref ?? null, status: "active" });
  }
  aliases.sort((a, b) => a.item_kind.localeCompare(b.item_kind) || a.source_slug.localeCompare(b.source_slug) || a.priority - b.priority || a.target_slug.localeCompare(b.target_slug));
  const body = { aliases };
  return { header: { schemaVersion: SCHEMA_VERSION, pf2eVersion, wgContentCommit, generatedAt, rowCount: aliases.length, sha256: checksum(body) }, ...body };
}
export const verifyCatalog = (cat) => !!cat?.header && cat.header.schemaVersion === SCHEMA_VERSION && checksum({ aliases: cat.aliases ?? [] }) === cat.header.sha256;
export function snapshotInsertSql(cat) {
  const h = cat.header, json = JSON.stringify(cat);
  let tag = "cat"; while (json.includes(`$${tag}$`)) tag += "x";
  const lit = (v) => v == null ? "NULL" : `'${String(v).replaceAll("'", "''")}'`;
  return `INSERT INTO match_catalog_snapshots (schema_version,pf2e_version,wg_content_commit,created_at,checksum,row_count,payload) VALUES (${Number(h.schemaVersion)},${lit(h.pf2eVersion)},${lit(h.wgContentCommit)},${lit(h.generatedAt)},${lit(h.sha256)},${Number(h.rowCount)},$${tag}$${json}$${tag}$::jsonb) RETURNING id;\n`;
}
const SQL_ALIASES = "select coalesce(json_agg(t), '[]') from (select item_kind, source_name, target_name, source_slug, target_slug, priority, match_strategy, evidence_ref, status from compendium_match_aliases where status = 'active') t";
const SQL_MATCHES = "select coalesce(json_agg(t), '[]') from (select m.wg_name, e.pf2e_name, e.item_kind as pf2e_kind, m.match_strategy, m.evidence_ref, m.status from wg_pf2e_catalog_matches m join pf2e_catalog_entries e using (entry_id) where m.status = 'active' and lower(m.wg_name) <> lower(e.pf2e_name)) t";
function main(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const out = arg("--out") ?? "data/match-catalog.json";
  const psql = process.env.WGI_PSQL ?? "docker exec -i my-postgres psql -U appuser -d wgi_rules";
  const q = (sql) => JSON.parse(execSync(`${psql} -Atc "${sql}"`, { maxBuffer: 256 << 20 }).toString());
  const cat = buildCatalog([...q(SQL_ALIASES), ...catalogMatchAliases(q(SQL_MATCHES))], { wgContentCommit: arg("--wg-commit") });
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(cat) + "\n");
  console.log(`wrote ${out}: ${cat.header.rowCount} aliases, sha256 ${cat.header.sha256}`);
  if (!argv.includes("--no-db")) console.log(`stored match_catalog_snapshots id ${execSync(`${psql} -v ON_ERROR_STOP=1 -At`, { input: snapshotInsertSql(cat), maxBuffer: 256 << 20 }).toString().trim()}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
