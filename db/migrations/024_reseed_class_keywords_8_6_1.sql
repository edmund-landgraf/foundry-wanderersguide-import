-- 024: Re-seed pf2e_class_keywords against the PF2e 8.6.1 catalog (023).
-- * source_path/evidence_ref re-pointed at the 8.6.1 pack layout (packs/pf2e/...).
-- * Names that do not exist in 8.6.1 are retired, and their WG matches are marked
--   unresolved (never silently kept or guessed).
-- * Class-tagged 8.6.1 feats/class features missing from the keyword list are added
--   (e.g. Inexorable Iron, Bloodline: Diabolic, Ruffian) so WG rows can match them.
-- Idempotent.
BEGIN;

-- 1. Re-point keywords at their 8.6.1 file (same collection + name; prefer same slug, same class).
UPDATE pf2e_class_keywords k
SET source_path = c.source_path,
    evidence_ref = 'PF2e 8.6.1: ' || c.source_path,
    status = CASE WHEN k.status = 'retired' THEN 'active' ELSE k.status END
FROM pf2e_class_keywords k2
CROSS JOIN LATERAL (
  SELECT e.source_path FROM pf2e_catalog_entries e
  WHERE e.ruleset_id = k2.ruleset_id
    AND e.compendium_collection = k2.compendium_collection
    AND lower(e.pf2e_name) = lower(k2.pf2e_name)
  ORDER BY (e.pf2e_slug = k2.pf2e_slug) DESC, (e.class_id IS NOT DISTINCT FROM k2.class_id) DESC, e.source_path
  LIMIT 1
) c
WHERE k2.keyword_id = k.keyword_id
  AND (k.source_path IS DISTINCT FROM c.source_path OR k.status = 'retired');

-- 2. Retire keywords whose name is not in 8.6.1 for their collection.
UPDATE pf2e_class_keywords k
SET status = 'retired',
    notes = concat_ws(' ', NULLIF(k.notes, ''),
      '[024] Not in PF2e 8.6.1 packs; retired.',
      (SELECT 'Base name "' || min(e.pf2e_name) || '" exists in 8.6.1; WG rows resolve via catalog matching (028).'
         FROM pf2e_catalog_entries e
        WHERE lower(e.pf2e_name) = lower(regexp_replace(k.pf2e_name, '\s*\([^)]*\)$', ''))))
WHERE k.status <> 'retired'
  AND NOT EXISTS (SELECT 1 FROM pf2e_catalog_entries e
                  WHERE e.compendium_collection = k.compendium_collection
                    AND lower(e.pf2e_name) = lower(k.pf2e_name));

-- 2b. WG matches that point at a retired keyword are no longer active.
UPDATE wg_pf2e_keyword_matches m
SET status = 'unresolved',
    notes = concat_ws(' ', NULLIF(m.notes, ''), '[024] PF2e target retired (not in 8.6.1).')
FROM pf2e_class_keywords k
WHERE k.keyword_id = m.pf2e_keyword_id AND k.status = 'retired' AND m.status <> 'unresolved';

-- 3. Add class-tagged 8.6.1 feats / class features that are missing.
INSERT INTO pf2e_class_keywords (ruleset_id, class_id, item_kind, pf2e_name, pf2e_slug,
  compendium_collection, source_path, foundry_type, status, evidence_ref, notes)
SELECT e.ruleset_id, e.class_id,
       CASE WHEN e.compendium_collection = 'pf2e.classfeatures' THEN 'classfeature' ELSE 'feat' END,
       e.pf2e_name, e.pf2e_slug, e.compendium_collection, e.source_path, e.foundry_type,
       'active', 'PF2e 8.6.1: ' || e.source_path, '[024] added from 8.6.1 catalog'
FROM pf2e_catalog_entries e
WHERE e.class_id IS NOT NULL
  AND e.compendium_collection IN ('pf2e.classfeatures', 'pf2e.feats-srd')
ON CONFLICT DO NOTHING;

-- 4. Class options whose 8.6.1 item has no single class trait (sorcerer bloodlines,
--    magus hybrid studies, wizard schools, rogue rackets, cleric font).
INSERT INTO pf2e_class_keywords (ruleset_id, class_id, item_kind, pf2e_name, pf2e_slug,
  compendium_collection, source_path, foundry_type, status, evidence_ref, notes)
SELECT DISTINCT ON (x.class_id, e.pf2e_slug)
       e.ruleset_id, x.class_id, 'classfeature', e.pf2e_name, e.pf2e_slug, e.compendium_collection,
       e.source_path, e.foundry_type, 'active', 'PF2e 8.6.1: ' || e.source_path, '[024] class option by path/name'
FROM pf2e_catalog_entries e
JOIN (VALUES ('sorcerer', '^Bloodline: ', NULL),
             ('magus', NULL, '/class-features/magus/'),
             ('wizard', NULL, '/class-features/wizard/'),
             ('rogue', '^(Ruffian|Thief|Scoundrel|Mastermind|Avenger|Eldritch Trickster)$', NULL),
             ('cleric', '^Divine Font$', NULL)) x(class_id, name_pat, path_pat)
  ON (e.pf2e_name ~ x.name_pat OR e.source_path ~ x.path_pat)
WHERE e.compendium_collection = 'pf2e.classfeatures'
ORDER BY x.class_id, e.pf2e_slug, e.source_path
ON CONFLICT DO NOTHING;

COMMIT;
