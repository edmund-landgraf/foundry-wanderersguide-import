-- Canonical PF2e spell domain copied from the local Foundry PF2e packs.
CREATE TABLE IF NOT EXISTS pf2e_spell_keywords (
  spell_keyword_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruleset_id text NOT NULL REFERENCES rulesets(ruleset_id) ON DELETE CASCADE,
  pf2e_name text NOT NULL,
  pf2e_slug text NOT NULL,
  rank integer NOT NULL,
  traditions text[] NOT NULL DEFAULT '{}',
  compendium_collection text NOT NULL,
  source_path text NOT NULL,
  foundry_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'proposed', 'retired')),
  evidence_ref text NOT NULL,
  UNIQUE (ruleset_id, pf2e_slug, rank, compendium_collection)
);

CREATE INDEX IF NOT EXISTS idx_pf2e_spell_keywords_lookup
  ON pf2e_spell_keywords(ruleset_id, lower(pf2e_name), rank);

