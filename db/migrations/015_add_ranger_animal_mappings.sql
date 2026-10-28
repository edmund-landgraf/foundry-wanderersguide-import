-- WG's Ranger animal features are separate canonical PF2e items.
INSERT INTO compendium_match_aliases
  (ruleset_id, class_id, item_kind, source_name, target_name, source_slug,
   target_slug, match_strategy, rename_via, priority, status, evidence_ref, notes)
SELECT v.ruleset_id, v.class_id, v.item_kind, v.source_name, v.target_name,
       v.source_slug, v.target_slug, v.match_strategy, v.rename_via, 100,
       'active', v.evidence_ref, v.notes
FROM (VALUES
  ('pf2e-remaster', 'ranger', 'feat', 'Animal Companion (Ranger)', 'Animal Companion (Ranger)',
   'animal-companion-ranger', 'animal-companion-ranger', 'canonical', 'class-rename',
   'WG snapshot public.ability_block#19904; PF2e packs/feats/class/ranger/animal-companion-ranger.json',
   'Exact class-specific canonical item; do not collapse into the Druid item.'),
  ('pf2e-remaster', 'ranger', 'feat', 'Animal Empathy (Ranger)', 'Animal Empathy (Ranger)',
   'animal-empathy-ranger', 'animal-empathy-ranger', 'canonical', 'class-rename',
   'WG snapshot public.ability_block#19907; PF2e packs/feats/class/ranger/animal-empathy-ranger.json',
   'Exact class-specific canonical item; do not collapse into the Druid item.')
) AS v(ruleset_id, class_id, item_kind, source_name, target_name, source_slug,
       target_slug, match_strategy, rename_via, evidence_ref, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM compendium_match_aliases a
  WHERE a.ruleset_id = v.ruleset_id
    AND a.item_kind = v.item_kind
    AND a.source_slug = v.source_slug
    AND a.target_slug = v.target_slug
    AND a.class_id = v.class_id
);

