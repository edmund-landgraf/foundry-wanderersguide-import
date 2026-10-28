-- Store concise import-log summaries and references to the existing files.
-- Raw JSON, screenshots, and full text remain on disk/object storage.

CREATE TABLE IF NOT EXISTS pc_import_logs (
  log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES pc_import_runs(import_run_id) ON DELETE CASCADE,
  log_kind text NOT NULL CHECK (log_kind IN ('import-report', 'actor-snapshot', 'test-run', 'screenshot-set', 'other')),
  source_path text NOT NULL,
  source_uri text,
  source_sha256 text,
  source_bytes bigint,
  source_mime text,
  summary text NOT NULL,
  result_status text NOT NULL CHECK (result_status IN ('pass', 'fail', 'partial', 'not-run', 'unknown')),
  quality_score numeric(6,3) NOT NULL DEFAULT 0,
  captured_at timestamptz,
  supersedes_log_id bigint REFERENCES pc_import_logs(log_id) ON DELETE SET NULL,
  is_best boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_run_id, log_kind, source_path)
);

CREATE TABLE IF NOT EXISTS pc_import_log_highlights (
  highlight_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_id bigint NOT NULL REFERENCES pc_import_logs(log_id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('metric', 'choice', 'unresolved', 'warning', 'gap', 'validation', 'artifact')),
  key text NOT NULL,
  value jsonb NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
  source_locator text,
  UNIQUE (log_id, category, key)
);

-- At most one preferred summary is retained for each logical run/kind. Older
-- candidates remain auditable as file references but are not selected by the
-- reporting view.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_import_logs_best
  ON pc_import_logs(import_run_id, log_kind) WHERE is_best;
CREATE INDEX IF NOT EXISTS idx_pc_import_logs_best
  ON pc_import_logs(import_run_id, is_best, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_pc_import_log_highlights_log
  ON pc_import_log_highlights(log_id, category, severity);

CREATE OR REPLACE VIEW pc_best_import_logs AS
SELECT l.*
FROM pc_import_logs l
WHERE l.is_best;

CREATE OR REPLACE FUNCTION record_pc_import_log(
  p_import_run_id bigint,
  p_log_kind text,
  p_source_path text,
  p_summary text,
  p_result_status text DEFAULT 'unknown',
  p_quality_score numeric DEFAULT 0,
  p_source_uri text DEFAULT NULL,
  p_source_sha256 text DEFAULT NULL,
  p_source_bytes bigint DEFAULT NULL,
  p_source_mime text DEFAULT NULL,
  p_captured_at timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  new_id bigint;
  old_best bigint;
BEGIN
  -- Serialize replacement of the preferred row for this logical run/kind.
  -- The partial unique index is the invariant; this lock prevents concurrent
  -- writers from both clearing the old best before either inserts its row.
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:%s', p_import_run_id, p_log_kind), 0));

  SELECT log_id INTO old_best
  FROM pc_import_logs
  WHERE import_run_id = p_import_run_id AND log_kind = p_log_kind AND is_best
  FOR UPDATE;

  UPDATE pc_import_logs
  SET is_best = false
  WHERE log_id = old_best;

  INSERT INTO pc_import_logs (
    import_run_id, log_kind, source_path, source_uri, source_sha256,
    source_bytes, source_mime, summary, result_status, quality_score,
    captured_at, supersedes_log_id, is_best
  ) VALUES (
    p_import_run_id, p_log_kind, p_source_path, p_source_uri, p_source_sha256,
    p_source_bytes, p_source_mime, p_summary, p_result_status, p_quality_score,
    p_captured_at, old_best, true
  )
  ON CONFLICT (import_run_id, log_kind, source_path) DO UPDATE SET
    source_uri = EXCLUDED.source_uri,
    source_sha256 = EXCLUDED.source_sha256,
    source_bytes = EXCLUDED.source_bytes,
    source_mime = EXCLUDED.source_mime,
    summary = EXCLUDED.summary,
    result_status = EXCLUDED.result_status,
    quality_score = EXCLUDED.quality_score,
    captured_at = EXCLUDED.captured_at,
    supersedes_log_id = CASE
      WHEN old_best IS NOT NULL AND old_best <> pc_import_logs.log_id THEN old_best
      ELSE pc_import_logs.supersedes_log_id
    END,
    is_best = true
  RETURNING log_id INTO new_id;

  RETURN new_id;
END;
$$;

