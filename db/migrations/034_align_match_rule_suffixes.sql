-- Keep the exported semantic-suffix list aligned with the importer's role suffixes,
-- including the hyphenated "research-field" form WG names can carry.
UPDATE compendium_match_rules
SET payload = '{"suffixes":["research field","research-field","methodology","bloodline","doctrine","mystery","patron","cause","muse","school","instinct","ikon","implement","apparition","thesis","curriculum","order"]}'::jsonb,
    notes = 'Canonical option matching for WG role-suffixed names, including the hyphenated research-field form.'
WHERE ruleset_id = 'pf2e-remaster'
  AND item_kind = '*'
  AND rule_key = 'semantic-role-suffixes';
