-- 031: Match the other WG content tables against the full PF2e 8.6.1 catalog, and propose
-- WG-only rows as out of scope ("no PF2e item"). Run after 023 (all packs), 028 and 030.
-- Rules are the 028/030 rules, applied per WG table with a fixed catalog kind (no cross-kind fallback):
--   spell -> spell, item -> equipment, class -> class, ancestry -> ancestry, background -> background,
--   versatile_heritage -> heritage.
--   exact (case-insensitive name): 1 candidate => 'active', >1 => 'ambiguous' (no pick), 0 => 'unresolved'.
--   archetype -> its dedication feat: inherits the 028 result of the WG ability_block named by
--   archetype.dedication_feat_id (no name guessing). No dedication feat row => 'unresolved'.
--   paren-strip (030 rule) for rows with no exact candidate => wg_pf2e_name_proposals only (review).
-- WG-only scope proposals are never final: wg_scope_proposals rows are status 'proposed' for a human.
-- Derived rows are rebuilt each run (idempotent).
BEGIN;

DELETE FROM wg_pf2e_catalog_matches WHERE source_table <> 'ability_block';
DELETE FROM wg_pf2e_name_proposals WHERE source_table <> 'ability_block';

CREATE TEMP TABLE _w ON COMMIT DROP AS
SELECT s.source_table, s.wg_id, s.wg_name,
       CASE s.source_table WHEN 'spell' THEN 'spell' WHEN 'item' THEN 'equipment' WHEN 'class' THEN 'class'
         WHEN 'ancestry' THEN 'ancestry' WHEN 'background' THEN 'background' WHEN 'versatile_heritage' THEN 'heritage' END AS kind
FROM wg_keyword_snapshot s
WHERE s.source_table IN ('spell', 'item', 'class', 'ancestry', 'background', 'versatile_heritage');

CREATE TEMP TABLE _x ON COMMIT DROP AS
SELECT w.source_table, w.wg_id, w.wg_name, w.kind, e.entry_id, e.pf2e_name, e.source_path,
       count(e.entry_id) OVER (PARTITION BY w.source_table, w.wg_id) AS n
FROM _w w LEFT JOIN pf2e_catalog_entries e ON e.item_kind = w.kind AND lower(e.pf2e_name) = lower(w.wg_name);

INSERT INTO wg_pf2e_catalog_matches (source_table, wg_id, wg_name, wg_type, entry_id, pf2e_name,
  match_strategy, status, candidate_count, evidence_ref)
SELECT source_table, wg_id, wg_name, source_table, entry_id, pf2e_name,
       CASE WHEN n = 0 THEN 'unresolved' ELSE 'exact' END,
       CASE WHEN n = 0 THEN 'unresolved' WHEN n > 1 THEN 'ambiguous' ELSE 'active' END, n,
       CASE WHEN n = 0 THEN 'no PF2e 8.6.1 ' || kind || ' entry' ELSE 'PF2e 8.6.1: ' || source_path END
FROM _x;

-- archetype -> dedication feat (via WG's own dedication_feat_id link)
INSERT INTO wg_pf2e_catalog_matches (source_table, wg_id, wg_name, wg_type, entry_id, pf2e_name,
  match_strategy, status, candidate_count, evidence_ref)
SELECT 'archetype', a.wg_id, a.wg_name, 'archetype', m.entry_id, m.pf2e_name,
       coalesce(m.match_strategy, 'unresolved'), coalesce(m.status, 'unresolved'), coalesce(m.candidate_count, 0),
       CASE WHEN m.match_id IS NULL THEN 'no dedication feat match (dedication_feat_id=' || coalesce(a.row_data->>'dedication_feat_id', 'null') || ')'
            ELSE 'via dedication feat ability_block#' || (a.row_data->>'dedication_feat_id') || ': ' || coalesce(m.evidence_ref, '') END
FROM wg_keyword_snapshot a
LEFT JOIN wg_pf2e_catalog_matches m ON m.source_table = 'ability_block'
  AND m.wg_id = (a.row_data->>'dedication_feat_id')::bigint
WHERE a.source_table = 'archetype';

-- paren-strip proposals for WG rows with no exact candidate (same kind only)
INSERT INTO wg_pf2e_name_proposals (source_table, entry_id, pf2e_name, wg_id, wg_name, rule, status, candidate_count, evidence_ref)
SELECT c.source_table, c.entry_id, c.pf2e_name, c.wg_id, c.wg_name, 'paren-strip',
       CASE WHEN c.n = 1 THEN 'proposed' ELSE 'ambiguous' END, c.n,
       'wg ' || c.source_table || '#' || c.wg_id || ' vs pf2e entry#' || c.entry_id || ' [031 paren-strip ' || c.kind || ']'
FROM (
  SELECT x.source_table, x.wg_id, x.wg_name, x.kind, e.entry_id, e.pf2e_name,
         count(*) OVER (PARTITION BY x.source_table, x.wg_id) AS n
  FROM _x x
  JOIN pf2e_catalog_entries e ON e.item_kind = x.kind AND wgi_strip_paren(e.pf2e_name) = wgi_strip_paren(x.wg_name)
   AND wgi_strip_paren(x.wg_name) <> ''
   AND (cardinality(wgi_paren_tags(e.pf2e_name)) > 0 OR cardinality(wgi_paren_tags(x.wg_name)) > 0)
  WHERE x.n = 0 AND NOT EXISTS (SELECT 1 FROM wg_pf2e_catalog_matches m WHERE m.entry_id = e.entry_id)
) c;

-- WG-only rows: proposed out of scope ("no PF2e item"), for human review -------------------
CREATE TABLE IF NOT EXISTS wg_scope_proposals (
  proposal_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  wg_id bigint NOT NULL,
  wg_name text,
  wg_type text,
  proposed_scope text NOT NULL CHECK (proposed_scope IN ('no-pf2e-item')),
  rule text NOT NULL CHECK (rule IN ('runesmith-rune', 'named-wg-only', 'level-slot')),
  status text NOT NULL CHECK (status IN ('proposed')),
  evidence_ref text,
  UNIQUE (source_table, wg_id)
);
TRUNCATE wg_scope_proposals;
INSERT INTO wg_scope_proposals (source_table, wg_id, wg_name, wg_type, proposed_scope, rule, status, evidence_ref)
SELECT m.source_table, m.wg_id, m.wg_name, m.wg_type, 'no-pf2e-item', k.rule, 'proposed', CASE k.rule
    WHEN 'runesmith-rune' THEN 'PF2e 8.6.1 has no per-rune items; runes are text inside class-features/runesmith/runes.json'
    WHEN 'named-wg-only' THEN 'name absent from every PF2e 8.6.1 pack (full-text search 2026-10-28)'
    WHEN 'level-slot' THEN 'WG level-slot placeholder; PF2e has no item for a slot' END
FROM wg_pf2e_catalog_matches m
CROSS JOIN LATERAL (SELECT CASE
    WHEN m.wg_name ~ ', (Diacritic )?Rune of ' THEN 'runesmith-rune'
    WHEN m.wg_name IN ('Eidolon Skills', 'Reconfigured Evolution', 'Spirit Taker') THEN 'named-wg-only'
    WHEN m.wg_type = 'class-feature' AND btrim(m.wg_name) ~* $re$^(skill feat|general feat|ancestry feat|archetype feat|[a-z' -]+ feat|skill increase|attribute boosts?|ability boosts?|runic repertoire.*|class feat|.*\mfeat \(\d+(st|nd|rd|th)\))$$re$ THEN 'level-slot'
  END AS rule) k
WHERE m.source_table = 'ability_block' AND m.status = 'unresolved' AND k.rule IS NOT NULL;
COMMIT;