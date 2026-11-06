-- Exact WG -> PF2e feat key-value mappings.
--
-- This batch is deliberately limited to rows where the WG ability_block is a
-- feat and its name matches one PF2e class feat name exactly (case-insensitive)
-- within the same class. Ambiguous, renamed, and unmatched rows remain out of
-- this migration. The snapshot ID and PF2e source path provide row-level
-- provenance for every inserted mapping.

INSERT INTO compendium_match_aliases
  (ruleset_id, class_id, item_kind, source_name, target_name,
   source_slug, target_slug, match_strategy, rename_via, priority,
   status, evidence_ref, notes)
SELECT a.ruleset_id,
       a.class_id,
       'feat',
       a.source_name,
       a.target_name,
       wgi_sluggify(a.source_name),
       wgi_sluggify(a.target_name),
       'exact',
       'exact',
       100,
       'active',
       a.evidence_ref,
       'Exact case-insensitive WG feat name match to one PF2e class feat; no rename or semantic inference.'
FROM (
  SELECT DISTINCT ON (wgi_sluggify(s.wg_name), k.class_id, wgi_sluggify(k.pf2e_name))
         'pf2e-remaster'::text AS ruleset_id,
         k.class_id,
         s.wg_name AS source_name,
         k.pf2e_name AS target_name,
         'WG snapshot ' || s.source_ref || '#' || s.wg_id::text ||
           '; PF2e source ' || k.source_path AS evidence_ref
  FROM wg_keyword_snapshot s
  JOIN pf2e_class_keywords k
    ON k.item_kind = 'feat'
   AND k.status = 'active'
   AND lower(s.wg_name) = lower(k.pf2e_name)
  WHERE s.source_table = 'ability_block'
    AND lower(COALESCE(s.row_data->>'type', '')) = 'feat'
    AND s.wg_name IS NOT NULL
  ORDER BY wgi_sluggify(s.wg_name), k.class_id, wgi_sluggify(k.pf2e_name), s.snapshot_id
) AS a
WHERE NOT EXISTS (
  SELECT 1
  FROM compendium_match_aliases existing
  WHERE existing.ruleset_id = a.ruleset_id
    AND existing.item_kind = 'feat'
    AND existing.source_slug = wgi_sluggify(a.source_name)
    AND existing.target_slug = wgi_sluggify(a.target_name)
    AND COALESCE(existing.class_id, '') = COALESCE(a.class_id, '')
);
