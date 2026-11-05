// Runtime loader for the WG -> PF2e match catalog (data/match-catalog.json). The file is NOT in git:
// db/tools/export-match-catalog.mjs generates it from wgi_rules (and stores the same payload in
// match_catalog_snapshots), or it is restored from the latest snapshot row; see db/README.md
// "Match catalog export". For an installed module, copy it into the module folder's data/.
// Only active rows are ever exported.
// A missing or invalid catalog never stops an import: matching falls back to exact names and
// every miss is reported unresolved with the reason "match catalog not loaded". Nothing is guessed.
import { MODULE_ID } from "./constants.js";

export const CATALOG_SCHEMA_VERSION = 1;
export const CATALOG_NOT_LOADED = "match catalog not loaded";

/**
 * Pure: validate a parsed catalog against the running PF2e version.
 * Returns { status: "loaded"|"missing"|"invalid", catalog, warnings, header }.
 */
export function checkCatalog(raw, systemVersion = null) {
  if (raw == null) return { status: "missing", catalog: null, warnings: [`WG match catalog: file not found; ${CATALOG_NOT_LOADED}, exact names only`], header: null };
  const h = raw.header;
  const aliases = Array.isArray(raw.aliases) ? raw.aliases : null;
  if (!h || h.schemaVersion !== CATALOG_SCHEMA_VERSION || !aliases || h.rowCount !== aliases.length) {
    return { status: "invalid", catalog: null, warnings: [`WG match catalog: invalid file (schema ${h?.schemaVersion ?? "?"}); ${CATALOG_NOT_LOADED}, exact names only`], header: h ?? null };
  }
  const active = aliases.filter((a) => a?.status === "active");
  const warnings = [];
  if (active.length !== aliases.length) warnings.push(`WG match catalog: ignored ${aliases.length - active.length} non-active row(s)`);
  if (systemVersion && h.pf2eVersion && systemVersion !== h.pf2eVersion) {
    warnings.push(`WG match catalog was built for PF2e ${h.pf2eVersion}; this world runs PF2e ${systemVersion}. Matches may be stale; check the unresolved list.`);
  }
  return { status: "loaded", catalog: { aliases: active }, warnings, header: h };
}

let cache = null;
/** Fetch and validate the installed catalog file once per session. */
export async function loadMatchCatalog({ fetchImpl = globalThis.fetch, systemVersion = globalThis.game?.system?.version ?? null, url = `modules/${MODULE_ID}/data/match-catalog.json` } = {}) {
  if (cache) return cache;
  let raw = null;
  try {
    const res = await fetchImpl(url, { cache: "no-cache" });
    raw = res?.ok ? await res.json() : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | match catalog fetch failed: ${err?.message ?? err}`);
    raw = null;
  }
  cache = checkCatalog(raw, systemVersion);
  for (const w of cache.warnings) console.warn(`${MODULE_ID} | ${w}`);
  return cache;
}
export function resetMatchCatalogCache() { cache = null; }

/** Split what planImport receives: a checkCatalog() result, a raw catalog, or nothing. */
export function unwrapCatalog(input) {
  if (input && typeof input === "object" && "status" in input && "warnings" in input) return input;
  if (input) return { status: "loaded", catalog: input, warnings: [], header: input.header ?? null };
  return { status: "missing", catalog: null, warnings: [], header: null };
}