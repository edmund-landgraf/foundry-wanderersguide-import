-- Exact WG spell matches against the locally copied PF2e spell domain.
CREATE TABLE IF NOT EXISTS wg_pf2e_spell_matches (
  match_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wg_id bigint NOT NULL,
  wg_name text NOT NULL,
  wg_rank integer NOT NULL,
  pf2e_spell_keyword_id bigint NOT NULL REFERENCES pf2e_spell_keywords(spell_keyword_id) ON DELETE CASCADE,
  match_strategy text NOT NULL CHECK (match_strategy IN ('exact', 'alias', 'unresolved')),
  status text NOT NULL CHECK (status IN ('active', 'proposed', 'unresolved')),
  evidence_ref text NOT NULL,
  notes text,
  UNIQUE (wg_id, pf2e_spell_keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_wg_pf2e_spell_matches_name
  ON wg_pf2e_spell_matches(lower(wg_name), wg_rank, status);

INSERT INTO wg_pf2e_spell_matches
  (wg_id, wg_name, wg_rank, pf2e_spell_keyword_id, match_strategy, status, evidence_ref, notes)
SELECT s.wg_id, s.wg_name, (s.row_data->>'rank')::integer, p.spell_keyword_id,
       'exact', 'active',
       'WG snapshot ' || s.source_ref || '; PF2e spell catalog ' || p.source_path,
       'Exact case-insensitive name and rank match; no semantic inference.'
FROM wg_keyword_snapshot s
JOIN pf2e_spell_keywords p
  ON lower(s.wg_name) = lower(p.pf2e_name)
 AND (s.row_data->>'rank')::integer = p.rank
WHERE s.source_table = 'spell'
  AND NOT EXISTS (
    SELECT 1 FROM wg_pf2e_spell_matches m
    WHERE m.wg_id = s.wg_id AND m.pf2e_spell_keyword_id = p.spell_keyword_id
  );

INSERT INTO compendium_match_aliases
  (ruleset_id, class_id, item_kind, source_name, target_name, source_slug,
   target_slug, match_strategy, rename_via, priority, status, evidence_ref, notes)
SELECT 'pf2e-remaster', NULL, 'spell', x.wg_name, x.pf2e_name,
       x.source_slug, x.target_slug, 'exact', 'exact',
       100, 'active', x.evidence_ref,
       'Exact WG spell name and rank match; rank retained in wg_pf2e_spell_matches.'
FROM (
  SELECT DISTINCT ON (wgi_sluggify(m.wg_name), wgi_sluggify(p.pf2e_name))
         m.wg_name, p.pf2e_name, wgi_sluggify(m.wg_name) AS source_slug,
         wgi_sluggify(p.pf2e_name) AS target_slug, m.evidence_ref
  FROM wg_pf2e_spell_matches m
  JOIN pf2e_spell_keywords p ON p.spell_keyword_id = m.pf2e_spell_keyword_id
  WHERE m.match_strategy = 'exact'
  ORDER BY wgi_sluggify(m.wg_name), wgi_sluggify(p.pf2e_name), m.match_id
) x
WHERE NOT EXISTS (
    SELECT 1 FROM compendium_match_aliases existing
    WHERE existing.ruleset_id = 'pf2e-remaster'
      AND existing.item_kind = 'spell'
      AND existing.source_slug = x.source_slug
      AND existing.target_slug = x.target_slug
      AND existing.class_id IS NULL
  );

