CREATE TABLE IF NOT EXISTS test_pc_fixtures (
  fixture_key text PRIMARY KEY,
  source_path text NOT NULL,
  wg_export jsonb NOT NULL,
  source_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_pc_fixtures_wg_id
  ON test_pc_fixtures ((wg_export #>> '{character,id}'));

CREATE OR REPLACE VIEW test_pc_summary AS
SELECT
  fixture_key,
  source_path,
  wg_export #>> '{character,id}' AS wg_character_id,
  wg_export #>> '{character,name}' AS name,
  COALESCE(wg_export #>> '{character,details,class,name}', wg_export #>> '{character,class,name}') AS class_name,
  COALESCE(wg_export #>> '{character,details,ancestry,name}', wg_export #>> '{character,ancestry,name}') AS ancestry_name,
  NULLIF(COALESCE(wg_export #>> '{character,level}', wg_export #>> '{character,details,level}'), '')::integer AS level,
  wg_export #>> '{version}' AS export_version,
  wg_export
FROM test_pc_fixtures;
