-- 030: Name-normalized WG <-> PF2e 8.6.1 match PROPOSALS and PF2e source-book scope.
-- Nothing here creates a final association. Every row in wg_pf2e_name_proposals is
-- 'proposed' (one candidate left) or 'ambiguous' (several left) and must go through
-- human review (see docs/design/human-matching-app.md, proposed 032_human_matching).
-- Rules:
--   paren-strip     : trailing parentheticals are stripped on either side ("(Alchemist)",
--                     "(legacy)", "(Monk)", "(Paragon)", "(Naari)", ...) and names compared.
--   rename-doctrine : PF2e "<Ordinal> Doctrine (X)" -> WG "X Doctrine" (many-to-one).
-- Disambiguation (never a default): WG candidates whose own parenthetical tag (other than
-- "legacy") is not among the PF2e entry's traits/tags are dropped; then the candidates with
-- the largest overlap of WG trait names/tags with PF2e traits/tags are kept; a non-legacy
-- PF2e entry keeps non-legacy WG rows when any exist. Anything still >1 is 'ambiguous'.
-- Scope: pf2e_catalog_entries.pf2e_source_book (filled by 023 from system.publication.title)
-- is compared with WG content_source names. Books WG lacks (absent, or present with no
-- ability blocks) are 'out-of-scope', not 'unmatched'. override_scope lets a human fix it.
-- Derived tables are rebuilt each run (idempotent). Run after 028.
-- Requires WG content_source rows in wg_keyword_snapshot (source_table='content_source').
BEGIN;

ALTER TABLE wg_keyword_snapshot DROP CONSTRAINT IF EXISTS wg_keyword_snapshot_source_table_check;
ALTER TABLE wg_keyword_snapshot ADD CONSTRAINT wg_keyword_snapshot_source_table_check
  CHECK (source_table IN ('class', 'ability_block', 'item', 'spell', 'trait', 'content_source',
                          'ancestry', 'background', 'archetype', 'versatile_heritage'));
ALTER TABLE pf2e_catalog_entries ADD COLUMN IF NOT EXISTS pf2e_source_book text;

CREATE OR REPLACE FUNCTION wgi_strip_paren(n text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT lower(btrim(regexp_replace(coalesce(n, ''), '(\s*\([^()]*\))+\s*$', '')))
$f$;
CREATE OR REPLACE FUNCTION wgi_paren_tags(n text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(array_agg(lower(btrim(m[1]))), '{}')
  FROM regexp_matches(coalesce(substring(n FROM '((\s*\([^()]*\))+)\s*$'), ''), '\(([^()]*)\)', 'g') AS m
$f$;
CREATE OR REPLACE FUNCTION wgi_book_key(n text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(n, '')),
    '^((pathfinder|lost omens|adventure path:|adventure:|the)\s+)+', ''),
    '\s*\((backport|in progress|remastered)\)', '', 'g'),
    '\s+hardcover compilation$', ''))
$f$;

-- Book scope ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pf2e_book_wg_scope (
  pf2e_source_book text PRIMARY KEY,
  wg_content_source_ids bigint[] NOT NULL DEFAULT '{}',
  wg_ability_blocks integer NOT NULL DEFAULT 0,
  pf2e_entries integer NOT NULL DEFAULT 0,
  scope text NOT NULL CHECK (scope IN ('in-scope', 'wg-book-absent', 'wg-book-empty', 'no-book-recorded')),
  override_scope text CHECK (override_scope IN ('in-scope', 'wg-book-absent', 'wg-book-empty')),
  notes text
);
WITH cs AS (
  SELECT wg_id, wgi_book_key(wg_name) AS k FROM wg_keyword_snapshot WHERE source_table = 'content_source'
), ab AS (
  -- every WG content table that carries content_source_id (ability blocks, spells, items, classes, ...)
  SELECT (row_data->>'content_source_id')::bigint AS cs_id, count(*) AS n
  FROM wg_keyword_snapshot WHERE source_table NOT IN ('content_source', 'trait') AND row_data ? 'content_source_id' GROUP BY 1
), bk AS (
  SELECT coalesce(nullif(btrim(pf2e_source_book), ''), '(none)') AS book, count(*) AS n
  FROM pf2e_catalog_entries GROUP BY 1
), j AS (
  SELECT bk.book, bk.n, coalesce(array_agg(cs.wg_id ORDER BY cs.wg_id) FILTER (WHERE cs.wg_id IS NOT NULL), '{}') AS ids,
         coalesce(sum(ab.n), 0)::int AS blocks
  FROM bk LEFT JOIN cs ON bk.book <> '(none)' AND cs.k = wgi_book_key(bk.book)
  LEFT JOIN ab ON ab.cs_id = cs.wg_id
  GROUP BY bk.book, bk.n
)
INSERT INTO pf2e_book_wg_scope (pf2e_source_book, wg_content_source_ids, wg_ability_blocks, pf2e_entries, scope)
SELECT book, ids, blocks, n,
  CASE WHEN book = '(none)' THEN 'no-book-recorded' WHEN cardinality(ids) = 0 THEN 'wg-book-absent'
       WHEN blocks = 0 THEN 'wg-book-empty' ELSE 'in-scope' END
FROM j
ON CONFLICT (pf2e_source_book) DO UPDATE SET wg_content_source_ids = EXCLUDED.wg_content_source_ids,
  wg_ability_blocks = EXCLUDED.wg_ability_blocks, pf2e_entries = EXCLUDED.pf2e_entries, scope = EXCLUDED.scope;
DELETE FROM pf2e_book_wg_scope s WHERE NOT EXISTS (
  SELECT 1 FROM pf2e_catalog_entries e WHERE coalesce(nullif(btrim(e.pf2e_source_book), ''), '(none)') = s.pf2e_source_book);

-- Proposals ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wg_pf2e_name_proposals (
  proposal_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id bigint NOT NULL REFERENCES pf2e_catalog_entries(entry_id) ON DELETE CASCADE,
  pf2e_name text NOT NULL,
  wg_id bigint NOT NULL,
  wg_name text,
  rule text NOT NULL CHECK (rule IN ('paren-strip', 'rename-doctrine')),
  status text NOT NULL CHECK (status IN ('proposed', 'ambiguous')),
  candidate_count integer NOT NULL,
  disambiguated_by text,
  evidence_ref text,
  UNIQUE (entry_id, wg_id)
);
-- 031 adds proposals for other WG tables; wg_id is only unique within its table.
ALTER TABLE wg_pf2e_name_proposals ADD COLUMN IF NOT EXISTS source_table text;
UPDATE wg_pf2e_name_proposals SET source_table = 'ability_block' WHERE source_table IS NULL;
ALTER TABLE wg_pf2e_name_proposals ALTER COLUMN source_table SET NOT NULL;
ALTER TABLE wg_pf2e_name_proposals DROP CONSTRAINT IF EXISTS wg_pf2e_name_proposals_entry_id_wg_id_key;
ALTER TABLE wg_pf2e_name_proposals DROP CONSTRAINT IF EXISTS wg_pf2e_name_proposals_src_entry_wg_key;
ALTER TABLE wg_pf2e_name_proposals ADD CONSTRAINT wg_pf2e_name_proposals_src_entry_wg_key UNIQUE (source_table, entry_id, wg_id);
TRUNCATE wg_pf2e_name_proposals;

CREATE TEMP TABLE _wg ON COMMIT DROP AS
SELECT s.wg_id, s.wg_name, s.row_data->>'type' AS wg_type, wgi_strip_paren(s.wg_name) AS norm,
       wgi_paren_tags(s.wg_name) AS tags,
       coalesce((SELECT array_agg(DISTINCT wgi_strip_paren(t.wg_name)) FROM wg_keyword_snapshot t
                 WHERE t.source_table = 'trait' AND t.wg_id IN (SELECT jsonb_array_elements_text(s.row_data->'traits')::bigint)), '{}') AS tnames
FROM wg_keyword_snapshot s
WHERE s.source_table = 'ability_block' AND s.row_data->>'type' IN ('feat', 'class-feature', 'action', 'heritage')
  AND jsonb_typeof(s.row_data->'traits') = 'array';
CREATE INDEX ON _wg (norm);

CREATE TEMP TABLE _pf ON COMMIT DROP AS
SELECT e.entry_id, e.pf2e_name, e.item_kind, wgi_strip_paren(e.pf2e_name) AS norm, wgi_paren_tags(e.pf2e_name) AS tags,
       string_to_array(coalesce(e.traits, ''), ',') AS traits,
       substring(e.pf2e_name FROM '^(?:First|Second|Third|Fourth|Fifth|Final) Doctrine \((.+)\)$') AS doctrine_of
FROM pf2e_catalog_entries e
WHERE e.item_kind IN ('feat', 'classfeature', 'action', 'heritage')
  AND NOT EXISTS (SELECT 1 FROM wg_pf2e_catalog_matches m WHERE m.entry_id = e.entry_id);

CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT p.entry_id, p.pf2e_name, w.wg_id, w.wg_name, 'rename-doctrine'::text AS rule, p.item_kind, w.wg_type, p.traits, p.tags AS ptags, w.tags AS wtags, w.tnames
FROM _pf p JOIN _wg w ON p.doctrine_of IS NOT NULL AND w.norm = lower(p.doctrine_of || ' doctrine')
UNION ALL
SELECT p.entry_id, p.pf2e_name, w.wg_id, w.wg_name, 'paren-strip', p.item_kind, w.wg_type, p.traits, p.tags, w.tags, w.tnames
FROM _pf p JOIN _wg w ON w.norm = p.norm AND p.norm <> ''
WHERE p.doctrine_of IS NULL AND (cardinality(p.tags) > 0 OR cardinality(w.tags) > 0);

CREATE TEMP TABLE _r ON COMMIT DROP AS
WITH k AS (
  SELECT c.*, (c.item_kind = CASE c.wg_type WHEN 'feat' THEN 'feat' WHEN 'class-feature' THEN 'classfeature'
                 WHEN 'heritage' THEN 'heritage' WHEN 'action' THEN 'action' END) AS pk,
         EXISTS (SELECT 1 FROM unnest(c.wtags) t WHERE t <> 'legacy' AND NOT (t = ANY (c.traits || c.ptags))) AS tagconflict,
         (SELECT count(*) FROM unnest(c.tnames || c.wtags) t WHERE t <> 'legacy' AND t = ANY (c.traits || c.ptags)) AS overlap,
         ('legacy' = ANY (c.wtags)) AS wlegacy, ('legacy' = ANY (c.ptags)) AS plegacy
  FROM _c c
), k1 AS (SELECT * FROM (SELECT k.*, bool_or(pk) OVER w AS anypk FROM k WINDOW w AS (PARTITION BY entry_id)) x WHERE pk OR NOT anypk),
k2 AS (SELECT * FROM (SELECT k1.*, bool_and(tagconflict) OVER (PARTITION BY entry_id) AS allc FROM k1) x WHERE NOT tagconflict OR allc),
k3 AS (SELECT * FROM (SELECT k2.*, max(overlap) OVER (PARTITION BY entry_id) AS mo FROM k2) x WHERE overlap = mo),
k4 AS (SELECT * FROM (SELECT k3.*, bool_or(NOT wlegacy) OVER (PARTITION BY entry_id) AS anynl FROM k3) x
       WHERE plegacy OR NOT anynl OR NOT wlegacy),
cnt AS (SELECT k4.*, count(*) OVER (PARTITION BY entry_id) AS n,
               (SELECT count(*) FROM _c c2 WHERE c2.entry_id = k4.entry_id) AS n0 FROM k4)
SELECT * FROM cnt;

INSERT INTO wg_pf2e_name_proposals (source_table, entry_id, pf2e_name, wg_id, wg_name, rule, status, candidate_count, disambiguated_by, evidence_ref)
SELECT 'ability_block', entry_id, pf2e_name, wg_id, wg_name, rule, CASE WHEN n = 1 THEN 'proposed' ELSE 'ambiguous' END, n,
  CASE WHEN n0 > n THEN concat_ws(' ', CASE WHEN mo > 0 THEN 'trait/tag overlap=' || mo END, 'narrowed ' || n0 || '->' || n) END,
  'wg ability_block#' || wg_id || ' vs pf2e entry#' || entry_id || ' [030 ' || rule || ']'
FROM _r;

-- Reporting view: PF2e entries with no WG match of any kind, split by scope.
CREATE OR REPLACE VIEW pf2e_unmatched_entries AS
SELECT e.entry_id, e.item_kind, e.pf2e_name, e.pf2e_source_book,
  coalesce(s.override_scope, s.scope) AS book_scope,
  CASE WHEN coalesce(s.override_scope, s.scope) IN ('wg-book-absent', 'wg-book-empty') THEN 'out-of-scope' ELSE 'unmatched' END AS reason
FROM pf2e_catalog_entries e
LEFT JOIN pf2e_book_wg_scope s ON s.pf2e_source_book = coalesce(nullif(btrim(e.pf2e_source_book), ''), '(none)')
WHERE NOT EXISTS (SELECT 1 FROM wg_pf2e_catalog_matches m WHERE m.entry_id = e.entry_id)
  AND NOT EXISTS (SELECT 1 FROM wg_pf2e_name_proposals p WHERE p.entry_id = e.entry_id);
COMMIT;
