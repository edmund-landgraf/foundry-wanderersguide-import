import fs from "node:fs";
import path from "node:path";

const pf2eRoot = process.argv[2] ?? "D:/repos/foundryvtt_pf2e";
const outputPath = process.argv[3] ?? "db/seeds/pf2e_class_keywords.sql";

const classes = [
  "alchemist", "animist", "barbarian", "bard", "champion", "cleric",
  "commander", "druid", "exemplar", "fighter", "guardian", "gunslinger",
  "inventor", "investigator", "kineticist", "magus", "monk", "necromancer",
  "oracle", "psychic", "ranger", "rogue", "runesmith", "sorcerer",
  "summoner", "swashbuckler", "thaumaturge", "witch", "wizard",
];

const escapeSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const slugify = (value) => String(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const rows = [];
const add = (classId, itemKind, name, collection, sourcePath, foundryType) => {
  rows.push({
    classId,
    itemKind,
    name,
    slug: slugify(name),
    collection,
    sourcePath,
    foundryType,
  });
};

for (const classId of classes) {
  const featDir = path.join(pf2eRoot, "packs", "feats", "class", classId);
  if (fs.existsSync(featDir)) {
    for (const file of fs.readdirSync(featDir).filter((name) => name.endsWith(".json")).sort()) {
      const absolute = path.join(featDir, file);
      const item = JSON.parse(fs.readFileSync(absolute, "utf8"));
      if (typeof item.name === "string" && item.name.trim()) {
        add(classId, "feat", item.name, "pf2e.feats-srd", path.relative(pf2eRoot, absolute).replaceAll(path.sep, "/"), item.type ?? "feat");
      }
    }
  }
}

const featureDir = path.join(pf2eRoot, "packs", "classfeatures");
for (const file of fs.readdirSync(featureDir).filter((name) => name.endsWith(".json")).sort()) {
  const absolute = path.join(featureDir, file);
  const item = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const traits = new Set(item.system?.traits?.value ?? []);
  for (const classId of classes) {
    if (traits.has(classId) && typeof item.name === "string" && item.name.trim()) {
      add(classId, "classfeature", item.name, "pf2e.classfeatures", path.relative(pf2eRoot, absolute).replaceAll(path.sep, "/"), item.type ?? "feat");
    }
  }
}

rows.sort((a, b) => a.classId.localeCompare(b.classId) || a.itemKind.localeCompare(b.itemKind) || a.slug.localeCompare(b.slug) || a.sourcePath.localeCompare(b.sourcePath));
const values = rows.map((row) => `(${[
  "pf2e-remaster", row.classId, row.itemKind, row.name, row.slug,
  row.collection, row.sourcePath, row.foundryType, "active",
  `PF2e source: ${row.sourcePath}`,
].map(escapeSql).join(", ")})`).join(",\n  ");

const sql = `-- Generated from the checked-out PF2e repository at ${pf2eRoot.replaceAll("\\", "/")}.\n-- Do not hand-edit: rerun scripts/export-pf2e-class-keywords.mjs.\nINSERT INTO pf2e_class_keywords\n  (ruleset_id, class_id, item_kind, pf2e_name, pf2e_slug, compendium_collection, source_path, foundry_type, status, evidence_ref)\nVALUES\n  ${values}\nON CONFLICT (ruleset_id, class_id, item_kind, pf2e_slug, compendium_collection)\nDO UPDATE SET pf2e_name = EXCLUDED.pf2e_name, source_path = EXCLUDED.source_path,\n              foundry_type = EXCLUDED.foundry_type, status = EXCLUDED.status,\n              evidence_ref = EXCLUDED.evidence_ref;\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, sql, "utf8");
const present = new Set(rows.map((row) => row.classId));
console.log(JSON.stringify({ rows: rows.length, classesWithRows: present.size, classesWithoutRows: classes.filter((classId) => !present.has(classId)) }, null, 2));
