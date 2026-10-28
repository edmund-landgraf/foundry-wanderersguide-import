-- Class-aware source renames and dependency-ordered Foundry plans.
-- Target database: wgi_rules. Does not change the Foundry module.

ALTER TABLE compendium_match_aliases
  ADD COLUMN IF NOT EXISTS class_id text REFERENCES classes(class_id),
  ADD COLUMN IF NOT EXISTS rename_via text;

UPDATE compendium_match_aliases
SET rename_via = CASE match_strategy
  WHEN 'semantic' THEN 'semantic-suffix'
  WHEN 'grade-fallback' THEN 'grade-swap'
  ELSE 'class-rename'
END
WHERE rename_via IS NULL;

ALTER TABLE compendium_match_aliases
  ALTER COLUMN rename_via SET NOT NULL;

ALTER TABLE compendium_match_aliases
  DROP CONSTRAINT IF EXISTS compendium_match_aliases_rename_via_check;
ALTER TABLE compendium_match_aliases
  ADD CONSTRAINT compendium_match_aliases_rename_via_check
  CHECK (rename_via IN ('exact', 'class-rename', 'grade-swap', 'semantic-suffix'));

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'compendium_match_aliases'::regclass AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%source_slug%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE compendium_match_aliases DROP CONSTRAINT %I', c);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_match_aliases_class
  ON compendium_match_aliases (ruleset_id, item_kind, source_slug, target_slug, COALESCE(class_id, ''));

ALTER TABLE pc_items
  ADD COLUMN IF NOT EXISTS resolved_name text,
  ADD COLUMN IF NOT EXISTS resolved_slug text,
  ADD COLUMN IF NOT EXISTS rename_via text,
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'source',
  ADD COLUMN IF NOT EXISTS grant_parent_path text;

ALTER TABLE pc_items DROP CONSTRAINT IF EXISTS pc_items_provenance_check;
ALTER TABLE pc_items ADD CONSTRAINT pc_items_provenance_check
  CHECK (provenance IN ('source', 'grant-child', 'rules-selection'));

ALTER TABLE pc_spells
  ADD COLUMN IF NOT EXISTS resolved_name text,
  ADD COLUMN IF NOT EXISTS resolved_slug text,
  ADD COLUMN IF NOT EXISTS rename_via text;

ALTER TABLE pc_foundry_plan
  ADD COLUMN IF NOT EXISTS batch integer NOT NULL DEFAULT 0;

INSERT INTO compendium_match_rules
  (ruleset_id, item_kind, rule_key, rule_kind, payload, priority, status, evidence_ref, notes)
VALUES
  ('pf2e-remaster', 'equipment', 'grade-words', 'grade-fallback',
   '{"grades":["Minor","Lesser","Moderate","Standard","Greater","Major","True"]}',
   45, 'active', 'scripts/item-renames.js:GRADE_WORDS',
   'Title-case grade words used to swap prefix and parenthetical forms before lookup.')
ON CONFLICT (ruleset_id, item_kind, rule_key)
DO UPDATE SET payload = EXCLUDED.payload, status = EXCLUDED.status, notes = EXCLUDED.notes;

CREATE OR REPLACE FUNCTION wgi_sluggify(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(lower(
    regexp_replace(regexp_replace(replace(replace(coalesce(p_name, ''), '''', ''), '’', ''),
      '\((remastered|legacy)\)', '', 'gi'),
    '[^a-zA-Z0-9]+', '-', 'g')), '-+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION wgi_run_class_id(p_import_run_id bigint)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT c.class_id
  FROM pc_import_runs r
  JOIN test_pc_fixtures f ON f.fixture_key = r.fixture_key
  JOIN classes c ON lower(c.name) = lower(f.wg_export #>> '{character,details,class,name}')
  WHERE r.import_run_id = p_import_run_id;
$$;

CREATE OR REPLACE FUNCTION resolve_source_name(
  p_ruleset_id text,
  p_class_id text,
  p_item_kind text,
  p_source_name text
)
RETURNS TABLE (candidate_name text, candidate_slug text, rename_via text, alias_id bigint, priority integer)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  source_slug text := wgi_sluggify(p_source_name);
  grades text;
  swapped text;
  parts text[];
  suffixes jsonb;
  suffix text;
  stem text;
BEGIN
  IF source_slug IS NULL OR source_slug = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.target_name, a.target_slug, a.rename_via, a.alias_id, a.priority
  FROM compendium_match_aliases a
  WHERE a.ruleset_id = p_ruleset_id AND a.status = 'active'
    AND (a.item_kind = p_item_kind OR a.item_kind = '*')
    AND a.source_slug = source_slug
    AND a.class_id = p_class_id
  ORDER BY a.priority, a.alias_id;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.target_name, a.target_slug, a.rename_via, a.alias_id, a.priority
  FROM compendium_match_aliases a
  WHERE a.ruleset_id = p_ruleset_id AND a.status = 'active'
    AND (a.item_kind = p_item_kind OR a.item_kind = '*')
    AND a.source_slug = source_slug
    AND a.class_id IS NULL
  ORDER BY a.priority, a.alias_id;
  IF FOUND THEN RETURN; END IF;

  SELECT string_agg(g, '|') INTO grades
  FROM jsonb_array_elements_text(COALESCE(
    (SELECT payload->'grades' FROM compendium_match_rules
     WHERE ruleset_id = p_ruleset_id AND rule_key = 'grade-words' AND status = 'active'
     ORDER BY priority LIMIT 1),
    '["Minor","Lesser","Moderate","Standard","Greater","Major","True"]'::jsonb)) g;

  parts := regexp_match(btrim(p_source_name), '^(' || grades || ') (.+)$', 'i');
  IF parts IS NOT NULL THEN
    swapped := parts[2] || ' (' || parts[1] || ')';
  ELSE
    parts := regexp_match(btrim(p_source_name), '^(.+) \((' || grades || ')\)$', 'i');
    IF parts IS NOT NULL THEN
      swapped := parts[2] || ' ' || parts[1];
    END IF;
  END IF;

  IF swapped IS NOT NULL THEN
    RETURN QUERY
    SELECT a.target_name, a.target_slug, 'grade-swap'::text, a.alias_id, a.priority
    FROM compendium_match_aliases a
    WHERE a.ruleset_id = p_ruleset_id AND a.status = 'active'
      AND (a.item_kind = p_item_kind OR a.item_kind = '*')
      AND a.source_slug = wgi_sluggify(swapped)
      AND (a.class_id = p_class_id OR a.class_id IS NULL)
    ORDER BY (a.class_id IS NULL), a.priority, a.alias_id;
    IF FOUND THEN RETURN; END IF;

    candidate_name := swapped;
    candidate_slug := wgi_sluggify(swapped);
    rename_via := 'grade-swap';
    alias_id := NULL;
    priority := 1000;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT payload->'suffixes' INTO suffixes
  FROM compendium_match_rules
  WHERE ruleset_id = p_ruleset_id AND rule_kind = 'semantic-suffix' AND status = 'active'
  ORDER BY priority LIMIT 1;

  SELECT s INTO suffix
  FROM jsonb_array_elements_text(COALESCE(suffixes, '[]'::jsonb)) s
  WHERE right(lower(btrim(p_source_name)), char_length(s) + 1) = ' ' || lower(s)
  ORDER BY char_length(s) DESC
  LIMIT 1;

  IF suffix IS NOT NULL THEN
    stem := btrim(left(btrim(p_source_name), char_length(btrim(p_source_name)) - char_length(suffix)));
    IF stem <> '' THEN
      candidate_name := stem;
      candidate_slug := wgi_sluggify(stem);
      rename_via := 'semantic-suffix';
      alias_id := NULL;
      priority := 1100;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  candidate_name := btrim(p_source_name);
  candidate_slug := source_slug;
  rename_via := 'exact';
  alias_id := NULL;
  priority := 2000;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_run_item_names(p_import_run_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  WITH cand AS (
    SELECT i.item_id, r.candidate_name, r.candidate_slug, r.rename_via, r.alias_id, r.priority
    FROM pc_items i
    JOIN pc_import_runs run ON run.import_run_id = i.import_run_id
    CROSS JOIN LATERAL resolve_source_name(run.ruleset_id, wgi_run_class_id(run.import_run_id), i.item_kind, i.name) r
    WHERE i.import_run_id = p_import_run_id AND i.name IS NOT NULL
  ), agg AS (
    SELECT item_id, count(*) AS n,
      (array_agg(candidate_name ORDER BY priority, alias_id NULLS LAST))[1] AS candidate_name,
      (array_agg(candidate_slug ORDER BY priority, alias_id NULLS LAST))[1] AS candidate_slug,
      (array_agg(rename_via ORDER BY priority, alias_id NULLS LAST))[1] AS rename_via,
      (array_agg(alias_id ORDER BY priority, alias_id NULLS LAST))[1] AS alias_id
    FROM cand GROUP BY item_id
  )
  UPDATE pc_items i
  SET resolved_name = CASE WHEN agg.n = 1 THEN agg.candidate_name END,
      resolved_slug = CASE WHEN agg.n = 1 THEN agg.candidate_slug END,
      rename_via = CASE WHEN agg.n = 1 THEN agg.rename_via END,
      match_status = CASE
        WHEN agg.n = 1 AND agg.alias_id IS NOT NULL THEN 'renamed'
        WHEN agg.n = 1 AND agg.rename_via IN ('grade-swap', 'semantic-suffix') THEN 'renamed'
        WHEN agg.n > 1 THEN 'ambiguous'
        ELSE 'unmatched'
      END
  FROM agg
  WHERE i.item_id = agg.item_id;

  WITH cand AS (
    SELECT s.spell_id, r.candidate_name, r.candidate_slug, r.rename_via, r.alias_id, r.priority
    FROM pc_spells s
    JOIN pc_import_runs run ON run.import_run_id = s.import_run_id
    CROSS JOIN LATERAL resolve_source_name(run.ruleset_id, wgi_run_class_id(run.import_run_id), 'spell', s.name) r
    WHERE s.import_run_id = p_import_run_id AND s.name IS NOT NULL
  ), agg AS (
    SELECT spell_id, count(*) AS n,
      (array_agg(candidate_name ORDER BY priority, alias_id NULLS LAST))[1] AS candidate_name,
      (array_agg(candidate_slug ORDER BY priority, alias_id NULLS LAST))[1] AS candidate_slug,
      (array_agg(rename_via ORDER BY priority, alias_id NULLS LAST))[1] AS rename_via,
      (array_agg(alias_id ORDER BY priority, alias_id NULLS LAST))[1] AS alias_id
    FROM cand GROUP BY spell_id
  )
  UPDATE pc_spells s
  SET resolved_name = CASE WHEN agg.n = 1 THEN agg.candidate_name END,
      resolved_slug = CASE WHEN agg.n = 1 THEN agg.candidate_slug END,
      rename_via = CASE WHEN agg.n = 1 THEN agg.rename_via END,
      match_status = CASE
        WHEN agg.n = 1 AND agg.alias_id IS NOT NULL THEN 'renamed'
        WHEN agg.n = 1 AND agg.rename_via IN ('grade-swap', 'semantic-suffix') THEN 'renamed'
        WHEN agg.n > 1 THEN 'ambiguous'
        ELSE 'unmatched'
      END
  FROM agg
  WHERE s.spell_id = agg.spell_id;
END;
$$;

CREATE OR REPLACE FUNCTION apply_grant_provenance(p_import_run_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  class_id text := wgi_run_class_id(p_import_run_id);
BEGIN
  UPDATE pc_items
  SET provenance = 'source', grant_parent_path = NULL
  WHERE import_run_id = p_import_run_id;

  DELETE FROM pc_dependencies WHERE import_run_id = p_import_run_id;

  WITH hits AS (
    SELECT child.item_id, parent.source_path AS parent_path, g.ownership_evidence
    FROM pc_items child
    JOIN grant_rules g ON g.status = 'active'
      AND g.ownership_evidence IN ('GrantItem', 'itemGrants', 'rulesSelections')
      AND (g.class_id IS NULL OR g.class_id = class_id)
      AND (child.name = g.child_source_pattern OR child.source_path LIKE g.child_source_pattern)
    JOIN pc_items parent ON parent.import_run_id = child.import_run_id
      AND parent.item_id <> child.item_id
      AND (parent.name = g.parent_source_pattern OR parent.source_path LIKE g.parent_source_pattern)
    WHERE child.import_run_id = p_import_run_id
  ), unique_hits AS (
    SELECT item_id, min(parent_path) AS parent_path, min(ownership_evidence) AS ownership_evidence
    FROM hits
    GROUP BY item_id
    HAVING count(DISTINCT parent_path) = 1
  )
  UPDATE pc_items child
  SET provenance = CASE WHEN unique_hits.ownership_evidence = 'rulesSelections' THEN 'rules-selection' ELSE 'grant-child' END,
      grant_parent_path = unique_hits.parent_path
  FROM unique_hits
  WHERE child.item_id = unique_hits.item_id;

  INSERT INTO pc_dependencies (import_run_id, source_path, prerequisite_type, prerequisite_data, satisfied_status, reason)
  SELECT p_import_run_id, source_path, 'grant-parent',
         jsonb_build_object('parentPath', grant_parent_path),
         'unknown',
         'PF2e GrantItem, itemGrants, or rulesSelections already owns this item'
  FROM pc_items
  WHERE import_run_id = p_import_run_id AND provenance IN ('grant-child', 'rules-selection');

  INSERT INTO pc_dependencies (import_run_id, source_path, prerequisite_type, prerequisite_data, satisfied_status, reason)
  SELECT p_import_run_id, source_path, 'choice-prerequisite',
         jsonb_build_object('ownerPath', 'character.details.class'),
         'unknown',
         'Selection is evidence for a parent ChoiceSet, not a second item'
  FROM pc_selections
  WHERE import_run_id = p_import_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION build_foundry_plan(p_import_run_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  f jsonb;
  selections jsonb;
BEGIN
  SELECT fixture.wg_export INTO f
  FROM pc_import_runs r
  JOIN test_pc_fixtures fixture ON fixture.fixture_key = r.fixture_key
  WHERE r.import_run_id = p_import_run_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', selection_key, 'value', wg_answer) ORDER BY selection_key), '[]'::jsonb)
  INTO selections
  FROM pc_selections WHERE import_run_id = p_import_run_id;

  DELETE FROM pc_foundry_plan WHERE import_run_id = p_import_run_id;

  DROP TABLE IF EXISTS plan_stage;
  CREATE TEMP TABLE plan_stage (
    batch integer NOT NULL,
    sort_key text NOT NULL,
    action_type text NOT NULL,
    source_path text,
    target_type text,
    target_key text,
    payload jsonb NOT NULL,
    prerequisite_status text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO plan_stage VALUES
    (1, '1-ancestry', 'create', 'character.details.ancestry', 'ancestry',
     wgi_sluggify(f #>> '{character,details,ancestry,name}'),
     jsonb_build_object('name', f #>> '{character,details,ancestry,name}'), 'planned'),
    (1, '2-background', 'create', 'character.details.background', 'background',
     wgi_sluggify(f #>> '{character,details,background,name}'),
     jsonb_build_object('name', f #>> '{character,details,background,name}'), 'planned'),
    (1, '3-class', 'create', 'character.details.class', 'class',
     wgi_sluggify(f #>> '{character,details,class,name}'),
     jsonb_build_object('name', f #>> '{character,details,class,name}', 'rulesSelections', selections), 'planned');

  INSERT INTO plan_stage
  SELECT 1, '4-' || source_path,
         CASE WHEN provenance = 'source' AND match_status = 'renamed' THEN 'create' ELSE 'review' END,
         source_path, 'heritage', COALESCE(resolved_slug, wgi_sluggify(name)),
         jsonb_build_object('name', COALESCE(resolved_name, name), 'renameVia', rename_via),
         CASE WHEN provenance = 'source' AND match_status = 'renamed' THEN 'planned' ELSE 'blocked' END
  FROM pc_items
  WHERE import_run_id = p_import_run_id AND source_path LIKE 'content.feats_features.heritages%';

  INSERT INTO plan_stage
  SELECT 2, source_path,
         CASE WHEN match_status = 'renamed' THEN 'create' ELSE 'review' END,
         source_path, item_kind, COALESCE(resolved_slug, wgi_sluggify(name)),
         jsonb_build_object('name', COALESCE(resolved_name, name), 'renameVia', rename_via, 'provenance', provenance),
         CASE WHEN match_status = 'renamed' THEN 'planned' ELSE 'blocked' END
  FROM pc_items
  WHERE import_run_id = p_import_run_id AND item_kind = 'equipment' AND provenance = 'source';

  INSERT INTO plan_stage
  SELECT 3, source_path,
         CASE WHEN match_status = 'renamed' THEN 'create' ELSE 'review' END,
         source_path, item_kind, COALESCE(resolved_slug, wgi_sluggify(name)),
         jsonb_build_object('name', COALESCE(resolved_name, name), 'renameVia', rename_via, 'rulesSelections', selections),
         CASE WHEN match_status = 'renamed' THEN 'planned' ELSE 'blocked' END
  FROM pc_items
  WHERE import_run_id = p_import_run_id
    AND provenance = 'source'
    AND item_kind IN ('feat', 'feature')
    AND source_path NOT LIKE 'content.feats_features.heritages%';

  INSERT INTO plan_stage
  SELECT 4, source_path, 'link-grant', source_path, item_kind,
         (SELECT COALESCE(parent.resolved_slug, wgi_sluggify(parent.name)) FROM pc_items parent
          WHERE parent.import_run_id = p_import_run_id AND parent.source_path = child.grant_parent_path),
         jsonb_build_object('parentPath', grant_parent_path, 'name', name, 'rulesSelections', selections),
         'planned'
  FROM pc_items child
  WHERE import_run_id = p_import_run_id AND provenance IN ('grant-child', 'rules-selection');

  INSERT INTO plan_stage
  SELECT 5, source_path,
         CASE WHEN match_status IN ('renamed', 'unmatched') THEN 'create' ELSE 'review' END,
         source_path, 'spell', COALESCE(resolved_slug, wgi_sluggify(name)),
         jsonb_build_object('name', COALESCE(resolved_name, name), 'renameVia', rename_via, 'rank', rank),
         CASE WHEN match_status = 'ambiguous' THEN 'blocked' ELSE 'planned' END
  FROM pc_spells
  WHERE import_run_id = p_import_run_id;

  INSERT INTO plan_stage
  SELECT 6, source_path, 'review', source_path, item_kind, wgi_sluggify(name),
         jsonb_build_object('name', name, 'matchStatus', match_status),
         'blocked'
  FROM pc_items
  WHERE import_run_id = p_import_run_id
    AND provenance = 'source'
    AND match_status = 'ambiguous'
    AND item_kind <> 'equipment'
    AND source_path NOT LIKE 'content.feats_features.heritages%';

  INSERT INTO pc_foundry_plan (import_run_id, sequence, batch, action_type, source_path, target_type, target_key, payload, prerequisite_status)
  SELECT p_import_run_id, row_number() OVER (ORDER BY batch, sort_key), batch, action_type, source_path, target_type, target_key, payload, prerequisite_status
  FROM plan_stage
  WHERE source_path IS NULL OR target_key IS NOT NULL OR action_type = 'review';

  UPDATE pc_dependencies d
  SET satisfied_status = 'planned'
  WHERE d.import_run_id = p_import_run_id
    AND d.prerequisite_type = 'grant-parent'
    AND EXISTS (
      SELECT 1 FROM pc_foundry_plan child
      JOIN pc_foundry_plan parent ON parent.import_run_id = child.import_run_id
        AND parent.source_path = d.prerequisite_data->>'parentPath'
      WHERE child.import_run_id = d.import_run_id
        AND child.source_path = d.source_path
        AND parent.sequence < child.sequence
    );

  INSERT INTO pc_dependencies (import_run_id, source_path, prerequisite_type, prerequisite_data, satisfied_status, reason)
  SELECT p_import_run_id, child.source_path, 'batch-before',
         jsonb_build_object('parentPath', child.payload->>'parentPath', 'parentSequence', parent.sequence),
         'planned',
         'Grant link is ordered after the parent create'
  FROM pc_foundry_plan child
  JOIN pc_foundry_plan parent ON parent.import_run_id = child.import_run_id
    AND parent.source_path = child.payload->>'parentPath'
  WHERE child.import_run_id = p_import_run_id AND child.action_type = 'link-grant' AND parent.sequence < child.sequence;
END;
$$;

-- Verified names already used by the module. Larger Pathmuncher maps stay out until a WG fixture confirms them.
INSERT INTO compendium_match_aliases
  (ruleset_id, class_id, item_kind, source_name, target_name, source_slug, target_slug, match_strategy, rename_via, priority, status, evidence_ref)
SELECT v.ruleset_id, v.class_id, v.item_kind, v.source_name, v.target_name, wgi_sluggify(v.source_name), wgi_sluggify(v.target_name),
       v.match_strategy, v.rename_via, 100, 'active', v.evidence_ref
FROM (VALUES
  ('pf2e-remaster', NULL::text, 'equipment', 'Tanglefoot Bag', 'Glue Bomb', 'canonical', 'class-rename', 'scripts/item-renames.js'),
  ('pf2e-remaster', NULL, 'equipment', 'Alchemist''s Tools', 'Alchemist''s Toolkit', 'canonical', 'class-rename', 'scripts/item-renames.js'),
  ('pf2e-remaster', NULL, 'equipment', 'Healer''s Tools', 'Healer''s Toolkit', 'canonical', 'class-rename', 'scripts/item-renames.js'),
  ('pf2e-remaster', NULL, 'equipment', 'Thieves'' Tools', 'Thieves'' Toolkit', 'canonical', 'class-rename', 'scripts/item-renames.js'),
  ('pf2e-remaster', NULL, 'equipment', 'Repair Kit', 'Repair Toolkit', 'canonical', 'class-rename', 'scripts/item-renames.js'),
  ('pf2e-remaster', 'druid', 'feat', 'Animal Companion (Druid)', 'Animal Companion', 'canonical', 'class-rename', 'scripts/mapping.js'),
  ('pf2e-remaster', 'druid', 'feat', 'Animal Empathy (Druid)', 'Animal Empathy', 'canonical', 'class-rename', 'scripts/mapping.js'),
  ('pf2e-remaster', 'sorcerer', 'feat', 'Imperial Bloodline', 'Bloodline: Imperial', 'canonical', 'class-rename', 'scripts/mapping.js'),
  ('pf2e-remaster', 'magus', 'feat', 'Inexorable Iron Hybrid Study', 'Inexorable Iron', 'canonical', 'class-rename', 'scripts/mapping.js'),
  ('pf2e-remaster', 'psychic', 'spell', 'Telekinetic Hand (Psi)', 'Telekinetic Hand', 'canonical', 'class-rename', 'scripts/mapping.js'),
  ('pf2e-remaster', 'psychic', 'spell', 'Telekinetic Projectile (Psi)', 'Telekinetic Projectile', 'canonical', 'class-rename', 'scripts/mapping.js'),
  ('pf2e-remaster', 'ranger', 'feat', 'Flurry Edge', 'Flurry', 'canonical', 'class-rename', 'scripts/mapping.js'),
  ('pf2e-remaster', 'ranger', 'feat', 'Precision Edge', 'Precision', 'canonical', 'class-rename', 'scripts/mapping.js')
) AS v(ruleset_id, class_id, item_kind, source_name, target_name, match_strategy, rename_via, evidence_ref)
WHERE NOT EXISTS (
  SELECT 1 FROM compendium_match_aliases a
  WHERE a.ruleset_id = v.ruleset_id AND a.item_kind = v.item_kind
    AND a.source_slug = wgi_sluggify(v.source_name) AND a.target_slug = wgi_sluggify(v.target_name)
    AND COALESCE(a.class_id, '') = COALESCE(v.class_id, '')
);

UPDATE compendium_match_aliases
SET rename_via = CASE match_strategy WHEN 'semantic' THEN 'semantic-suffix' ELSE rename_via END
WHERE class_id IS NULL AND rename_via IS NULL;

-- Fixture 63 lists Research Field and the vials the class grants. Linking them avoids a second create.
INSERT INTO grant_rules
  (class_id, parent_source_pattern, child_source_pattern, ownership_evidence, dedupe_policy, choice_policy, status, evidence_ref, notes)
SELECT 'alchemist', 'Research Field', 'Versatile Vial (Lesser)', 'GrantItem', 'keep-grant', 'inherit', 'active',
       'test/fixtures/pcs/63.json',
       'WG lists the vial the Alchemist class grants. Provenance is GrantItem, so the plan links it instead of creating another item.'
WHERE NOT EXISTS (
  SELECT 1 FROM grant_rules
  WHERE class_id = 'alchemist' AND parent_source_pattern = 'Research Field' AND child_source_pattern = 'Versatile Vial (Lesser)'
);

CREATE OR REPLACE FUNCTION deconstruct_test_pc(p_fixture_key text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  f test_pc_fixtures%ROWTYPE;
  run_id bigint;
  k text;
  v jsonb;
  group_key text;
  group_value jsonb;
  element jsonb;
  idx integer;
BEGIN
  SELECT * INTO f FROM test_pc_fixtures WHERE fixture_key = p_fixture_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown test PC fixture: %', p_fixture_key; END IF;

  DELETE FROM pc_import_runs WHERE fixture_key = p_fixture_key AND run_kind = 'deconstruct';
  INSERT INTO pc_import_runs (fixture_key, ruleset_id, run_kind, status, source_sha256)
  VALUES (p_fixture_key, 'pf2e-remaster', 'deconstruct', 'planned', f.source_sha256)
  RETURNING import_run_id INTO run_id;

  FOR k, v IN SELECT key, value FROM jsonb_each(f.wg_export->'character') LOOP
    INSERT INTO pc_sources (import_run_id, source_path, source_kind, raw_subtree)
    VALUES (run_id, 'character.' || k, 'character', v);
  END LOOP;
  FOR k, v IN SELECT key, value FROM jsonb_each(f.wg_export->'content') LOOP
    INSERT INTO pc_sources (import_run_id, source_path, source_kind, raw_subtree)
    VALUES (run_id, 'content.' || k, 'content', v);
  END LOOP;

  FOR k, v IN SELECT key, value FROM jsonb_each(COALESCE(f.wg_export #> '{character,operation_data,selections}', '{}'::jsonb)) LOOP
    INSERT INTO pc_selections (import_run_id, source_path, selection_key, wg_answer, raw_data)
    VALUES (run_id, 'character.operation_data.selections.' || k, k, v #>> '{}', jsonb_build_object('key', k, 'value', v));
  END LOOP;

  idx := 0;
  FOR element IN SELECT value FROM jsonb_array_elements(COALESCE(f.wg_export #> '{content,inventory_flat}', '[]'::jsonb)) LOOP
    INSERT INTO pc_items (import_run_id, source_path, wg_content_id, name, item_kind, level, raw_data)
    VALUES (run_id, format('content.inventory_flat[%s]', idx), element #>> '{item,id}', element #>> '{item,name}', 'equipment', NULLIF(element #>> '{item,level}', '')::integer, element);
    idx := idx + 1;
  END LOOP;

  FOR group_key, group_value IN SELECT key, value FROM jsonb_each(COALESCE(f.wg_export #> '{content,feats_features}', '{}'::jsonb)) LOOP
    IF jsonb_typeof(group_value) = 'array' THEN
      idx := 0;
      FOR element IN SELECT value FROM jsonb_array_elements(group_value) LOOP
        INSERT INTO pc_items (import_run_id, source_path, wg_content_id, name, item_kind, level, raw_data)
        VALUES (run_id, format('content.feats_features.%s[%s]', group_key, idx), element->>'id', element->>'name', CASE WHEN group_key ILIKE '%feat%' THEN 'feat' ELSE 'feature' END, NULLIF(element->>'level', '')::integer, element);
        idx := idx + 1;
      END LOOP;
    END IF;
  END LOOP;

  idx := 0;
  FOR element IN SELECT value FROM jsonb_array_elements(COALESCE(f.wg_export #> '{content,spells,all}', '[]'::jsonb)) LOOP
    INSERT INTO pc_spells (import_run_id, source_path, wg_content_id, name, rank, casting_source, spell_kind, raw_data)
    VALUES (run_id, format('content.spells.all[%s]', idx), element->>'id', element->>'name', NULLIF(element->>'rank', '')::integer, element->>'casting_source', 'normal', element);
    idx := idx + 1;
  END LOOP;
  idx := 0;
  FOR element IN SELECT value FROM jsonb_array_elements(COALESCE(f.wg_export #> '{content,focus_spells}', '[]'::jsonb)) LOOP
    INSERT INTO pc_spells (import_run_id, source_path, wg_content_id, name, rank, casting_source, spell_kind, raw_data)
    VALUES (run_id, format('content.focus_spells[%s]', idx), element->>'id', element->>'name', NULLIF(element->>'rank', '')::integer, element->>'casting_source', 'focus', element);
    idx := idx + 1;
  END LOOP;
  idx := 0;
  FOR element IN SELECT value FROM jsonb_array_elements(COALESCE(f.wg_export #> '{content,innate_spells}', '[]'::jsonb)) LOOP
    INSERT INTO pc_spells (import_run_id, source_path, wg_content_id, name, rank, casting_source, spell_kind, raw_data)
    VALUES (run_id, format('content.innate_spells[%s]', idx), element #>> '{spell,id}', element #>> '{spell,name}', NULLIF(element->>'rank', '')::integer, element->>'casting_source', 'innate', element);
    idx := idx + 1;
  END LOOP;

  PERFORM resolve_run_item_names(run_id);
  PERFORM apply_grant_provenance(run_id);
  PERFORM build_foundry_plan(run_id);

  INSERT INTO pc_validation_results (import_run_id, check_name, expected_value, actual_value, status, explanation)
  VALUES (run_id, 'raw-snapshot-present', 'true'::jsonb, 'true'::jsonb, 'pass', 'The immutable WG JSON snapshot is present.'),
         (run_id, 'source-decomposition', 'true'::jsonb, 'true'::jsonb, 'pass', 'Character and content top-level paths were decomposed.'),
         (run_id, 'foundry-application', '"not-run"'::jsonb, '"not-run"'::jsonb, 'not-run', 'This run only deconstructs and plans; Foundry application remains a separate reviewed step.');
  UPDATE pc_import_runs SET completed_at = now() WHERE import_run_id = run_id;
  RETURN run_id;
END;
$$;

SELECT deconstruct_test_pc(fixture_key) FROM test_pc_fixtures ORDER BY fixture_key;

DO $$
DECLARE
  renamed text;
  grant_count integer;
  order_ok boolean;
  review_count integer;
BEGIN
  SELECT candidate_name INTO renamed
  FROM resolve_source_name('pf2e-remaster', 'druid', 'feat', 'Animal Companion (Druid)');
  IF renamed IS DISTINCT FROM 'Animal Companion' THEN
    RAISE EXCEPTION 'class rename failed: %', renamed;
  END IF;

  SELECT count(*) INTO grant_count
  FROM pc_items i
  JOIN pc_import_runs r ON r.import_run_id = i.import_run_id
  WHERE r.fixture_key = '63' AND i.provenance = 'grant-child' AND i.name = 'Versatile Vial (Lesser)';
  IF grant_count < 1 THEN
    RAISE EXCEPTION 'fixture 63 grant provenance missing';
  END IF;

  SELECT bool_and(parent.sequence < child.sequence) INTO order_ok
  FROM pc_foundry_plan child
  JOIN pc_import_runs r ON r.import_run_id = child.import_run_id
  JOIN pc_foundry_plan parent ON parent.import_run_id = child.import_run_id
    AND parent.source_path = child.payload->>'parentPath'
  WHERE r.fixture_key = '63' AND child.action_type = 'link-grant';
  IF order_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'link-grant is not after its parent';
  END IF;

  SELECT count(*) INTO review_count
  FROM pc_foundry_plan p
  JOIN pc_import_runs r ON r.import_run_id = p.import_run_id
  WHERE r.fixture_key = '63' AND p.action_type = 'review' AND p.prerequisite_status = 'blocked';
  IF review_count < 1 THEN
    RAISE EXCEPTION 'expected at least one blocked review row';
  END IF;
END $$;
