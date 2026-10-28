-- Data-driven WG -> PF2e compendium matching.
-- This extends the rules registry without changing existing runtime behavior.

CREATE TABLE IF NOT EXISTS compendium_lookup_sets (
  lookup_set_id text PRIMARY KEY,
  ruleset_id text NOT NULL REFERENCES rulesets(ruleset_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL CHECK (status IN ('proposed', 'active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compendium_lookup_members (
  lookup_member_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lookup_set_id text NOT NULL REFERENCES compendium_lookup_sets(lookup_set_id) ON DELETE CASCADE,
  compendium_collection text NOT NULL,
  item_kind text NOT NULL,
  priority integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  evidence_ref text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lookup_set_id, item_kind, compendium_collection)
);

CREATE TABLE IF NOT EXISTS compendium_match_aliases (
  alias_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruleset_id text NOT NULL REFERENCES rulesets(ruleset_id) ON DELETE CASCADE,
  item_kind text NOT NULL,
  source_name text NOT NULL,
  target_name text NOT NULL,
  source_slug text NOT NULL,
  target_slug text NOT NULL,
  match_strategy text NOT NULL CHECK (match_strategy IN ('exact', 'canonical', 'semantic', 'grade-fallback')),
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL CHECK (status IN ('proposed', 'active', 'retired')),
  evidence_ref text,
  notes text,
  UNIQUE (ruleset_id, item_kind, source_slug, target_slug)
);

CREATE TABLE IF NOT EXISTS compendium_match_rules (
  match_rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruleset_id text NOT NULL REFERENCES rulesets(ruleset_id) ON DELETE CASCADE,
  item_kind text NOT NULL,
  rule_key text NOT NULL,
  rule_kind text NOT NULL CHECK (rule_kind IN ('type-map', 'name-normalization', 'semantic-suffix', 'confidence-gate', 'grade-fallback')),
  payload jsonb NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL CHECK (status IN ('proposed', 'active', 'retired')),
  evidence_ref text,
  notes text,
  UNIQUE (ruleset_id, item_kind, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_lookup_members_order
  ON compendium_lookup_members(lookup_set_id, item_kind, priority);
CREATE INDEX IF NOT EXISTS idx_match_aliases_source
  ON compendium_match_aliases(ruleset_id, item_kind, source_slug, priority);
CREATE INDEX IF NOT EXISTS idx_match_rules_kind
  ON compendium_match_rules(ruleset_id, item_kind, rule_kind, priority);

INSERT INTO compendium_lookup_sets (lookup_set_id, ruleset_id, name, description, status)
VALUES ('pf2e-remaster-default', 'pf2e-remaster', 'PF2e Remaster default',
        'Default ordered lookup policy for the Foundry PF2e remaster compendia.', 'active')
ON CONFLICT (lookup_set_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now();

INSERT INTO compendium_lookup_members
  (lookup_set_id, compendium_collection, item_kind, priority, evidence_ref, notes)
VALUES
  ('pf2e-remaster-default', 'pf2e.feats-srd', 'feat', 100, 'runtime:compendiumIndex', 'Core feat documents.'),
  ('pf2e-remaster-default', 'pf2e.classfeatures', 'class', 100, 'runtime:compendiumIndex', 'Core class documents.'),
  ('pf2e-remaster-default', 'pf2e.equipment-srd', 'equipment', 100, 'runtime:compendiumIndex', 'Core equipment and weapon documents.'),
  ('pf2e-remaster-default', 'pf2e.spells-srd', 'spell', 100, 'runtime:compendiumIndex', 'Core spell documents.')
ON CONFLICT (lookup_set_id, item_kind, compendium_collection)
DO UPDATE SET priority = EXCLUDED.priority, enabled = true, updated_at = now();

INSERT INTO compendium_match_aliases
  (ruleset_id, item_kind, source_name, target_name, source_slug, target_slug, match_strategy, priority, status, evidence_ref)
VALUES
  ('pf2e-remaster', 'feat', 'Redemption Cause', 'Redemption', 'redemption-cause', 'redemption', 'canonical', 100, 'active', 'PR#60/PR#69'),
  ('pf2e-remaster', 'feat', 'Bomber Research Field', 'Bomber', 'bomber-research-field', 'bomber', 'semantic', 100, 'active', 'PR#47'),
  ('pf2e-remaster', 'feat', 'Polymath Muse', 'Polymath', 'polymath-muse', 'polymath', 'semantic', 100, 'active', 'PR#3/PR#69')
ON CONFLICT (ruleset_id, item_kind, source_slug, target_slug)
DO UPDATE SET target_name = EXCLUDED.target_name, status = EXCLUDED.status, evidence_ref = EXCLUDED.evidence_ref;

INSERT INTO compendium_match_rules
  (ruleset_id, item_kind, rule_key, rule_kind, payload, priority, status, evidence_ref, notes)
VALUES
  ('pf2e-remaster', '*', 'type-map', 'type-map',
   '{"ancestry":["ancestry"],"heritage":["heritage"],"background":["background"],"class":["class"],"feat":["feat","action"],"spell":["spell"],"equipment":["weapon","armor","shield","equipment","consumable","treasure","backpack","kit"]}',
   10, 'active', 'rule_definitions:importer.kind_item_types', 'Allowed PF2e document types by WG entry kind.'),
  ('pf2e-remaster', '*', 'confidence-gate', 'confidence-gate',
   '{"name_match":"one_unique_document_or_one_unique_level_match","ambiguous":"unresolved","fallback_to_first":false}',
   20, 'active', 'PR#3/PR#6', 'Never select the first ambiguous compendium result.'),
  ('pf2e-remaster', '*', 'semantic-role-suffixes', 'semantic-suffix',
   '{"suffixes":["research field","methodology","bloodline","doctrine","mystery","patron","cause","muse","school","instinct","ikon","implement","apparition","thesis","curriculum","order"]}',
   30, 'active', 'scripts/mapping.js:SEMANTIC_ROLE_SUFFIXES', 'Canonical option matching for WG role-suffixed names.'),
  ('pf2e-remaster', 'equipment', 'grade-fallback', 'grade-fallback',
   '{"order":["minor","lesser","moderate","greater","major"],"only_when_ungraded_source":true}',
   40, 'active', 'PR#49', 'Use the lowest matching PF2e grade only when WG supplied no grade.')
ON CONFLICT (ruleset_id, item_kind, rule_key)
DO UPDATE SET payload = EXCLUDED.payload, priority = EXCLUDED.priority, status = EXCLUDED.status,
              evidence_ref = EXCLUDED.evidence_ref, notes = EXCLUDED.notes;

