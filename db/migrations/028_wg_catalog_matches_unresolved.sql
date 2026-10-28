-- 028: One resolution row per WG ability_block against the PF2e 8.6.1 catalog.
-- Order: keyword match (class registry) > exact name > active alias > proposed alias.
-- More than one candidate after kind preference => 'ambiguous' (no pick is made).
-- No candidate => an explicit 'unresolved' row (never defaulted).
-- Derived table: rebuilt on every run, so it is idempotent.
BEGIN;
CREATE TABLE IF NOT EXISTS wg_pf2e_catalog_matches (
  match_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  wg_id bigint NOT NULL,
  wg_name text,
  wg_type text,
  entry_id bigint REFERENCES pf2e_catalog_entries(entry_id) ON DELETE CASCADE,
  pf2e_name text,
  match_strategy text NOT NULL CHECK (match_strategy IN ('keyword', 'exact', 'alias', 'unresolved')),
  status text NOT NULL CHECK (status IN ('active', 'proposed', 'ambiguous', 'unresolved')),
  candidate_count integer NOT NULL,
  evidence_ref text
);
CREATE INDEX IF NOT EXISTS idx_wg_catalog_matches_wg ON wg_pf2e_catalog_matches (source_table, wg_id);

CREATE TEMP TABLE _t ON COMMIT DROP AS
WITH wg AS (
  SELECT DISTINCT ON (wg_id) wg_id, wg_name, row_data->>'type' AS wg_type
  FROM wg_keyword_snapshot WHERE source_table = 'ability_block'
  ORDER BY wg_id, captured_at DESC
),
kw AS (
  SELECT DISTINCT m.wg_id, e.entry_id, 'keyword'::text AS strat, 1 AS prio, 'active'::text AS st
  FROM wg_pf2e_keyword_matches m
  JOIN pf2e_class_keywords k ON k.keyword_id = m.pf2e_keyword_id AND k.status = 'active'
  JOIN pf2e_catalog_entries e ON e.source_path = k.source_path AND e.compendium_collection = k.compendium_collection
  WHERE m.status = 'active' AND m.source_table = 'ability_block'
),
ex AS (
  SELECT wg.wg_id, e.entry_id, 'exact'::text, 2, 'active'::text
  FROM wg JOIN pf2e_catalog_entries e ON lower(e.pf2e_name) = lower(wg.wg_name)
),
al AS (
  SELECT wg.wg_id, e.entry_id, 'alias'::text,
         CASE WHEN a.status = 'active' THEN 3 ELSE 4 END,
         CASE WHEN a.status = 'active' THEN 'active' ELSE 'proposed' END
  FROM wg
  JOIN compendium_match_aliases a ON lower(a.source_name) = lower(wg.wg_name)
   AND a.status IN ('active', 'proposed') AND a.item_kind IN ('feat', 'action', 'heritage')
  JOIN pf2e_catalog_entries e ON lower(e.pf2e_name) = lower(a.target_name)
),
allc AS (SELECT * FROM kw UNION ALL SELECT * FROM ex UNION ALL SELECT * FROM al),
best AS (
  SELECT DISTINCT c.wg_id, c.entry_id, c.strat, c.st
  FROM (SELECT c.*, min(prio) OVER (PARTITION BY wg_id) AS mp FROM allc c) c WHERE c.prio = c.mp
),
pref AS (
  SELECT b.*, (e.item_kind = CASE wg.wg_type WHEN 'feat' THEN 'feat' WHEN 'class-feature' THEN 'classfeature'
                 WHEN 'heritage' THEN 'heritage' WHEN 'action' THEN 'action' END) IS TRUE AS pk
  FROM best b JOIN wg USING (wg_id) JOIN pf2e_catalog_entries e USING (entry_id)
),
p3 AS (
  SELECT * FROM (SELECT p.*, bool_or(pk) OVER (PARTITION BY wg_id) AS anypk FROM pref p) p WHERE pk OR NOT anypk
),
p4 AS (SELECT p3.*, count(*) OVER (PARTITION BY wg_id) AS n FROM p3)
SELECT wg.wg_id, wg.wg_name, wg.wg_type, p4.entry_id,
       COALESCE(p4.strat, 'unresolved') AS strat,
       CASE WHEN p4.wg_id IS NULL THEN 'unresolved' WHEN p4.n > 1 THEN 'ambiguous' ELSE p4.st END AS st,
       COALESCE(p4.n, 0)::int AS n
FROM wg LEFT JOIN p4 USING (wg_id);

TRUNCATE wg_pf2e_catalog_matches RESTART IDENTITY;
INSERT INTO wg_pf2e_catalog_matches (source_table, wg_id, wg_name, wg_type, entry_id, pf2e_name,
  match_strategy, status, candidate_count, evidence_ref)
SELECT 'ability_block', t.wg_id, t.wg_name, t.wg_type, t.entry_id, e.pf2e_name, t.strat, t.st, t.n,
       CASE WHEN e.source_path IS NULL THEN 'no PF2e 8.6.1 entry' ELSE 'PF2e 8.6.1: ' || e.source_path END
FROM _t t LEFT JOIN pf2e_catalog_entries e USING (entry_id);

CREATE OR REPLACE VIEW wg_pf2e_unresolved AS
SELECT wg_id, wg_name, wg_type, status, candidate_count
FROM wg_pf2e_catalog_matches WHERE status IN ('unresolved', 'ambiguous');
COMMIT;
