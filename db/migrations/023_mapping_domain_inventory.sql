-- Mapping work queue, ordered by source volume and deterministic-match value.
CREATE TABLE IF NOT EXISTS mapping_domain_inventory (
  domain_id text PRIMARY KEY,
  wg_source_table text NOT NULL,
  wg_source_type text,
  pf2e_collection text,
  wg_row_count integer NOT NULL,
  pf2e_row_count integer NOT NULL,
  active_match_count integer NOT NULL DEFAULT 0,
  priority text NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  status text NOT NULL CHECK (status IN ('active', 'queued', 'unresolved', 'excluded')),
  notes text NOT NULL
);

INSERT INTO mapping_domain_inventory
  (domain_id, wg_source_table, wg_source_type, pf2e_collection,
   wg_row_count, pf2e_row_count, active_match_count, priority, status, notes)
VALUES
  ('feat', 'ability_block', 'feat', 'pf2e.feats-srd', 11009, 6366, 1563, 'P0', 'active', 'Exact class-scoped mappings first; ambiguous names remain unresolved.'),
  ('class-feature', 'ability_block', 'class-feature', 'pf2e.classfeatures', 2237, 881, 91, 'P0', 'active', 'Explicit legacy suffix mappings only when the PF2e target is unique.'),
  ('spell', 'spell', NULL, 'pf2e.spells-srd', 2708, 2017, 1168, 'P0', 'active', 'Exact name and rank matches; rank-aware table retained.'),
  ('equipment', 'item', NULL, 'pf2e.equipment-srd', 6606, 5913, 4610, 'P0', 'active', 'Exact source-name matches; grades and variants stay distinct.'),
  ('background', 'background', NULL, 'pf2e.backgrounds', 636, 540, 0, 'P0', 'queued', 'Large player-facing domain; requires a full WG/PF2e background snapshot.'),
  ('action', 'ability_block', 'action', 'pf2e.actions', 137, 583, 102, 'P1', 'active', 'Exact action names; document type remains action.'),
  ('heritage', 'ability_block', 'heritage', 'pf2e.heritages', 620, 334, 320, 'P1', 'active', 'Exact heritage names; ancestry scope may be needed for collisions.'),
  ('ancestry', 'ancestry', NULL, 'pf2e.ancestries', 114, 51, 0, 'P1', 'queued', 'Requires ancestry records plus ancestry feature relationships.'),
  ('versatile-heritage', 'versatile_heritage', NULL, 'pf2e.heritages', 31, 334, 0, 'P1', 'queued', 'Separate from ordinary heritages despite sharing the PF2e collection.'),
  ('archetype', 'archetype', NULL, 'pf2e.feats-srd', 300, 0, 0, 'P1', 'queued', 'Archetype dedication and feat trees need parent/child normalization.'),
  ('class-archetype', 'class_archetype', NULL, 'pf2e.classfeatures', 19, 0, 0, 'P1', 'queued', 'Keep separate from ordinary classes and archetypes.'),
  ('class', 'class', NULL, 'pf2e.classes', 60, 29, 0, 'P1', 'queued', 'Multiple WG legacy/playtest/current rows require version/source scoping.'),
  ('physical-feature', 'ability_block', 'physical-feature', 'pf2e.ancestryfeatures', 110, 0, 0, 'P2', 'queued', 'Choice/grant mechanics require relationship evidence.'),
  ('sense', 'ability_block', 'sense', 'pf2e.ancestryfeatures', 69, 0, 0, 'P2', 'queued', 'Usually rule-bearing options rather than standalone PF2e items.'),
  ('mode', 'ability_block', 'mode', 'pf2e.classfeatures', 49, 0, 0, 'P2', 'queued', 'Often a class/stance mode with fixed choice context.'),
  ('language', 'language', NULL, 'pf2e.traits', 159, 0, 0, 'P2', 'queued', 'Language names are usually trait/data values, not standalone documents.'),
  ('trait', 'trait', NULL, 'pf2e.traits', 1233, 0, 0, 'P2', 'queued', 'Shared vocabulary; map only where WG usage and PF2e semantics are established.'),
  ('creature', 'creature', NULL, 'pf2e.bestiary', 1576, 0, 0, 'P3', 'excluded', 'GM/encounter content is outside character keyword matching for now.')
ON CONFLICT (domain_id) DO UPDATE SET
  wg_source_table = EXCLUDED.wg_source_table,
  wg_source_type = EXCLUDED.wg_source_type,
  pf2e_collection = EXCLUDED.pf2e_collection,
  wg_row_count = EXCLUDED.wg_row_count,
  pf2e_row_count = EXCLUDED.pf2e_row_count,
  active_match_count = EXCLUDED.active_match_count,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes;

