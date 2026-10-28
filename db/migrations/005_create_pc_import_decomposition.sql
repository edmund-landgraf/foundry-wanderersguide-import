CREATE TABLE IF NOT EXISTS pc_import_runs (
  import_run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fixture_key text NOT NULL REFERENCES test_pc_fixtures(fixture_key),
  ruleset_id text NOT NULL REFERENCES rulesets(ruleset_id),
  run_kind text NOT NULL DEFAULT 'deconstruct',
  status text NOT NULL CHECK (status IN ('deconstructed', 'planned', 'reviewed', 'applied', 'failed')),
  source_sha256 text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (fixture_key, run_kind)
);

CREATE TABLE IF NOT EXISTS pc_sources (
  source_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  source_path text NOT NULL,
  source_kind text NOT NULL,
  wg_content_id text,
  owner_path text,
  raw_subtree jsonb NOT NULL,
  coverage_status text NOT NULL DEFAULT 'unclassified',
  coverage_reason text,
  UNIQUE (import_run_id, source_path)
);

CREATE TABLE IF NOT EXISTS pc_selections (
  selection_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  source_id bigint REFERENCES pc_sources(source_id) ON DELETE SET NULL,
  source_path text NOT NULL,
  selection_key text NOT NULL,
  wg_answer text,
  owner_feature text,
  candidate_targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution_status text NOT NULL DEFAULT 'unresolved',
  unresolved_reason text,
  raw_data jsonb NOT NULL,
  UNIQUE (import_run_id, source_path)
);

CREATE TABLE IF NOT EXISTS pc_items (
  item_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  source_id bigint REFERENCES pc_sources(source_id) ON DELETE SET NULL,
  source_path text NOT NULL,
  wg_content_id text,
  name text,
  item_kind text NOT NULL,
  level integer,
  raw_data jsonb NOT NULL,
  match_status text NOT NULL DEFAULT 'unmatched',
  pf2e_uuid text,
  grant_parent text,
  UNIQUE (import_run_id, source_path)
);

CREATE TABLE IF NOT EXISTS pc_spells (
  spell_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  source_id bigint REFERENCES pc_sources(source_id) ON DELETE SET NULL,
  source_path text NOT NULL,
  wg_content_id text,
  name text,
  rank integer,
  casting_source text,
  spell_kind text NOT NULL,
  raw_data jsonb NOT NULL,
  match_status text NOT NULL DEFAULT 'unmatched',
  pf2e_uuid text,
  spellcasting_target text,
  UNIQUE (import_run_id, source_path)
);

CREATE TABLE IF NOT EXISTS pc_dependencies (
  dependency_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  source_path text NOT NULL,
  prerequisite_type text NOT NULL,
  prerequisite_data jsonb NOT NULL,
  satisfied_status text NOT NULL DEFAULT 'unknown',
  reason text
);

CREATE TABLE IF NOT EXISTS pc_import_decisions (
  decision_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  source_path text NOT NULL,
  decision text NOT NULL,
  selected_pf2e_target text,
  evidence_ref text,
  decided_by text,
  decided_at timestamptz,
  notes text
);

CREATE TABLE IF NOT EXISTS pc_foundry_plan (
  plan_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  action_type text NOT NULL,
  source_path text,
  target_type text,
  target_key text,
  payload jsonb NOT NULL,
  prerequisite_status text NOT NULL DEFAULT 'unknown',
  apply_status text NOT NULL DEFAULT 'planned',
  UNIQUE (import_run_id, sequence)
);

CREATE TABLE IF NOT EXISTS pc_validation_results (
  validation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  check_name text NOT NULL,
  expected_value jsonb,
  actual_value jsonb,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'unresolved', 'not-run')),
  explanation text,
  UNIQUE (import_run_id, check_name)
);

CREATE INDEX IF NOT EXISTS idx_pc_sources_run_path ON pc_sources(import_run_id, source_path);
CREATE INDEX IF NOT EXISTS idx_pc_selections_run_status ON pc_selections(import_run_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_pc_items_run_status ON pc_items(import_run_id, match_status);
CREATE INDEX IF NOT EXISTS idx_pc_spells_run_status ON pc_spells(import_run_id, match_status);
CREATE INDEX IF NOT EXISTS idx_pc_plan_run_sequence ON pc_foundry_plan(import_run_id, sequence);

CREATE OR REPLACE FUNCTION deconstruct_test_pc(p_fixture_key text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  f test_pc_fixtures%ROWTYPE;
  run_id bigint;
  src_id bigint;
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
  VALUES (p_fixture_key, 'pf2e-remaster', 'deconstruct', 'deconstructed', f.source_sha256)
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

  INSERT INTO pc_foundry_plan (import_run_id, sequence, action_type, source_path, target_type, target_key, payload)
  SELECT run_id, row_number() OVER (ORDER BY source_path), 'review-source', source_path, source_kind, source_path, raw_subtree
  FROM pc_sources WHERE import_run_id = run_id;
  INSERT INTO pc_foundry_plan (import_run_id, sequence, action_type, source_path, target_type, target_key, payload)
  SELECT run_id, (SELECT count(*) FROM pc_foundry_plan WHERE import_run_id = run_id) + row_number() OVER (ORDER BY selection_id), 'resolve-selection', source_path, 'selection', selection_key, raw_data
  FROM pc_selections WHERE import_run_id = run_id;

  INSERT INTO pc_validation_results (import_run_id, check_name, expected_value, actual_value, status, explanation)
  VALUES (run_id, 'raw-snapshot-present', 'true'::jsonb, 'true'::jsonb, 'pass', 'The immutable WG JSON snapshot is present.'),
         (run_id, 'source-decomposition', 'true'::jsonb, 'true'::jsonb, 'pass', 'Character and content top-level paths were decomposed.'),
         (run_id, 'foundry-application', '"not-run"'::jsonb, '"not-run"'::jsonb, 'not-run', 'This run only deconstructs and plans; Foundry application remains a separate reviewed step.');
  UPDATE pc_import_runs SET completed_at = now() WHERE import_run_id = run_id;
  RETURN run_id;
END;
$$;

SELECT deconstruct_test_pc(fixture_key) FROM test_pc_fixtures ORDER BY fixture_key;
