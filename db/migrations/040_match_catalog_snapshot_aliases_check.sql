-- 040: Stricter match_catalog_snapshots payload check, folded from the removed
-- 035_match_catalog_snapshots.sql. Migration 033 already creates the table and
-- checks jsonb_array_length(payload->'aliases') = row_count. That length call
-- errors when aliases is not an array. This replacement requires an array first.
-- Idempotent.
BEGIN;

ALTER TABLE match_catalog_snapshots DROP CONSTRAINT IF EXISTS match_catalog_snapshots_rowcount;
ALTER TABLE match_catalog_snapshots ADD CONSTRAINT match_catalog_snapshots_rowcount
  CHECK (
    jsonb_typeof(payload->'aliases') = 'array'
    AND jsonb_array_length(payload->'aliases') = row_count
  );

COMMIT;
