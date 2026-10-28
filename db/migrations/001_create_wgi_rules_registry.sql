-- Wanderer's Guide / Foundry class-rules registry.
-- Target: PostgreSQL. This migration is intentionally isolated from the
-- proposal-manager database/schema and contains no runtime credentials.

CREATE TABLE IF NOT EXISTS rulesets (
  ruleset_id text PRIMARY KEY,
  system_id text NOT NULL,
  min_version text,
  max_version text,
  status text NOT NULL CHECK (status IN ('active', 'experimental', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  class_id text PRIMARY KEY,
  ruleset_id text NOT NULL REFERENCES rulesets(ruleset_id),
  name text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('P0', 'P1')),
  support_status text NOT NULL CHECK (support_status IN ('experimental', 'partial', 'verified')),
  pf2e_slug text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_sources (
  class_source_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id text NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  wg_content_id text,
  wg_scope text,
  wg_key_pattern text,
  pf2e_uuid text,
  pf2e_slug text,
  match_strategy text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'evidence-needed', 'active', 'retired')),
  evidence_ref text,
  notes text,
  UNIQUE (class_id, source_kind, wg_content_id, wg_key_pattern)
);

CREATE TABLE IF NOT EXISTS selection_rules (
  selection_rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id text REFERENCES classes(class_id) ON DELETE CASCADE,
  source_pattern text NOT NULL,
  owner_pattern text,
  selection_kind text NOT NULL,
  target_kind text NOT NULL,
  legal_match text NOT NULL,
  unresolved_policy text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL CHECK (status IN ('proposed', 'active', 'retired')),
  evidence_ref text,
  notes text,
  UNIQUE (class_id, source_pattern, priority)
);

CREATE TABLE IF NOT EXISTS grant_rules (
  grant_rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id text REFERENCES classes(class_id) ON DELETE CASCADE,
  parent_source_pattern text NOT NULL,
  child_source_pattern text NOT NULL,
  ownership_evidence text NOT NULL,
  dedupe_policy text NOT NULL,
  choice_policy text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'active', 'retired')),
  evidence_ref text,
  notes text,
  UNIQUE (class_id, parent_source_pattern, child_source_pattern)
);

CREATE TABLE IF NOT EXISTS spellcasting_rules (
  spellcasting_rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id text NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
  source_pattern text NOT NULL,
  entry_kind text NOT NULL,
  tradition text,
  ability text,
  slot_policy text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'active', 'retired')),
  evidence_ref text,
  notes text,
  UNIQUE (class_id, source_pattern)
);

CREATE TABLE IF NOT EXISTS coverage_cases (
  case_id text PRIMARY KEY,
  class_id text REFERENCES classes(class_id) ON DELETE CASCADE,
  fixture_id text NOT NULL,
  source_path text NOT NULL,
  expected_status text NOT NULL CHECK (expected_status IN ('mapped', 'included', 'unresolved', 'preserved', 'dropped')),
  reason_code text,
  evidence_ref text,
  last_verified date,
  notes text,
  UNIQUE (fixture_id, source_path)
);

CREATE INDEX IF NOT EXISTS idx_class_sources_class ON class_sources(class_id);
CREATE INDEX IF NOT EXISTS idx_selection_rules_lookup ON selection_rules(class_id, source_pattern, priority);
CREATE INDEX IF NOT EXISTS idx_grant_rules_lookup ON grant_rules(class_id, parent_source_pattern);
CREATE INDEX IF NOT EXISTS idx_spellcasting_rules_lookup ON spellcasting_rules(class_id, source_pattern);
CREATE INDEX IF NOT EXISTS idx_coverage_cases_class_status ON coverage_cases(class_id, expected_status);
