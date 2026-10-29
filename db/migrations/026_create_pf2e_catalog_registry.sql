-- 026: PF2e catalog registry foundation.
-- Names, slugs, pack paths, and classification are stored locally so matching
-- never depends on a live Foundry compendium or WG endpoint.
BEGIN;

CREATE TABLE IF NOT EXISTS pf2e_catalog_entries (
  entry_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruleset_id text NOT NULL REFERENCES rulesets(ruleset_id) ON DELETE CASCADE,
  item_kind text NOT NULL,
  foundry_type text NOT NULL,
  pf2e_name text NOT NULL,
  pf2e_slug text NOT NULL,
  compendium_collection text NOT NULL,
  source_path text NOT NULL,
  category text,
  traits text,
  level integer,
  class_id text REFERENCES classes(class_id),
  pf2e_version text NOT NULL DEFAULT 'pf2e-8.6.1',
  pf2e_source_book text,
  UNIQUE (ruleset_id, compendium_collection, source_path)
);

CREATE INDEX IF NOT EXISTS idx_pf2e_catalog_entries_name
  ON pf2e_catalog_entries (lower(pf2e_name));
CREATE INDEX IF NOT EXISTS idx_pf2e_catalog_entries_slug
  ON pf2e_catalog_entries (ruleset_id, item_kind, pf2e_slug);

CREATE TABLE IF NOT EXISTS wg_pf2e_catalog_matches (
  match_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  wg_id bigint NOT NULL,
  wg_name text,
  wg_type text,
  entry_id bigint REFERENCES pf2e_catalog_entries(entry_id) ON DELETE CASCADE,
  pf2e_name text,
  match_strategy text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'proposed', 'ambiguous', 'unresolved')),
  candidate_count integer NOT NULL CHECK (candidate_count >= 0),
  evidence_ref text,
  UNIQUE (source_table, wg_id, entry_id, match_strategy)
);

CREATE INDEX IF NOT EXISTS idx_wg_pf2e_catalog_matches_source
  ON wg_pf2e_catalog_matches (source_table, wg_id);
CREATE INDEX IF NOT EXISTS idx_wg_pf2e_catalog_matches_active
  ON wg_pf2e_catalog_matches (status, source_table);

COMMIT;
