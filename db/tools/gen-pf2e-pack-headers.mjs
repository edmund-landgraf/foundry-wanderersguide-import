// Header rows for every PF2e rules pack: name, slug, level, traits, Foundry id, link.
// Skips macros, journals, roll tables, and the critical deck. Does not store descriptions.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: node db/tools/gen-pf2e-pack-headers.mjs <foundryvtt_pf2e>");
const skip = new Set(["macros", "action-macros", "journals", "rollable-tables", "criticaldeck"]);
const folderKind = {
  feats: "feat",
  "class-features": "classfeature",
  actions: "action",
  heritages: "heritage",
  classes: "class",
  ancestries: "ancestry",
  backgrounds: "background",
  spells: "spell",
  equipment: "equipment",
  "ancestry-features": "ancestryfeature",
  deities: "deity",
  "familiar-abilities": "familiarability",
  "boons-and-curses": "boon",
  "adventure-specific-actions": "adventureaction",
  conditions: "condition",
  "pathfinder-society-boons": "feat",
  "bestiary-ability-glossary-srd": "action",
  "bestiary-family-ability-glossary": "action"
};
const system = JSON.parse(fs.readFileSync(path.join(root, "system.pf2e.json"), "utf8"));
const labels = new Map(system.packs.filter((p) => p.system === "pf2e").map((p) => [p.name, p.label]));
const packsRoot = path.join(root, "packs", "pf2e");
const blob = "https://github.com/foundryvtt/pf2e/blob/master";
const sql = (value) => value == null || value === "" ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const num = (value) => Number.isFinite(Number(value)) ? String(Number(value)) : "NULL";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".json") && !entry.name.startsWith("_") ? [full] : [];
  });
}

function kindFor(folder, doc) {
  const type = doc.type;
  if (folderKind[folder] === "feat" && doc.system?.category === "classfeature") return "classfeature";
  if (folderKind[folder]) return folderKind[folder];
  if (type === "feat" && doc.system?.category === "classfeature") return "classfeature";
  return String(type);
}

const rows = [];
for (const folder of fs.readdirSync(packsRoot)) {
  if (skip.has(folder)) continue;
  const dir = path.join(packsRoot, folder);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of walk(dir)) {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!doc.type || !doc._id || !doc.name) continue;
    const sys = doc.system ?? {};
    const traits = sys.traits ?? {};
    const traitList = Array.isArray(traits.value) ? traits.value.filter(Boolean) : [];
    const traditions = Array.isArray(traits.traditions) ? traits.traditions.filter(Boolean) : [];
    const level = sys.level?.value ?? sys.details?.level?.value ?? null;
    const publication = sys.publication?.title || sys.details?.publication?.title || null;
    const relative = path.relative(root, file).split(path.sep).join("/");
    rows.push([
      kindFor(folder, doc),
      doc.type,
      doc.name,
      sys.slug || path.basename(file, ".json"),
      `pf2e.${folder}`,
      relative,
      sys.category ?? null,
      traitList.join(","),
      level,
      publication,
      doc._id,
      `${blob}/${relative}`,
      traits.rarity ?? null,
      traditions.join(","),
      labels.get(folder) ?? folder
    ]);
  }
}

const values = rows.map((row) => `(${[
  sql(row[0]), sql(row[1]), sql(row[2]), sql(row[3]), sql(row[4]), sql(row[5]), sql(row[6]), sql(row[7]),
  num(row[8]), sql(row[9]), sql(row[10]), sql(row[11]), sql(row[12]), sql(row[13]), sql(row[14])
].join(",")})`);
let body = "";
for (let i = 0; i < values.length; i += 300) body += `INSERT INTO _doc VALUES\n${values.slice(i, i + 300).join(",\n")};\n`;
const kinds = [...new Set(["feat", "classfeature", "action", "heritage", "class", "ancestry", "background", "spell", "equipment", "ancestryfeature", "deity", "familiarability", "boon", "adventureaction", "condition", "npc", ...rows.map((r) => r[0])])].sort();
const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "migrations", "037_seed_pf2e_pack_headers.sql");
const output = `-- Generated from PF2e ${system.version} pack headers. Descriptions are not stored.\nBEGIN;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS foundry_document_id text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS source_url text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS rarity text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS traditions text;\nALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS pack_label text;\nALTER TABLE pf2e_catalog_entries DROP CONSTRAINT IF EXISTS pf2e_catalog_entries_item_kind_check;\nALTER TABLE pf2e_catalog_entries ADD CONSTRAINT pf2e_catalog_entries_item_kind_check CHECK (item_kind = ANY (ARRAY[${kinds.map(sql).join(",")}]));\nCREATE INDEX IF NOT EXISTS idx_pf2e_catalog_entries_document ON pf2e_catalog_entries (foundry_document_id);\nCREATE TEMP TABLE _doc (item_kind text, foundry_type text, pf2e_name text, pf2e_slug text, compendium_collection text, source_path text, category text, traits text, level integer, pf2e_source_book text, foundry_document_id text, source_url text, rarity text, traditions text, pack_label text) ON COMMIT DROP;\n${body}\nUPDATE pf2e_catalog_entries e SET foundry_document_id=d.foundry_document_id, source_url=d.source_url, rarity=d.rarity, traditions=NULLIF(d.traditions,''), pack_label=d.pack_label FROM _doc d WHERE e.source_path=d.source_path;\nINSERT INTO pf2e_catalog_entries (ruleset_id,item_kind,foundry_type,pf2e_name,pf2e_slug,compendium_collection,source_path,category,traits,level,pf2e_source_book,foundry_document_id,source_url,rarity,traditions,pack_label)\nSELECT 'pf2e-remaster',d.item_kind,d.foundry_type,d.pf2e_name,d.pf2e_slug,d.compendium_collection,d.source_path,d.category,NULLIF(d.traits,''),d.level,d.pf2e_source_book,d.foundry_document_id,d.source_url,d.rarity,NULLIF(d.traditions,''),d.pack_label FROM _doc d WHERE NOT EXISTS (SELECT 1 FROM pf2e_catalog_entries e WHERE e.source_path=d.source_path);\nCOMMIT;\n`;
fs.writeFileSync(out, output);
const byKind = {};
for (const row of rows) byKind[row[0]] = (byKind[row[0]] ?? 0) + 1;
console.log(JSON.stringify({ documents: rows.length, output: out, byKind }));
