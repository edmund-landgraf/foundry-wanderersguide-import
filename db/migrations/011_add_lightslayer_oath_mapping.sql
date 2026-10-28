-- Evidence-backed WG/PF2e terminology mapping from the current Foundry/WG
-- comparison: Lightslayer Oath is the PF2e Oath of the Slayer item.
INSERT INTO compendium_match_aliases
  (ruleset_id, class_id, item_kind, source_name, target_name, source_slug,
   target_slug, match_strategy, rename_via, priority, status, evidence_ref, notes)
SELECT v.*
FROM (VALUES
  ('pf2e-remaster', NULL::text, 'feat', 'Lightslayer Oath', 'Oath of the Slayer',
   'lightslayer-oath', 'oath-of-the-slayer', 'canonical', 'class-rename',
   100, 'active', 'user-provided Foundry/WG comparison',
   'Multiple WG names may map to the same PF2e canonical item; this alias is exact and not fuzzy.')
) AS v(ruleset_id, class_id, item_kind, source_name, target_name, source_slug,
       target_slug, match_strategy, rename_via, priority, status, evidence_ref, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM compendium_match_aliases a
  WHERE a.ruleset_id = v.ruleset_id
    AND a.item_kind = v.item_kind
    AND a.source_slug = v.source_slug
    AND a.target_slug = v.target_slug
    AND COALESCE(a.class_id, '') = COALESCE(v.class_id, '')
);
