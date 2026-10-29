// Generate the PF2e catalog seed from a checked-out pf2e-8.6.1 repository.
// The generated SQL contains names, slugs, pack paths, and classification only.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: node db/tools/gen-pf2e-catalog.mjs <foundryvtt_pf2e>");
const packs = [
  ["feats", "pf2e.feats-srd", null], ["class-features", "pf2e.classfeatures", "classfeature"],
  ["actions", "pf2e.actionspf2e", "action"], ["heritages", "pf2e.heritages", "heritage"],
  ["classes", "pf2e.classes", "class"], ["ancestries", "pf2e.ancestries", "ancestry"],
  ["backgrounds", "pf2e.backgrounds", "background"], ["spells", "pf2e.spells-srd", "spell"],
  ["equipment", "pf2e.equipment-srd", "equipment"], ["ancestry-features", "pf2e.ancestryfeatures", "ancestryfeature"],
  ["deities", "pf2e.deities", "deity"], ["familiar-abilities", "pf2e.familiar-abilities", "familiarability"],
  ["boons-and-curses", "pf2e.boons-and-curses", "boon"], ["adventure-specific-actions", "pf2e.adventure-specific-actions", "adventureaction"],
  ["conditions", "pf2e.conditionitems", "condition"],
];
const kinds = ["feat", "classfeature", "action", "heritage", "class", "ancestry", "background", "spell", "equipment", "ancestryfeature", "deity", "familiarability", "boon", "adventureaction", "condition"];
const classes = new Set(["alchemist", "animist", "barbarian", "bard", "champion", "cleric", "commander", "druid", "exemplar", "fighter", "guardian", "gunslinger", "inventor", "investigator", "kineticist", "magus", "monk", "necromancer", "oracle", "psychic", "ranger", "rogue", "runesmith", "sorcerer", "summoner", "swashbuckler", "thaumaturge", "witch", "wizard"]);
const sql = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith(".json") && !entry.name.startsWith("_") ? [path.join(dir, entry.name)] : []);
const rows = [];
for (const [dir, collection, fixedKind] of packs) {
  for (const file of walk(path.join(root, "packs", "pf2e", dir))) {
    const item = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!item.name || !item.type) continue;
    const relative = path.relative(root, file).split(path.sep).join("/");
    const system = item.system ?? {};
    const traits = system.traits?.value ?? [];
    const classTraits = traits.filter((trait) => classes.has(trait));
    const kind = fixedKind ?? (system.category === "classfeature" ? "classfeature" : "feat");
    rows.push([kind, item.type, item.name, system.slug || path.basename(file, ".json"), collection, relative, system.category ?? null, traits.join(","), system.level?.value ?? null, classTraits.length === 1 ? classTraits[0] : null, system.publication?.title || null]);
  }
}
const values = rows.map((row) => `(${row.map((value, index) => index === 8 && value != null ? Number(value) : sql(value)).join(",")})`);
const chunks = [];
let body = "";
for (let i = 0; i < values.length; i += 500) body += `INSERT INTO _cat VALUES\n${values.slice(i, i + 500).join(",\n")};\n`;
const kindSql = kinds.map(sql).join(",");
const output = `-- Generated from PF2e 8.6.1; do not hand-edit.\nBEGIN;\nCREATE TEMP TABLE _cat (item_kind text, foundry_type text, pf2e_name text, pf2e_slug text, compendium_collection text, source_path text, category text, traits text, level integer, class_id text, pf2e_source_book text) ON COMMIT DROP;\n${body}INSERT INTO pf2e_catalog_entries (ruleset_id,item_kind,foundry_type,pf2e_name,pf2e_slug,compendium_collection,source_path,category,traits,level,class_id,pf2e_source_book) SELECT 'pf2e-remaster',item_kind,foundry_type,pf2e_name,pf2e_slug,compendium_collection,source_path,category,traits,level,class_id,pf2e_source_book FROM _cat WHERE item_kind IN (${kindSql}) ON CONFLICT (ruleset_id,compendium_collection,source_path) DO UPDATE SET item_kind=EXCLUDED.item_kind,foundry_type=EXCLUDED.foundry_type,pf2e_name=EXCLUDED.pf2e_name,pf2e_slug=EXCLUDED.pf2e_slug,category=EXCLUDED.category,traits=EXCLUDED.traits,level=EXCLUDED.level,class_id=EXCLUDED.class_id,pf2e_source_book=EXCLUDED.pf2e_source_book;\nCOMMIT;\n`;
fs.writeFileSync(path.join("db", "migrations", "027_seed_pf2e_catalog_8_6_1.sql"), output);
console.log(JSON.stringify({ entries: rows.length, output: "db/migrations/027_seed_pf2e_catalog_8_6_1.sql" }));
