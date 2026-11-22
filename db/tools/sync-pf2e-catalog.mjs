/**
 * Sync PF2e compendium headers into wgi_rules.pf2e_catalog_entries.
 *
 * Identity is (ruleset_id, compendium_collection, source_path). Foundry document
 * ids are not unique (reprints), and deleting a catalog row cascades into
 * wg_pf2e_catalog_matches, so rows missing from a new release are reported and
 * left in place. Their pf2e_version stays at the last release that contained them.
 *
 * Does not rebuild grant rules, class keywords, spell keywords, aliases, or the
 * match-catalog export. Review the report before exporting a new catalog.
 *
 * Usage (from the import repo):
 *   node db/tools/sync-pf2e-catalog.mjs <foundryvtt_pf2e>
 *   node db/tools/sync-pf2e-catalog.mjs <foundryvtt_pf2e> --apply
 *
 * Default is a dry run. --apply writes the catalog and bestiary headers.
 * Postgres is the my-postgres container, database wgi_rules, user appuser.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
const baseKinds = [
  "action", "adventureaction", "ancestry", "ancestryfeature", "army", "background", "boon",
  "campaignFeature", "character", "class", "classfeature", "condition", "deity", "effect",
  "equipment", "familiar", "familiarability", "feat", "hazard", "heritage", "npc", "spell", "vehicle"
];

const root = process.argv[2];
const apply = process.argv.includes("--apply");
if (!root) {
  console.error("usage: node db/tools/sync-pf2e-catalog.mjs <foundryvtt_pf2e> [--apply]");
  process.exit(1);
}

const container = process.env.WGI_PG_CONTAINER || "my-postgres";
const db = "wgi_rules";
const user = "appuser";
const ruleset = "pf2e-remaster";

function psql(sql) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
  }
  return result.stdout;
}

function psqlCsv(sql) {
  const result = spawnSync("docker", ["exec", container, "psql", "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(result.stderr || `psql exited ${result.status}`);
  return result.stdout;
}

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

function effectOrigin(doc) {
  if (doc.type !== "effect") return null;
  const match = String(doc.system?.description?.value ?? "").match(/Compendium\.[^\]\s"']+/);
  return match ? match[0] : null;
}

function blank(value) {
  if (value == null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function same(a, b) {
  return blank(a) === blank(b);
}

function sameNum(a, b) {
  return num(a) === num(b);
}

function extract(pf2eRoot, classIds) {
  const system = JSON.parse(fs.readFileSync(path.join(pf2eRoot, "system.pf2e.json"), "utf8"));
  const byFolder = new Map();
  for (const pack of system.packs) {
    if (pack.system !== "pf2e" || !pack.path || !pack.name) continue;
    const folder = pack.path.split("/").filter(Boolean).pop();
    byFolder.set(folder, pack);
  }
  const packsRoot = path.join(pf2eRoot, "packs", "pf2e");
  const rows = [];
  for (const folder of fs.readdirSync(packsRoot)) {
    if (skip.has(folder)) continue;
    const dir = path.join(packsRoot, folder);
    if (!fs.statSync(dir).isDirectory()) continue;
    const pack = byFolder.get(folder);
    const collection = pack ? `pf2e.${pack.name}` : `pf2e.${folder}`;
    const label = pack?.label ?? folder;
    for (const file of walk(dir)) {
      const doc = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!doc.type || !doc._id || !doc.name) continue;
      const sys = doc.system ?? {};
      const traits = sys.traits ?? {};
      const traitList = Array.isArray(traits.value) ? traits.value.filter(Boolean) : [];
      const traditions = Array.isArray(traits.traditions) ? traits.traditions.filter(Boolean) : [];
      const publication = sys.publication ?? sys.details?.publication ?? {};
      const material = sys.material && typeof sys.material === "object" ? sys.material.type : (typeof sys.material === "string" ? sys.material : null);
      const grade = sys.grade == null || typeof sys.grade === "object" ? null : String(sys.grade);
      const classTraits = traitList.filter((trait) => classIds.has(trait));
      const relative = path.relative(pf2eRoot, file).split(path.sep).join("/");
      const npc = doc.type === "npc";
      rows.push({
        item_kind: kindFor(folder, doc),
        foundry_type: doc.type,
        pf2e_name: doc.name,
        pf2e_slug: sys.slug || path.basename(file, ".json"),
        compendium_collection: collection,
        source_path: relative,
        category: sys.category ?? null,
        traits: traitList.join(",") || null,
        level: num(sys.level?.value ?? sys.details?.level?.value),
        class_id: classTraits.length === 1 ? classTraits[0] : null,
        pf2e_source_book: publication.title || null,
        foundry_document_id: doc._id,
        source_url: `https://github.com/foundryvtt/pf2e/blob/master/${relative}`,
        rarity: traits.rarity ?? null,
        traditions: traditions.join(",") || null,
        pack_label: label,
        foundry_pack_id: pack ? `pf2e.${pack.name}` : null,
        base_item: sys.baseItem ?? null,
        item_group: typeof sys.group === "string" ? sys.group : null,
        grade,
        material: material || null,
        remaster: publication.remaster == null ? null : Boolean(publication.remaster),
        publication_license: publication.license ?? null,
        effect_origin: effectOrigin(doc),
        size: npc ? (traits.size?.value ?? null) : null,
        hp: npc ? num(sys.attributes?.hp?.max) : null,
        ac: npc ? num(sys.attributes?.ac?.value) : null
      });
    }
  }
  return { version: system.version, rows };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] === "" ? null : cells[index]])));
}

const contentFields = [
  "item_kind", "foundry_type", "pf2e_name", "pf2e_slug", "compendium_collection", "category", "traits", "level",
  "class_id", "pf2e_source_book", "foundry_document_id", "rarity", "traditions", "pack_label", "foundry_pack_id",
  "base_item", "item_group", "grade", "material", "remaster", "publication_license", "effect_origin"
];
const numericFields = new Set(["level", "hp", "ac"]);

function changedFields(existing, incoming) {
  const fields = [];
  const consider = incoming.foundry_type === "npc" ? contentFields.concat(["size", "hp", "ac"]) : contentFields;
  for (const field of consider) {
    const equal = numericFields.has(field) || field === "hp" || field === "ac"
      ? sameNum(existing[field], incoming[field])
      : same(existing[field], incoming[field]);
    if (!equal) fields.push({ field, from: existing[field] ?? null, to: incoming[field] ?? null });
  }
  return fields;
}

function csvCell(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function diffCatalog(existingRows, incomingRows) {
  const existingByPath = new Map(existingRows.map((row) => [row.source_path, row]));
  const incomingByPath = new Map();
  const incomingIds = new Map();
  for (const row of incomingRows) {
    if (incomingByPath.has(row.source_path)) throw new Error(`duplicate source_path in packs: ${row.source_path}`);
    incomingByPath.set(row.source_path, row);
    const list = incomingIds.get(row.foundry_document_id) ?? [];
    list.push(row);
    incomingIds.set(row.foundry_document_id, list);
  }
  const existingIds = new Map();
  for (const row of existingRows) {
    const list = existingIds.get(row.foundry_document_id) ?? [];
    list.push(row);
    existingIds.set(row.foundry_document_id, list);
  }

  const moves = [];
  const usedExisting = new Set();
  for (const [id, incomingList] of incomingIds) {
    if (incomingList.length !== 1) continue;
    const incoming = incomingList[0];
    if (existingByPath.has(incoming.source_path)) continue;
    const existingList = existingIds.get(id) ?? [];
    if (existingList.length !== 1) continue;
    const existing = existingList[0];
    if (incomingByPath.has(existing.source_path) && existing.source_path !== incoming.source_path) continue;
    if (usedExisting.has(existing.source_path)) continue;
    moves.push({ from: existing.source_path, to: incoming.source_path, name: incoming.pf2e_name, id });
    usedExisting.add(existing.source_path);
  }
  const movedFrom = new Set(moves.map((move) => move.from));

  const added = [];
  const changed = [];
  let relabeled = 0;
  const moveSource = new Map(moves.map((move) => [move.to, existingByPath.get(move.from)]));
  for (const incoming of incomingRows) {
    const existing = existingByPath.get(incoming.source_path) ?? moveSource.get(incoming.source_path);
    if (!existing) {
      added.push({ source_path: incoming.source_path, name: incoming.pf2e_name, item_kind: incoming.item_kind });
      continue;
    }
    const fields = changedFields(existing, incoming);
    if (!fields.length) continue;
    // The 8.6.1 header load stored the pack folder name in pack_label. Filling the real label is not a rules change.
    if (fields.length === 1 && fields[0].field === "pack_label") {
      relabeled += 1;
      continue;
    }
    changed.push({ source_path: incoming.source_path, name: incoming.pf2e_name, from: existing.pf2e_name, fields });
  }
  const retired = existingRows
    .filter((row) => !incomingByPath.has(row.source_path) && !movedFrom.has(row.source_path))
    .map((row) => ({ source_path: row.source_path, name: row.pf2e_name, item_kind: row.item_kind, pf2e_version: row.pf2e_version }));
  return { added, changed, moves, retired, relabeled };
}

const classIds = new Set(parseCsv(psqlCsv("COPY (SELECT class_id FROM classes ORDER BY 1) TO STDOUT WITH CSV HEADER")).map((row) => row.class_id));
const { version, rows } = extract(path.resolve(root), classIds);
const versionTag = `pf2e-${version}`;
const existing = parseCsv(psqlCsv(`COPY (
  SELECT e.source_path, e.item_kind, e.foundry_type, e.pf2e_name, e.pf2e_slug, e.compendium_collection,
    e.category, e.traits, e.level::text AS level, e.class_id, e.pf2e_source_book, e.foundry_document_id,
    e.rarity, e.traditions, e.pack_label, e.foundry_pack_id, e.base_item, e.item_group, e.grade, e.material,
    e.remaster::text AS remaster, e.publication_license, e.effect_origin, e.pf2e_version,
    h.size, h.hp::text AS hp, h.ac::text AS ac
  FROM pf2e_catalog_entries e
  LEFT JOIN pf2e_bestiary_headers h ON h.entry_id = e.entry_id
  WHERE e.ruleset_id = '${ruleset}'
) TO STDOUT WITH CSV HEADER`));

for (const row of existing) {
  if (row.remaster === "true") row.remaster = true;
  else if (row.remaster === "false") row.remaster = false;
  else row.remaster = null;
}

const report = diffCatalog(existing, rows);
const summary = {
  pf2e_version: versionTag,
  packs: rows.length,
  catalog: existing.length,
  added: report.added.length,
  changed: report.changed.length,
  moved: report.moves.length,
  retired: report.retired.length,
  relabeled: report.relabeled,
  apply
};
const reportDir = path.join("db", "reports");
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `pf2e-${version}-catalog-sync.json`);
fs.writeFileSync(reportPath, JSON.stringify({ summary, ...report }, null, 2));
console.log(JSON.stringify({ ...summary, report: reportPath }));

if (!apply) {
  console.log("Dry run. Re-run with --apply to write wgi_rules.");
  process.exit(0);
}

const columns = [
  "item_kind", "foundry_type", "pf2e_name", "pf2e_slug", "compendium_collection", "source_path", "category", "traits",
  "level", "class_id", "pf2e_source_book", "foundry_document_id", "source_url", "rarity", "traditions", "pack_label",
  "foundry_pack_id", "base_item", "item_group", "grade", "material", "remaster", "publication_license", "effect_origin",
  "size", "hp", "ac", "old_source_path"
];
const moveTo = new Map(report.moves.map((move) => [move.to, move.from]));
const csv = [columns.join(",")].concat(rows.map((row) => columns.map((column) => {
  if (column === "old_source_path") return csvCell(moveTo.get(row.source_path) ?? null);
  if (column === "remaster") return row.remaster == null ? "" : row.remaster ? "true" : "false";
  return csvCell(row[column]);
}).join(","))).join("\n") + "\n";

const csvHost = path.join(reportDir, `pf2e-${version}-catalog-sync.csv`);
fs.writeFileSync(csvHost, csv);
const copy = spawnSync("docker", ["cp", csvHost, `${container}:/tmp/pf2e-catalog-sync.csv`], { encoding: "utf8" });
if (copy.status !== 0) throw new Error(copy.stderr || "docker cp failed");

const kinds = [...new Set([...baseKinds, ...rows.map((row) => row.item_kind)])].sort();
const kindSql = kinds.map((kind) => `'${kind.replaceAll("'", "''")}'`).join(",");
const sql = `
BEGIN;
ALTER TABLE pf2e_catalog_entries DROP CONSTRAINT IF EXISTS pf2e_catalog_entries_item_kind_check;
ALTER TABLE pf2e_catalog_entries ADD CONSTRAINT pf2e_catalog_entries_item_kind_check CHECK (item_kind = ANY (ARRAY[${kindSql}]));
CREATE TEMP TABLE _sync (
  item_kind text, foundry_type text, pf2e_name text, pf2e_slug text, compendium_collection text, source_path text,
  category text, traits text, level integer, class_id text, pf2e_source_book text, foundry_document_id text,
  source_url text, rarity text, traditions text, pack_label text, foundry_pack_id text, base_item text,
  item_group text, grade text, material text, remaster boolean, publication_license text, effect_origin text,
  size text, hp integer, ac integer, old_source_path text
) ON COMMIT DROP;
COPY _sync FROM '/tmp/pf2e-catalog-sync.csv' WITH CSV HEADER;
UPDATE pf2e_catalog_entries e SET
  source_path = s.source_path,
  compendium_collection = s.compendium_collection
FROM _sync s
WHERE s.old_source_path IS NOT NULL
  AND e.ruleset_id = '${ruleset}'
  AND e.source_path = s.old_source_path;
UPDATE pf2e_catalog_entries e SET
  item_kind = s.item_kind,
  foundry_type = s.foundry_type,
  pf2e_name = s.pf2e_name,
  pf2e_slug = s.pf2e_slug,
  compendium_collection = s.compendium_collection,
  category = NULLIF(s.category, ''),
  traits = NULLIF(s.traits, ''),
  level = s.level,
  class_id = s.class_id,
  pf2e_source_book = NULLIF(s.pf2e_source_book, ''),
  foundry_document_id = s.foundry_document_id,
  source_url = s.source_url,
  rarity = NULLIF(s.rarity, ''),
  traditions = NULLIF(s.traditions, ''),
  pack_label = s.pack_label,
  foundry_pack_id = s.foundry_pack_id,
  base_item = NULLIF(s.base_item, ''),
  item_group = NULLIF(s.item_group, ''),
  grade = NULLIF(s.grade, ''),
  material = NULLIF(s.material, ''),
  remaster = s.remaster,
  publication_license = NULLIF(s.publication_license, ''),
  effect_origin = NULLIF(s.effect_origin, ''),
  pf2e_version = '${versionTag}'
FROM _sync s
WHERE e.ruleset_id = '${ruleset}' AND e.source_path = s.source_path;
INSERT INTO pf2e_catalog_entries (
  ruleset_id, item_kind, foundry_type, pf2e_name, pf2e_slug, compendium_collection, source_path, category, traits,
  level, class_id, pf2e_source_book, foundry_document_id, source_url, rarity, traditions, pack_label, foundry_pack_id,
  base_item, item_group, grade, material, remaster, publication_license, effect_origin, pf2e_version
)
SELECT '${ruleset}', s.item_kind, s.foundry_type, s.pf2e_name, s.pf2e_slug, s.compendium_collection, s.source_path,
  NULLIF(s.category, ''), NULLIF(s.traits, ''), s.level, s.class_id, NULLIF(s.pf2e_source_book, ''), s.foundry_document_id,
  s.source_url, NULLIF(s.rarity, ''), NULLIF(s.traditions, ''), s.pack_label, s.foundry_pack_id, NULLIF(s.base_item, ''),
  NULLIF(s.item_group, ''), NULLIF(s.grade, ''), NULLIF(s.material, ''), s.remaster, NULLIF(s.publication_license, ''),
  NULLIF(s.effect_origin, ''), '${versionTag}'
FROM _sync s
WHERE NOT EXISTS (
  SELECT 1 FROM pf2e_catalog_entries e
  WHERE e.ruleset_id = '${ruleset}' AND e.compendium_collection = s.compendium_collection AND e.source_path = s.source_path
);
INSERT INTO pf2e_bestiary_headers (entry_id, foundry_document_id, pack_label, rarity, size, hp, ac, source_url, compendium_collection)
SELECT e.entry_id, e.foundry_document_id, COALESCE(e.pack_label, e.compendium_collection), e.rarity, s.size, s.hp, s.ac,
  COALESCE(e.source_url, ''), e.compendium_collection
FROM _sync s
JOIN pf2e_catalog_entries e ON e.ruleset_id = '${ruleset}' AND e.source_path = s.source_path
WHERE s.foundry_type = 'npc' AND e.foundry_document_id IS NOT NULL
ON CONFLICT (entry_id) DO UPDATE SET
  foundry_document_id = EXCLUDED.foundry_document_id,
  pack_label = EXCLUDED.pack_label,
  rarity = EXCLUDED.rarity,
  size = EXCLUDED.size,
  hp = EXCLUDED.hp,
  ac = EXCLUDED.ac,
  source_url = EXCLUDED.source_url,
  compendium_collection = EXCLUDED.compendium_collection;
DELETE FROM pf2e_bestiary_headers h
USING pf2e_catalog_entries e
WHERE h.entry_id = e.entry_id
  AND e.ruleset_id = '${ruleset}'
  AND e.foundry_type = 'npc'
  AND NOT EXISTS (SELECT 1 FROM _sync s WHERE s.source_path = e.source_path AND s.foundry_type = 'npc');
COMMIT;
`;
psql(sql);
fs.rmSync(csvHost);
spawnSync("docker", ["exec", container, "rm", "-f", "/tmp/pf2e-catalog-sync.csv"]);
const counts = psqlCsv(`COPY (SELECT pf2e_version, count(*) FROM pf2e_catalog_entries GROUP BY 1 ORDER BY 1) TO STDOUT WITH CSV`);
console.log(counts.trim());
console.log("Applied. Retired rows were kept so existing WG matches still resolve.");
