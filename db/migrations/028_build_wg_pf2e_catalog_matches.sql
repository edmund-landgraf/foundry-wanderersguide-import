-- 028: Deterministic WG -> PF2e catalog resolution.
-- Exact names and already-approved aliases only. Ambiguous and missing rows stay
-- visible as unresolved; this migration never selects a best guess.
BEGIN;

TRUNCATE wg_pf2e_catalog_matches RESTART IDENTITY;

WITH wg AS (
  SELECT wg.source_table, wg.wg_id, wg.wg_name,
    CASE source_table
      WHEN 'class' THEN 'class'
      WHEN 'item' THEN 'equipment'
      WHEN 'spell' THEN 'spell'
      WHEN 'ability_block' THEN CASE row_data->>'type'
        WHEN 'feat' THEN 'feat'
        WHEN 'class-feature' THEN 'classfeature'
        WHEN 'classfeature' THEN 'classfeature'
        WHEN 'action' THEN 'action'
        WHEN 'heritage' THEN 'heritage'
        WHEN 'physical-feature' THEN 'ancestryfeature'
        WHEN 'sense' THEN 'ancestryfeature'
        ELSE NULL END
      ELSE NULL
    END AS item_kind,
    source_ref
  FROM wg_keyword_snapshot AS wg
), candidates AS (
  SELECT wg.source_table, wg.wg_id, wg.wg_name, wg.item_kind, wg.source_ref,
         e.entry_id, e.pf2e_name, 'exact'::text AS strategy,
         'PF2e exact name: ' || e.source_path AS evidence
  FROM wg AS wg
  JOIN pf2e_catalog_entries e
    ON e.ruleset_id = 'pf2e-remaster'
   AND e.item_kind = wg.item_kind
   AND lower(e.pf2e_name) = lower(wg.wg_name)
  WHERE wg.item_kind IS NOT NULL
  UNION ALL
  SELECT wg.source_table, wg.wg_id, wg.wg_name, wg.item_kind, wg.source_ref,
         e.entry_id, e.pf2e_name, 'alias'::text,
         'Active alias: ' || a.evidence_ref
  FROM wg AS wg
  JOIN compendium_match_aliases a
    ON a.ruleset_id = 'pf2e-remaster'
   AND a.status = 'active'
   AND lower(a.source_name) = lower(wg.wg_name)
   AND (a.item_kind = wg.item_kind OR a.item_kind = '*')
  JOIN pf2e_catalog_entries e
    ON e.ruleset_id = 'pf2e-remaster'
   AND e.item_kind = wg.item_kind
   AND lower(e.pf2e_name) = lower(a.target_name)
  WHERE wg.item_kind IS NOT NULL
), ranked AS (
  SELECT DISTINCT ON (source_table, wg_id, entry_id)
    source_table, wg_id, wg_name, entry_id, pf2e_name, strategy, evidence,
    count(*) OVER (PARTITION BY source_table, wg_id) AS candidate_count
  FROM candidates
  ORDER BY source_table, wg_id, entry_id,
    CASE strategy WHEN 'exact' THEN 1 ELSE 2 END
), all_wg AS (
  SELECT wg.source_table, wg.wg_id, wg.wg_name,
         count(r.entry_id)::integer AS candidate_count
  FROM wg AS wg LEFT JOIN ranked r USING (source_table, wg_id)
  GROUP BY wg.source_table, wg.wg_id, wg.wg_name
)
INSERT INTO wg_pf2e_catalog_matches
  (source_table, wg_id, wg_name, entry_id, pf2e_name, match_strategy,
   status, candidate_count, evidence_ref)
SELECT w.source_table, w.wg_id, w.wg_name, r.entry_id, r.pf2e_name,
  COALESCE(r.strategy, 'unresolved'),
  CASE WHEN w.candidate_count = 1 THEN 'active'
       WHEN w.candidate_count > 1 THEN 'ambiguous'
       ELSE 'unresolved' END,
  w.candidate_count,
  COALESCE(r.evidence, 'No exact or active-alias PF2e catalog entry')
FROM all_wg w
LEFT JOIN ranked r ON r.source_table = w.source_table AND r.wg_id = w.wg_id
 AND w.candidate_count = 1;

DROP VIEW IF EXISTS wg_pf2e_unresolved;
CREATE VIEW wg_pf2e_unresolved AS
SELECT * FROM wg_pf2e_catalog_matches
WHERE status IN ('unresolved', 'ambiguous');

COMMIT;
