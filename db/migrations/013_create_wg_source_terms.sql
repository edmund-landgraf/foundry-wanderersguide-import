-- Complete, provenance-preserving snapshot of Wanderer's Guide keyword rows.
-- The native WG source table and ID remain part of every row, while row_data
-- retains every source column (operations, descriptions, metadata, traits,
-- levels, and source references) for offline matching and audit.
CREATE TABLE IF NOT EXISTS wg_keyword_snapshot (
  snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL CHECK (source_table IN ('class', 'ability_block', 'item', 'spell', 'trait')),
  wg_id bigint NOT NULL,
  wg_name text,
  row_data jsonb NOT NULL,
  source_database text NOT NULL,
  source_repo text NOT NULL,
  source_ref text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, wg_id)
);

CREATE INDEX IF NOT EXISTS idx_wg_keyword_snapshot_name
  ON wg_keyword_snapshot(lower(wg_name), source_table);

CREATE INDEX IF NOT EXISTS idx_wg_keyword_snapshot_data
  ON wg_keyword_snapshot USING gin (row_data);

