-- 026: Inferred (semantic) aliases are proposals until verified; aliases whose
-- feat/action/heritage target is not in PF2e 8.6.1 are retired. Idempotent.
BEGIN;
UPDATE compendium_match_aliases
SET status = 'proposed', notes = concat_ws(' ', NULLIF(notes, ''), '[026] semantic guess; verify before use.')
WHERE match_strategy = 'semantic' AND status = 'active';

UPDATE compendium_match_aliases a
SET status = 'retired', notes = concat_ws(' ', NULLIF(a.notes, ''), '[026] target not in PF2e 8.6.1.')
WHERE a.status <> 'retired' AND a.item_kind IN ('feat', 'action', 'heritage')
  AND NOT EXISTS (SELECT 1 FROM pf2e_catalog_entries e WHERE lower(e.pf2e_name) = lower(a.target_name));
COMMIT;
