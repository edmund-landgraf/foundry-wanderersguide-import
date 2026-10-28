import fs from "node:fs";
import path from "node:path";

const pf2eRoot = process.argv[2] ?? "D:/repos/foundryvtt_pf2e";
const outputPath = process.argv[3] ?? "db/seeds/pf2e_spell_keywords.sql";
const spellRoot = path.join(pf2eRoot, "packs", "pf2e", "spells", "spells");

const esc = (value) => `'${String(value).replaceAll("'", "''")}'`;
const slugify = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const rows = [];
for (const file of fs.readdirSync(spellRoot, { recursive: true }).filter((name) => name.endsWith(".json")).sort()) {
  const absolute = path.join(spellRoot, file);
  const item = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const rank = Number(item.system?.level?.value);
  if (!item.name || !Number.isInteger(rank)) continue;
  rows.push({
    name: item.name,
    slug: slugify(item.name),
    rank,
    traditions: item.system?.traits?.traditions ?? [],
    path: path.relative(pf2eRoot, absolute).replaceAll(path.sep, "/"),
    id: item._id,
  });
}
rows.sort((a, b) => a.slug.localeCompare(b.slug) || a.rank - b.rank || a.path.localeCompare(b.path));
const values = rows.map((r) => `('pf2e-remaster', ${[r.name, r.slug, r.rank, r.traditions, 'pf2e.spells-srd', r.path, r.id, 'active', `PF2e source: ${r.path}`].map((v, i) => i === 3 ? `ARRAY[${v.map(esc).join(", ")}]::text[]` : esc(v)).join(", ")})`).join(",\n  ");
const sql = `-- Generated from ${pf2eRoot.replaceAll("\\", "/")}.\nINSERT INTO pf2e_spell_keywords\n  (ruleset_id, pf2e_name, pf2e_slug, rank, traditions, compendium_collection, source_path, foundry_id, status, evidence_ref)\nVALUES\n  ${values}\nON CONFLICT (ruleset_id, pf2e_slug, rank, compendium_collection)\nDO UPDATE SET pf2e_name=EXCLUDED.pf2e_name, traditions=EXCLUDED.traditions, source_path=EXCLUDED.source_path, foundry_id=EXCLUDED.foundry_id, status=EXCLUDED.status, evidence_ref=EXCLUDED.evidence_ref;\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, sql, "utf8");
console.log(JSON.stringify({ rows: rows.length, distinctNames: new Set(rows.map((r) => r.slug)).size }, null, 2));
