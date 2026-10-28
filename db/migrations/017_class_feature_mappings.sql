-- Evidence-backed class-feature mappings that are not exact WG/PF2e names.
--
-- WG explicitly marks historical class-feature records with " (legacy)".
-- The mapping is activated only when removing that explicit marker produces
-- exactly one PF2e class-feature keyword in the local catalog. Ambiguous and
-- otherwise unresolved names remain outside this migration.
INSERT INTO wg_pf2e_keyword_matches
  (source_table, wg_id, wg_name, class_id, pf2e_keyword_id,
   match_strategy, status, evidence_ref, notes)
SELECT s.source_table,
       s.wg_id,
       s.wg_name,
       k.class_id,
       k.keyword_id,
       'alias',
       'active',
       'WG snapshot public.ability_block#' || s.wg_id
         || '; explicit legacy suffix; PF2e keyword catalog ' || k.source_path,
       'Deterministic legacy-name mapping: WG name ends with " (legacy)" and '
         || 'the base name matches exactly one PF2e class-feature keyword. '
         || 'No semantic inference; ambiguous candidates remain unresolved.'
FROM wg_keyword_snapshot AS s
JOIN pf2e_class_keywords AS k
  ON regexp_replace(
       lower(replace(s.wg_name, ' (legacy)', '')),
       '[^a-z0-9]+',
       '',
       'g'
     ) = regexp_replace(lower(k.pf2e_name), '[^a-z0-9]+', '', 'g')
WHERE s.source_table = 'ability_block'
  AND s.row_data->>'type' = 'class-feature'
  AND s.wg_name LIKE '% (legacy)'
  AND (
    SELECT count(*)
    FROM pf2e_class_keywords AS candidate
    WHERE regexp_replace(lower(candidate.pf2e_name), '[^a-z0-9]+', '', 'g') =
      regexp_replace(
        lower(replace(s.wg_name, ' (legacy)', '')),
        '[^a-z0-9]+',
        '',
        'g'
      )
  ) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM wg_pf2e_keyword_matches AS existing
    WHERE existing.source_table = s.source_table
      AND existing.wg_id = s.wg_id
      AND existing.class_id = k.class_id
      AND existing.pf2e_keyword_id = k.keyword_id
  );
