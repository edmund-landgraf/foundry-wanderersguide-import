-- Roll up importer evidence into actionable gaps by character and feature.
CREATE OR REPLACE VIEW pc_import_gap_rollup AS
SELECT
  r.import_run_id,
  r.fixture_key,
  l.log_id,
  l.source_path,
  h.category,
  h.key,
  h.value,
  h.severity,
  l.quality_score,
  l.captured_at
FROM pc_import_log_highlights h
JOIN pc_import_logs l ON l.log_id = h.log_id
JOIN pc_import_runs r ON r.import_run_id = l.import_run_id
WHERE h.category IN ('gap', 'unresolved', 'warning')
  AND l.is_best;

CREATE INDEX IF NOT EXISTS idx_pc_import_gap_rollup_lookup
  ON pc_import_log_highlights (category, severity, key);
