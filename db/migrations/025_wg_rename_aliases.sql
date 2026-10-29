-- 025: Pattern-derived WG -> PF2e 8.6.1 rename aliases.
-- Every alias target must exist in pf2e_catalog_entries (8.6.1); patterns that produce a
-- name 8.6.1 does not have create nothing (the WG row stays unresolved, see 028).
-- Legacy handling: "X (legacy)" is treated as "X" consistently, then the other patterns apply.
-- Idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS wg_name_rename_rules (
  rule_id text PRIMARY KEY,
  pattern text NOT NULL,
  replacement text NOT NULL,
  class_id text REFERENCES classes(class_id),
  class_from_group integer,
  priority integer NOT NULL,
  notes text
);

INSERT INTO wg_name_rename_rules VALUES
  ('legacy-suffix', '^(.+?)\s*\([Ll]egacy\)$', '\1', NULL, NULL, 10, 'WG keeps legacy copies as "X (legacy)"; PF2e 8.6.1 has only the remaster "X".'),
  ('sorcerer-bloodline', '^(.+) Bloodline$', 'Bloodline: \1', 'sorcerer', NULL, 20, 'WG "Diabolic Bloodline" = PF2e "Bloodline: Diabolic" (#50, #71).'),
  ('magus-hybrid-study', '^(.+) Hybrid Study$', '\1', 'magus', NULL, 20, 'WG "Inexorable Iron Hybrid Study" = PF2e "Inexorable Iron" (#50).'),
  ('rogue-racket', '^(.+) Racket$', '\1', 'rogue', NULL, 20, 'WG "Ruffian Racket" = PF2e "Ruffian".'),
  ('cleric-healing-font', '^Healing Font$', 'Divine Font', 'cleric', NULL, 20, 'Remaster renamed Healing Font to Divine Font (#63).'),
  ('class-suffix', '^(.+) \(([A-Za-z]+)\)$', '\1', NULL, 2, 30, 'WG "Cantrip Expansion (Wizard)" = shared PF2e "Cantrip Expansion"; group 2 must be a class.')
ON CONFLICT (rule_id) DO UPDATE SET pattern = EXCLUDED.pattern, replacement = EXCLUDED.replacement,
  class_id = EXCLUDED.class_id, class_from_group = EXCLUDED.class_from_group,
  priority = EXCLUDED.priority, notes = EXCLUDED.notes;

CREATE OR REPLACE FUNCTION wgi_slugify(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from lower(regexp_replace(regexp_replace(t, '[''’]', '', 'g'), '[^A-Za-z0-9]+', '-', 'g')))
$$;

CREATE TEMP TABLE _ren ON COMMIT DROP AS
WITH wg AS (
  SELECT DISTINCT wg_name FROM wg_keyword_snapshot
  WHERE source_table = 'ability_block' AND wg_name IS NOT NULL
),
base AS (
  SELECT wg_name, wg_name AS base, false AS legacy FROM wg
  UNION
  SELECT wg_name, regexp_replace(wg_name, '^(.+?)\s*\([Ll]egacy\)$', '\1'), true FROM wg
  WHERE wg_name ~ '\([Ll]egacy\)$'
),
cand AS (
  SELECT b.wg_name, b.base AS tgt, NULL::text AS class_id, 'legacy-suffix'::text AS rule_id, 10 AS priority
  FROM base b WHERE b.legacy
  UNION ALL
  SELECT b.wg_name,
         regexp_replace(b.base, r.pattern, r.replacement),
         COALESCE(r.class_id, lower((regexp_match(b.base, r.pattern))[r.class_from_group])),
         CASE WHEN b.legacy THEN 'legacy-suffix+' ELSE '' END || r.rule_id,
         r.priority + CASE WHEN b.legacy THEN 1 ELSE 0 END
  FROM base b JOIN wg_name_rename_rules r ON r.rule_id <> 'legacy-suffix' AND b.base ~ r.pattern
),
valid AS (
  SELECT c.* FROM cand c
  WHERE (c.class_id IS NULL OR c.class_id IN (SELECT class_id FROM classes))
    AND NOT (c.rule_id LIKE '%class-suffix' AND (c.class_id IS NULL OR c.class_id NOT IN (SELECT class_id FROM classes)))
    -- No alias needed when WG's own name already exists in 8.6.1.
    AND NOT EXISTS (SELECT 1 FROM pf2e_catalog_entries e WHERE lower(e.pf2e_name) = lower(c.wg_name))
),
hit AS (
  SELECT DISTINCT ON (v.wg_name)
         v.wg_name, v.class_id, v.rule_id, e.pf2e_name, e.pf2e_slug, e.item_kind, e.source_path
  FROM valid v
  JOIN pf2e_catalog_entries e ON lower(e.pf2e_name) = lower(v.tgt)
  ORDER BY v.wg_name, v.priority,
           (e.class_id IS NOT DISTINCT FROM v.class_id) DESC,
           (e.compendium_collection IN ('pf2e.classfeatures', 'pf2e.feats-srd')) DESC,
           e.source_path
)
SELECT * FROM hit;

INSERT INTO compendium_match_aliases (ruleset_id, item_kind, source_name, target_name, source_slug, target_slug,
  match_strategy, priority, status, evidence_ref, notes, class_id, rename_via)
SELECT 'pf2e-remaster',
       CASE r.item_kind WHEN 'classfeature' THEN 'feat' ELSE r.item_kind END,
       r.wg_name, r.pf2e_name, wgi_slugify(r.wg_name), r.pf2e_slug,
       'canonical', 50, 'active', 'PF2e 8.6.1: ' || r.source_path,
       '[025] rule ' || r.rule_id, r.class_id, 'class-rename'
FROM _ren r
ON CONFLICT (ruleset_id, item_kind, source_slug, target_slug, COALESCE(class_id, ''::text)) DO NOTHING;

-- Keyword-level matches for class content (same class when the rule names one).
INSERT INTO wg_pf2e_keyword_matches (source_table, wg_id, wg_name, class_id, pf2e_keyword_id,
  match_strategy, status, evidence_ref, notes)
SELECT DISTINCT s.source_table, s.wg_id, s.wg_name, k.class_id, k.keyword_id,
       'alias', 'active', 'PF2e 8.6.1: ' || k.source_path, '[025] rule ' || r.rule_id
FROM _ren r
JOIN wg_keyword_snapshot s ON s.source_table = 'ability_block' AND s.wg_name = r.wg_name
JOIN pf2e_class_keywords k ON lower(k.pf2e_name) = lower(r.pf2e_name) AND k.status = 'active'
  AND (r.class_id IS NULL OR k.class_id = r.class_id)
ON CONFLICT (source_table, wg_id, class_id, pf2e_keyword_id) DO NOTHING;

COMMIT;
