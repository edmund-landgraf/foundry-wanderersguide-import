-- Canonical PF2e class keyword catalog.
-- This is deliberately not a WG alias table: a PF2e keyword is not evidence
-- that a WG source string should map to it. WG aliases remain explicit and
-- evidence-backed in compendium_match_aliases.
CREATE TABLE IF NOT EXISTS pf2e_class_keywords (
  keyword_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruleset_id text NOT NULL REFERENCES rulesets(ruleset_id) ON DELETE CASCADE,
  class_id text NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
  item_kind text NOT NULL,
  pf2e_name text NOT NULL,
  pf2e_slug text NOT NULL,
  compendium_collection text NOT NULL,
  source_path text NOT NULL,
  foundry_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'proposed', 'retired')),
  evidence_ref text NOT NULL,
  notes text,
  UNIQUE (ruleset_id, class_id, item_kind, pf2e_slug, compendium_collection)
);

CREATE INDEX IF NOT EXISTS idx_pf2e_class_keywords_lookup
  ON pf2e_class_keywords(ruleset_id, class_id, item_kind, pf2e_slug);

