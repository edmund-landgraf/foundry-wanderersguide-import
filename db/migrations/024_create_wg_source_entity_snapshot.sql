-- Source-backed WG entity copy for domains that are not represented by the
-- original keyword snapshot.  The original snapshot intentionally covered
-- only keyword-bearing tables; this table preserves the complete source row
-- as JSON so relationship-bearing tables can be matched offline as well.
CREATE TABLE IF NOT EXISTS wg_source_entity_snapshot (
  snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  wg_id bigint NOT NULL,
  wg_name text,
  row_data jsonb NOT NULL,
  source_database text NOT NULL,
  source_repo text NOT NULL,
  source_ref text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, wg_id)
);

CREATE INDEX IF NOT EXISTS idx_wg_source_entity_snapshot_name
  ON wg_source_entity_snapshot (lower(wg_name), source_table);

CREATE INDEX IF NOT EXISTS idx_wg_source_entity_snapshot_data
  ON wg_source_entity_snapshot USING gin (row_data);

-- These are the native WG tables and relationships that must remain visible
-- to the matcher.  They are metadata, not guessed mappings.
CREATE TABLE IF NOT EXISTS wg_source_relationship_inventory (
  source_table text NOT NULL,
  relationship_name text NOT NULL,
  target_table text NOT NULL,
  source_column text NOT NULL,
  target_column text NOT NULL,
  evidence_ref text NOT NULL,
  notes text NOT NULL,
  PRIMARY KEY (source_table, relationship_name)
);

INSERT INTO wg_source_relationship_inventory
  (source_table, relationship_name, target_table, source_column,
   target_column, evidence_ref, notes)
VALUES
  ('versatile_heritage', 'heritage-definition', 'ability_block', 'heritage_id', 'id',
   'wanderers-guide/data/schema.sql:758-780',
   'WG stores the selectable versatile heritage and its base heritage ability separately.'),
  ('versatile_heritage', 'trait', 'trait', 'trait_id', 'id',
   'wanderers-guide/data/schema.sql:758-780',
   'Trait is a source relationship, not a PF2e name alias.'),
  ('class_archetype', 'class', 'class', 'class_id', 'id',
   'wanderers-guide/data/schema.sql:317-340',
   'Class archetype is scoped to a class when WG provides class_id.'),
  ('class_archetype', 'archetype', 'archetype', 'archetype_id', 'id',
   'wanderers-guide/data/schema.sql:317-340',
   'Class archetype may also point at its ordinary archetype definition.'),
  ('archetype', 'dedication-feat', 'ability_block', 'dedication_feat_id', 'id',
   'wanderers-guide/data/schema.sql:116-153',
   'The dedication feat is a source-backed parent link.'),
  ('ability_block', 'content-source', 'content_source', 'content_source_id', 'id',
   'wanderers-guide/data/schema.sql:29-57',
   'Content source controls provenance and availability.'),
  ('background', 'content-source', 'content_source', 'content_source_id', 'id',
   'wanderers-guide/data/schema.sql:155-184',
   'Background provenance is retained for source and version scoping.'),
  ('ancestry', 'trait', 'trait', 'trait_id', 'id',
   'wanderers-guide/data/schema.sql:77-114',
   'Ancestry trait relationship is copied as source evidence.'),
  ('spell', 'content-source', 'content_source', 'content_source_id', 'id',
   'wanderers-guide/data/schema.sql:679-726',
   'Spell provenance is retained for version-aware matching.'),
  ('item', 'content-source', 'content_source', 'content_source_id', 'id',
   'wanderers-guide/data/schema.sql:554-677',
   'Item provenance is retained for version-aware matching.')
ON CONFLICT (source_table, relationship_name) DO UPDATE SET
  target_table = EXCLUDED.target_table,
  source_column = EXCLUDED.source_column,
  target_column = EXCLUDED.target_column,
  evidence_ref = EXCLUDED.evidence_ref,
  notes = EXCLUDED.notes;

-- Keep the first snapshot query surface available in the all-entity copy.
INSERT INTO wg_source_entity_snapshot
  (source_table, wg_id, wg_name, row_data, source_database, source_repo, source_ref)
SELECT source_table, wg_id, wg_name, row_data, source_database, source_repo, source_ref
FROM wg_keyword_snapshot
ON CONFLICT (source_table, wg_id) DO NOTHING;

