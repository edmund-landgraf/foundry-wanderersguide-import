-- 029: Importer rule: no hard-coded PF2e UUIDs (look up by name at runtime).
-- These columns were always empty. Fails (and rolls back) if a view depends on them.
BEGIN;
ALTER TABLE class_sources DROP COLUMN IF EXISTS pf2e_uuid;
ALTER TABLE pc_items DROP COLUMN IF EXISTS pf2e_uuid;
ALTER TABLE pc_spells DROP COLUMN IF EXISTS pf2e_uuid;
COMMIT;
