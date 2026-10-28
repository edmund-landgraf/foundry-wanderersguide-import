-- Evidence-backed matching projection over the full WG keyword snapshot.
-- Only exact names are activated here. Renames belong in
-- compendium_match_aliases; ambiguous candidates remain unresolved.
CREATE TABLE IF NOT EXISTS wg_pf2e_keyword_matches (
  match_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  wg_id bigint NOT NULL,
  wg_name text NOT NULL,
  class_id text NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
  pf2e_keyword_id bigint NOT NULL REFERENCES pf2e_class_keywords(keyword_id) ON DELETE CASCADE,
  match_strategy text NOT NULL CHECK (match_strategy IN ('exact', 'alias', 'unresolved')),
  status text NOT NULL CHECK (status IN ('active', 'proposed', 'unresolved')),
  evidence_ref text NOT NULL,
  notes text,
  UNIQUE (source_table, wg_id, class_id, pf2e_keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_wg_pf2e_keyword_matches_source
  ON wg_pf2e_keyword_matches(source_table, wg_id, status);

CREATE INDEX IF NOT EXISTS idx_wg_pf2e_keyword_matches_pf2e
  ON wg_pf2e_keyword_matches(class_id, pf2e_keyword_id, status);

INSERT INTO wg_pf2e_keyword_matches
  (source_table, wg_id, wg_name, class_id, pf2e_keyword_id,
   match_strategy, status, evidence_ref, notes)
SELECT s.source_table, s.wg_id, s.wg_name, k.class_id, k.keyword_id,
       'exact', 'active',
       'WG snapshot ' || s.source_ref || '; PF2e keyword catalog ' || k.source_path,
       'Exact text match only; no rename or semantic inference.'
FROM wg_keyword_snapshot s
JOIN pf2e_class_keywords k
  ON s.source_table = 'ability_block'
 AND lower(s.wg_name) = lower(k.pf2e_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM wg_pf2e_keyword_matches m
  WHERE m.source_table = s.source_table
    AND m.wg_id = s.wg_id
    AND m.class_id = k.class_id
    AND m.pf2e_keyword_id = k.keyword_id
);

