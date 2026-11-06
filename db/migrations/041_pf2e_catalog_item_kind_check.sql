-- 041: Item-kind check for the PF2e catalog (was 023 on db/wgi-rules-keyword-fixes).
-- 026 creates pf2e_catalog_entries and 027 seeds the 8.6.1 rows. This file does not
-- create pf2e_catalog_entries, wg_pf2e_catalog_matches, or wg_pf2e_unresolved, and it
-- does not load a second catalog.
-- 023's check listed the 15 kinds that file seeded. 036 and 037 already widened
-- pf2e_catalog_entries_item_kind_check to every kind those seeds insert (npc, hazard,
-- army, effect, and the rest). Putting the 15-kind list back would reject those rows.
-- Re-apply the widened list, which still requires every kind 023 allowed.
-- pf2e_source_book already exists (026); add it again so a database that stopped
-- before 026's column still has what 048 reads. Idempotent.
BEGIN;

ALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS pf2e_source_book text;

ALTER TABLE pf2e_catalog_entries DROP CONSTRAINT IF EXISTS pf2e_catalog_entries_item_kind_check;
ALTER TABLE pf2e_catalog_entries ADD CONSTRAINT pf2e_catalog_entries_item_kind_check
  CHECK (item_kind = ANY (ARRAY[
    'action','adventureaction','ancestry','ancestryfeature','army','background','boon',
    'campaignFeature','character','class','classfeature','condition','deity','effect',
    'equipment','familiar','familiarability','feat','hazard','heritage','npc','spell','vehicle'
  ]));

COMMIT;
