-- 033: Versioned match-catalog snapshots. db/tools/export-match-catalog.mjs inserts one row per export
-- and writes the same payload to a git-ignored file (data/match-catalog.json) that the module loads.
-- The snapshot is NOT committed to the repo (decision 2026-10-28).
-- Numbering: this is the snapshot table. The duplicate 035 on codex/seed-rule-registry
-- was removed; its stricter aliases-array check is 040. db/wgi-rules-keyword-fixes follows at 041-049.
BEGIN;

CREATE TABLE IF NOT EXISTS match_catalog_snapshots (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schema_version    integer     NOT NULL,
  pf2e_version      text        NOT NULL,
  wg_content_commit text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  checksum          text        NOT NULL,
  row_count         integer     NOT NULL CHECK (row_count >= 0),
  payload           jsonb       NOT NULL,
  CONSTRAINT match_catalog_snapshots_checksum_hex CHECK (checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT match_catalog_snapshots_rowcount CHECK (jsonb_array_length(payload->'aliases') = row_count)
);
CREATE INDEX IF NOT EXISTS idx_match_catalog_snapshots_version ON match_catalog_snapshots (pf2e_version, created_at DESC);

COMMIT;