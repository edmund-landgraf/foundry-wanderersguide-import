-- Exact class identity rows from the copied WG source database.
-- Multiple WG class rows may legitimately resolve to one PF2e class; the WG
-- content ID is retained so legacy/playtest/current rows remain distinct.
INSERT INTO class_sources
  (class_id, source_kind, wg_content_id, wg_scope, pf2e_slug,
   match_strategy, status, evidence_ref, notes)
SELECT c.class_id,
       'class',
       s.wg_id::text,
       'wg_source_entity_snapshot.class',
       c.pf2e_slug,
       'exact',
       'active',
       'WG source snapshot ' || s.source_repo || ' / ' || s.source_ref,
       'Exact WG class name match; source ID preserved for version-aware lookup.'
FROM wg_source_entity_snapshot s
JOIN classes c ON lower(c.name) = lower(s.wg_name)
WHERE s.source_table = 'class'
  AND NOT EXISTS (
    SELECT 1
    FROM class_sources existing
    WHERE existing.class_id = c.class_id
      AND existing.source_kind = 'class'
      AND existing.wg_content_id = s.wg_id::text
  );

UPDATE mapping_domain_inventory
SET active_match_count = (
      SELECT count(*)
      FROM class_sources
      WHERE source_kind = 'class'
        AND status = 'active'
        AND NULLIF(wg_content_id, '') IS NOT NULL
    ),
    status = 'active',
    notes = 'Exact WG class rows are source-backed; unmatched legacy/playtest rows remain unresolved.'
WHERE domain_id = 'class';

