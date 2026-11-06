// In-place match fields for pf2e_catalog_entries. Does not insert catalog rows
// and does not change compendium_collection (that key would duplicate rows).
// Skips macros, journals, roll tables, and the critical deck.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: node db/tools/gen-pf2e-catalog-match-fields.mjs <foundryvtt_pf2e>");
const skip = new Set(["macros", "action-macros", "journals", "rollable-tables", "criticaldeck"]);
const system = JSON.parse(fs.readFileSync(path.join(root, "system.pf2e.json"), "utf8"));
const packByFolder = new Map();
for (const pack of system.packs) {
  if (!pack.path || !pack.name) continue;
  packByFolder.set(pack.path.split("/").filter(Boolean).pop(), pack.name);
}
const packsRoot = path.join(root, "packs", "pf2e");
const sql = (value) => value == null || value === "" ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const num = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? "NULL" : String(Number(value));
const bool = (value) => value == null ? "NULL" : value ? "true" : "false";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".json") && !entry.name.startsWith("_") ? [full] : [];
  });
}

function effectOrigin(doc) {
  if (doc.type !== "effect") return null;
  const html = doc.system?.description?.value ?? "";
  const match = String(html).match(/Compendium\.[^\]\s"']+/);
  return match ? match[0] : null;
}

const rows = [];
for (const folder of fs.readdirSync(packsRoot)) {
  if (skip.has(folder)) continue;
  const dir = path.join(packsRoot, folder);
  if (!fs.statSync(dir).isDirectory()) continue;
  const packName = packByFolder.get(folder);
  const foundryPackId = packName ? `pf2e.${packName}` : null;
  for (const file of walk(dir)) {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!doc.type || !doc._id || !doc.name) continue;
    const sys = doc.system ?? {};
    const publication = sys.publication ?? sys.details?.publication ?? {};
    const material = sys.material && typeof sys.material === "object" ? sys.material.type : (typeof sys.material === "string" ? sys.material : null);
    const grade = sys.grade == null || typeof sys.grade === "object" ? null : String(sys.grade);
    const relative = path.relative(root, file).split(path.sep).join("/");
    const npc = doc.type === "npc";
    rows.push([
      relative,
      doc.type,
      foundryPackId,
      sys.baseItem ?? null,
      typeof sys.group === "string" ? sys.group : null,
      sys.category ?? null,
      grade,
      material || null,
      publication.remaster == null ? null : Boolean(publication.remaster),
      publication.license ?? null,
      effectOrigin(doc),
      npc ? (sys.traits?.size?.value ?? null) : null,
      npc ? (sys.attributes?.hp?.max ?? null) : null,
      npc ? (sys.attributes?.ac?.value ?? null) : null
    ]);
  }
}

const values = rows.map((row) => `(${[
  sql(row[0]), sql(row[1]), sql(row[2]), sql(row[3]), sql(row[4]), sql(row[5]), sql(row[6]), sql(row[7]),
  bool(row[8]), sql(row[9]), sql(row[10]), sql(row[11]), num(row[12]), num(row[13])
].join(",")})`);
let body = "";
for (let i = 0; i < values.length; i += 300) body += `INSERT INTO _doc VALUES\n${values.slice(i, i + 300).join(",\n")};\n`;
const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "migrations", "038_pf2e_catalog_match_fields.sql");
const output = `-- In-place match fields. Does not insert catalog rows or change compendium_collection.\nBEGIN;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS foundry_pack_id text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS base_item text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS item_group text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS grade text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS material text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS remaster boolean;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS publication_license text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS effect_origin text;\nCREATE TEMP TABLE _doc (\n  source_path text, foundry_type text, foundry_pack_id text, base_item text, item_group text,\n  category text, grade text, material text, remaster boolean, publication_license text, effect_origin text,\n  size text, hp integer, ac integer\n) ON COMMIT DROP;\n${body}\nUPDATE pf2e_catalog_entries e SET\n  foundry_type = d.foundry_type,\n  foundry_pack_id = d.foundry_pack_id,\n  base_item = d.base_item,\n  item_group = d.item_group,\n  category = COALESCE(d.category, e.category),\n  grade = d.grade,\n  material = d.material,\n  remaster = d.remaster,\n  publication_license = d.publication_license,\n  effect_origin = d.effect_origin\nFROM _doc d\nWHERE e.ruleset_id = 'pf2e-remaster' AND e.compendium_collection IS NOT NULL AND e.source_path = d.source_path;\nINSERT INTO pf2e_bestiary_headers (entry_id, foundry_document_id, pack_label, rarity, size, hp, ac, source_url, compendium_collection)\nSELECT e.entry_id, e.foundry_document_id, COALESCE(e.pack_label, e.compendium_collection), e.rarity, d.size, d.hp, d.ac, COALESCE(e.source_url, ''), e.compendium_collection\nFROM _doc d\nJOIN pf2e_catalog_entries e ON e.ruleset_id = 'pf2e-remaster' AND e.source_path = d.source_path\nWHERE d.foundry_type = 'npc' AND e.foundry_document_id IS NOT NULL\nON CONFLICT (entry_id) DO UPDATE SET size = EXCLUDED.size, hp = EXCLUDED.hp, ac = EXCLUDED.ac;\nCOMMIT;\n`;
fs.writeFileSync(out, output);
const effects = rows.filter((r) => r[10]).length;
const npcs = rows.filter((r) => r[1] === "npc").length;
console.log(JSON.stringify({ documents: rows.length, effects, npcs, output: out }));
