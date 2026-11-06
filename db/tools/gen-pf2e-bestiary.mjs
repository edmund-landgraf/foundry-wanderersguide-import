// Header-only PF2e NPC compendium rows for wgi_rules.
// Stores name, level, Foundry id, match fields, and a link. Not stat blocks.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: node db/tools/gen-pf2e-bestiary.mjs <foundryvtt_pf2e>");
const system = JSON.parse(fs.readFileSync(path.join(root, "system.pf2e.json"), "utf8"));
const packs = system.packs.filter((pack) => pack.type === "Actor" && pack.system === "pf2e");
const sql = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const num = (value) => Number.isFinite(Number(value)) ? String(Number(value)) : "NULL";
const blob = "https://github.com/foundryvtt/pf2e/blob/master";
const rows = [];
for (const pack of packs) {
  const dir = path.join(root, "packs", "pf2e", pack.name);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (doc.type !== "npc" || !doc.name || !doc._id) continue;
    const traits = doc.system?.traits ?? {};
    const traitList = Array.isArray(traits.value) ? traits.value.filter(Boolean) : [];
    const relative = `packs/pf2e/${pack.name}/${file}`;
    rows.push([
      doc.name,
      file.slice(0, -5),
      `pf2e.${pack.name}`,
      relative,
      traitList.join(","),
      doc.system?.details?.level?.value ?? null,
      doc.system?.details?.publication?.title || null,
      doc._id,
      pack.label,
      traits.rarity ?? null,
      traits.size?.value ?? null,
      doc.system?.attributes?.hp?.max ?? null,
      doc.system?.attributes?.ac?.value ?? null,
      `${blob}/${relative}`
    ]);
  }
}
const values = rows.map((row) => `(${[
  sql(row[0]), sql(row[1]), sql(row[2]), sql(row[3]), sql(row[4]),
  num(row[5]), sql(row[6]), sql(row[7]), sql(row[8]), sql(row[9]), sql(row[10]),
  num(row[11]), num(row[12]), sql(row[13])
].join(",")})`);
let body = "";
for (let i = 0; i < values.length; i += 400) {
  body += `INSERT INTO _npc VALUES\n${values.slice(i, i + 400).join(",\n")};\n`;
}
const output = `-- Generated from PF2e ${system.version} NPC compendium headers. Not stat blocks.\nBEGIN;\nALTER TABLE pf2e_catalog_entries DROP CONSTRAINT IF EXISTS pf2e_catalog_entries_item_kind_check;\nALTER TABLE pf2e_catalog_entries ADD CONSTRAINT pf2e_catalog_entries_item_kind_check CHECK (item_kind = ANY (ARRAY['feat','classfeature','action','heritage','class','ancestry','background','spell','equipment','ancestryfeature','deity','familiarability','boon','adventureaction','condition','npc']));\nCREATE TABLE IF NOT EXISTS pf2e_bestiary_headers (\n  entry_id bigint PRIMARY KEY REFERENCES pf2e_catalog_entries(entry_id) ON DELETE CASCADE,\n  compendium_collection text NOT NULL,\n  foundry_document_id text NOT NULL,\n  pack_label text NOT NULL,\n  rarity text,\n  size text,\n  hp integer,\n  ac integer,\n  source_url text NOT NULL,\n  UNIQUE (compendium_collection, foundry_document_id)\n);\nCREATE TEMP TABLE _npc (\n  pf2e_name text, pf2e_slug text, compendium_collection text, source_path text,\n  traits text, level integer, pf2e_source_book text,\n  foundry_document_id text, pack_label text, rarity text, size text,\n  hp integer, ac integer, source_url text\n) ON COMMIT DROP;\n${body}INSERT INTO pf2e_catalog_entries (ruleset_id,item_kind,foundry_type,pf2e_name,pf2e_slug,compendium_collection,source_path,category,traits,level,pf2e_source_book)\nSELECT 'pf2e-remaster','npc','npc',pf2e_name,pf2e_slug,compendium_collection,source_path,NULL,NULLIF(traits,''),level,pf2e_source_book FROM _npc\nON CONFLICT (ruleset_id,compendium_collection,source_path) DO UPDATE SET item_kind=EXCLUDED.item_kind,foundry_type=EXCLUDED.foundry_type,pf2e_name=EXCLUDED.pf2e_name,pf2e_slug=EXCLUDED.pf2e_slug,traits=EXCLUDED.traits,level=EXCLUDED.level,pf2e_source_book=EXCLUDED.pf2e_source_book;\nINSERT INTO pf2e_bestiary_headers (entry_id,foundry_document_id,pack_label,rarity,size,hp,ac,source_url,compendium_collection)\nSELECT e.entry_id,n.foundry_document_id,n.pack_label,n.rarity,n.size,n.hp,n.ac,n.source_url,n.compendium_collection\nFROM _npc n JOIN pf2e_catalog_entries e ON e.ruleset_id='pf2e-remaster' AND e.compendium_collection=n.compendium_collection AND e.source_path=n.source_path\nON CONFLICT (entry_id) DO UPDATE SET foundry_document_id=EXCLUDED.foundry_document_id,pack_label=EXCLUDED.pack_label,rarity=EXCLUDED.rarity,size=EXCLUDED.size,hp=EXCLUDED.hp,ac=EXCLUDED.ac,source_url=EXCLUDED.source_url,compendium_collection=EXCLUDED.compendium_collection;\nCOMMIT;\n`;
const outPath = path.join("db", "migrations", "036_seed_pf2e_bestiary_headers.sql");
fs.writeFileSync(outPath, output);
console.log(JSON.stringify({ entries: rows.length, output: outPath }));
