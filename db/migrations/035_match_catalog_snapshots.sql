-- 035: Versioned exports consumed by the Foundry module.
BEGIN;

CREATE TABLE IF NOT EXISTS match_catalog_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schema_version integer NOT NULL,
  pf2e_version text NOT NULL,
  wg_content_commit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL,
  row_count integer NOT NULL CHECK (row_count >= 0),
  payload jsonb NOT NULL,
  CONSTRAINT match_catalog_snapshots_checksum_hex CHECK (checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT match_catalog_snapshots_rowcount
    CHECK (jsonb_typeof(payload->'aliases') = 'array'
       AND jsonb_array_length(payload->'aliases') = row_count)
);

CREATE INDEX IF NOT EXISTS idx_match_catalog_snapshots_version
  ON match_catalog_snapshots (pf2e_version, created_at DESC);

COMMIT;
