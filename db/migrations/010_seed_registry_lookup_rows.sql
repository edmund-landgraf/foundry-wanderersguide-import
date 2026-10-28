-- Seed the declarative lookup rows that are already evidenced by the runtime
-- importer and the class registry design. Class mechanics that lack WG
-- fixture evidence remain proposed or experimental; this migration does not
-- turn them into verified support.

-- Every registered class has one deterministic identity lookup. The PF2e slug
-- is already stored in classes.pf2e_slug; no WG content ID is invented here.
INSERT INTO class_sources
  (class_id, source_kind, wg_scope, pf2e_slug, match_strategy, status, evidence_ref, notes)
SELECT c.class_id, 'class', 'character.details.class', c.pf2e_slug,
       'slug', 'active', 'classes.pf2e_slug',
       'Class identity lookup only; class mechanics remain experimental until WG fixture validation.'
FROM classes c
WHERE c.pf2e_slug IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM class_sources s
    WHERE s.class_id = c.class_id
      AND s.source_kind = 'class'
      AND s.wg_scope = 'character.details.class'
  );

-- Shared selection interpretation already implemented in scripts/selections.js.
-- These rows describe policy, not executable behavior.
INSERT INTO selection_rules
  (class_id, source_pattern, owner_pattern, selection_kind, target_kind,
   legal_match, unresolved_policy, priority, status, evidence_ref, notes)
SELECT v.class_id, v.source_pattern, v.owner_pattern, v.selection_kind, v.target_kind,
       v.legal_match, v.unresolved_policy, v.priority, v.status, v.evidence_ref, v.notes
FROM (VALUES
  (NULL, 'character.operation_data.selections.class-feature-*_*', 'class-feature-*', 'choice', 'ChoiceSet', 'exact-id-or-unique-legal-label', 'prompt', 100, 'active', 'scripts/selections.js', 'Use WG answer only when exactly one legal PF2e option matches.'),
  (NULL, 'character.operation_data.selections.ancestry-section-*_*', 'ancestry-section-*', 'nested', 'ChoiceSet', 'exact-id-or-unique-legal-label', 'prompt', 110, 'active', 'scripts/selections.js', 'Nested ancestry selections remain unresolved when no unique legal option exists.'),
  (NULL, 'character.operation_data.selections.background_*', 'background', 'choice', 'ChoiceSet', 'exact-id-or-unique-legal-label', 'prompt', 120, 'active', 'scripts/selections.js', 'Background choices are evidence-driven and never first-option selected.'),
  (NULL, 'character.operation_data.selections.class_*', 'class', 'choice', 'ChoiceSet', 'exact-id-or-unique-legal-label', 'prompt', 130, 'active', 'scripts/selections.js', 'Class choices are matched by explicit WG answer and legal PF2e options.'),
  (NULL, 'character.operation_data.selections.*_ATTRIBUTE_*', NULL, 'attribute', 'system-field', 'exact-label-or-id', 'preserve', 200, 'active', 'scripts/selections.js', 'Attribute answers are recorded; PF2e remains authoritative for derived values.'),
  (NULL, 'character.operation_data.selections.*_SKILL_*', NULL, 'skill', 'system-field', 'exact-label-or-id', 'preserve', 210, 'active', 'scripts/selections.js', 'Skill training answers remain visible when the importer does not force derived proficiency fields.'),
  (NULL, 'character.operation_data.selections.ancestry_*', 'ancestry', 'language', 'system-field', 'exact-id-or-unique-label', 'preserve', 220, 'active', 'scripts/selections.js', 'Language choices are preserved only when WG provides an explicit answer.'),
  (NULL, 'character.operation_data.selections.*', NULL, 'unclassified', 'unresolved', 'evidence-only', 'prompt', 1000, 'active', 'scripts/selections.js', 'Catch-all policy: unsupported or ambiguous selections remain unresolved.')
) AS v(class_id, source_pattern, owner_pattern, selection_kind, target_kind, legal_match, unresolved_policy, priority, status, evidence_ref, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM selection_rules s
  WHERE s.class_id IS NOT DISTINCT FROM v.class_id
    AND s.source_pattern = v.source_pattern
    AND s.priority = v.priority
);

-- Spell-source conventions are not verified class mechanics yet. Create one
-- explicit proposed row per class so lookup by class_id is available while
-- preventing the registry from claiming a tradition, ability, or slot rule.
INSERT INTO spellcasting_rules
  (class_id, source_pattern, entry_kind, tradition, ability, slot_policy,
   status, evidence_ref, notes)
SELECT c.class_id, 'content.spell_sources[*]', 'source-derived', NULL, NULL,
       'source-slots', 'proposed', 'docs/CLASS_COVERAGE.md',
       'WG-specific tradition, ability, entry mode, and slot behavior require a real export and Foundry validation.'
FROM classes c
WHERE NOT EXISTS (
  SELECT 1 FROM spellcasting_rules s
  WHERE s.class_id = c.class_id
    AND s.source_pattern = 'content.spell_sources[*]'
);

-- These are intentionally narrow registry coverage cases: they validate only
-- the class identity lookup, not the class feature mechanics.
INSERT INTO coverage_cases
  (case_id, class_id, fixture_id, source_path, expected_status, reason_code,
   evidence_ref, last_verified, notes)
SELECT 'registry-class-' || c.class_id, c.class_id,
       'registry-class-' || c.class_id, 'character.details.class', 'mapped',
       'class-identity-slug', 'classes.pf2e_slug', CURRENT_DATE,
       'Synthetic registry case for deterministic class identity only; mechanics remain experimental.'
FROM classes c
WHERE NOT EXISTS (
  SELECT 1 FROM coverage_cases cc
  WHERE cc.case_id = 'registry-class-' || c.class_id
);
