# wgi_rules tables

Counts below are from the local `wgi_rules` database on 2026-10-31 (`docker exec my-postgres psql -U appuser -d wgi_rules`). There are 43 base tables in `public`. The Foundry module does not connect to this database. It reads a generated catalog file.

The database holds four kinds of data:

- A PF2e compendium header catalog, used to match names without opening Foundry.
- A Wanderer's Guide content snapshot and the rules objects parsed out of it.
- Approved and proposed crosswalks from Wanderer's Guide rows to PF2e rows.
- Per-character import runs: the raw export, a plan, and validation checks.

## Ruleset and class policy

| Table | Rows | Function |
|---|---:|---|
| `rulesets` | 1 | The only ruleset is `pf2e-remaster`, status `experimental`. Other tables point at `ruleset_id`. |
| `classes` | 29 | One row per remaster class. `class_id` is the slug (`fighter`, `wizard`). All 29 are `support_status = experimental`. |
| `class_sources` | 58 | Where a class's Wanderer's Guide content is expected to come from: content id, scope, or key pattern, plus the PF2e slug. All 58 are `active`. |
| `rule_definitions` | 30 | Small JSON policy blobs copied from the importer: item type maps, grade and rune maps, choice and grant policy, apply order, API endpoints. Keyed by `rule_key`. |
| `selection_rules` | 8 | How a class selection key is allowed to match a PF2e target. All 8 are `active`. |
| `spellcasting_rules` | 29 | One proposed spellcasting entry per class (tradition, ability, slot policy). None are active yet. |
| `grant_rules` | 1,089 | Parent feature to child feature grant patterns, with dedupe and choice policy. All `active`. |
| `coverage_cases` | 29 | One expected-coverage row per class. Every row is `expected_status = mapped`. |
| `wg_name_rename_rules` | 6 | Regex rename from a Wanderer's Guide class feature name to the PF2e name. `class_id` may come from a capture group. |

## Compendium match registry

These tables are the data-driven half of `scripts/mapping.js`. `matchEntries` still has hard-coded fallbacks. Aliases are exported; lookup sets are not yet consumed at runtime.

| Table | Rows | Function |
|---|---:|---|
| `compendium_lookup_sets` | 1 | The set `pf2e-remaster-default`, status `active`. |
| `compendium_lookup_members` | 4 | Pack search order for four kinds only: `pf2e.feats-srd` (feat), `pf2e.classfeatures` (class), `pf2e.equipment-srd` (equipment), `pf2e.spells-srd` (spell). |
| `compendium_match_aliases` | 8,857 | Wanderer's Guide name to PF2e name. 8,855 `active`, 2 `proposed`. Columns include both slugs, strategy (`exact`, `canonical`, `semantic`, `grade-fallback`), priority, and evidence. |
| `compendium_match_rules` | 5 | Generic policy, one row each for type-map, semantic-suffix, confidence-gate, and grade-fallback (5 rows, 4 kinds). `payload` is JSON. |
| `match_catalog_snapshots` | 2 | Versioned exports of the active alias list. Both are PF2e 8.6.1. Row counts are 1,094 and 1,329. The Foundry module reads `data/match-catalog.json`, which is produced from this shape by `db/tools/export-match-catalog.mjs`. |

## PF2e compendium headers

Headers only. Descriptions, rules, and action text are not stored. Every catalog row has a Foundry document id and a GitHub link.

| Table | Rows | Function |
|---|---:|---|
| `pf2e_catalog_entries` | 29,631 | One header per PF2e document we match on: name, slug, level, traits, rarity, traditions, source book, pack label, Foundry id, source path, source URL. Unique on `(ruleset_id, compendium_collection, source_path)`. |
| `pf2e_bestiary_headers` | 2,302 | Size, HP, and AC for the first NPC load. The other 4,140 NPC rows in the catalog do not have these columns filled here. |
| `pf2e_class_keywords` | 2,969 | Class-scoped feat and feature names used as match keywords. Status is `active` or `retired`. |
| `pf2e_spell_keywords` | 1,294 | Spell name, slug, rank, and traditions for spell matching. All `active`. This is a narrower list than the 2,017 spells in the catalog. |
| `pf2e_book_wg_scope` | 209 | Whether a PF2e source book is in the Wanderer's Guide import scope. 63 `in-scope`, 143 `wg-book-absent`, 2 `wg-book-empty`, 1 `no-book-recorded`. |
| `mapping_domain_inventory` | 18 | A scoreboard of Wanderer's Guide table to PF2e collection: row counts, active match count, and status `active`, `queued`, or `excluded`. |

Catalog rows by kind:

| Kind | Rows | Kind | Rows |
|---|---:|---|---:|
| npc | 6,442 | action | 1,123 |
| feat | 6,527 | classfeature | 884 |
| equipment | 5,913 | background | 540 |
| effect | 2,982 | deity | 483 |
| spell | 2,017 | heritage | 334 |
| hazard | 1,231 | boon | 247 |
| adventureaction | 208 | character | 160 |
| campaignFeature | 115 | vehicle | 102 |
| familiarability | 117 | ancestryfeature | 55 |
| ancestry | 51 | condition | 44 |
| class | 29 | army | 22 |
| familiar | 5 | | |

`foundry_type` on rows loaded by the original seed is still the coarse kind (`equipment`) even when the file type is `weapon` or `armor`. Pack ids used by Foundry (`pf2e.feats-srd`) and source folders (`pf2e.feats`) are both present, depending on which load wrote the row.

## Wanderer's Guide snapshots

These are copies of the Wanderer's Guide rules database, not player characters.

| Table | Rows | Function |
|---|---:|---|
| `wg_keyword_snapshot` | 27,193 | Names and raw JSON used as the match input. `ability_block` 14,760, `item` 7,167, `spell` 2,731, `trait` 1,268, `background` 652, `archetype` 308, `versatile_heritage` 30, `ancestry` 114, `content_source` 103, `class` 60. |
| `wg_source_entity_snapshot` | 26,203 | A second capture of source entities, including tables the keyword snapshot does not have: `class_archetype` 19 and `language` 159. Item and spell counts differ slightly from the keyword snapshot (items 6,606, spells 2,708). |
| `wg_source_relationship_inventory` | 10 | Declared foreign keys between those source tables (item to content source, ancestry to trait, class archetype to class, and so on). |
| `wg_rule_objects` | 23,605 | Normalized rule-bearing rows: `ability_block` 14,231, `item` 6,606, `spell` 2,708, `class` 60. |
| `wg_rule_operations` | 15,982 | Operations inside those objects (`operation_type`, `operation_data`). |
| `wg_rule_select_options` | 2,443 | Options hanging off select operations. This is the choice list an import has to answer. |

## Wanderer's Guide to PF2e crosswalk

| Table | Rows | Function |
|---|---:|---|
| `wg_pf2e_catalog_matches` | 27,193 | One row per keyword-snapshot entity. Built by migration 028 from exact name and active aliases only. 15,228 `active` (exactly one catalog hit), 2 `ambiguous`, 11,963 `unresolved`. Rebuilding this table truncates it and does not match creatures. |
| `wg_pf2e_keyword_matches` | 5,126 | Class-keyword hits. 5,113 `active`, 13 `unresolved`. |
| `wg_pf2e_spell_matches` | 1,174 | Spell-keyword hits, all `active`. Matched on name and rank. |
| `wg_pf2e_name_proposals` | 1,373 | Rename proposals that are not approved aliases. 181 `proposed`, 1,192 `ambiguous`. |
| `wg_scope_proposals` | 1,194 | Proposed in-scope or out-of-scope decisions. All still `proposed`. |

## Character import runs

`deconstruct_test_pc(fixture_key)` deletes and rebuilds the `deconstruct` run for one fixture. It is defined in `db/migrations/005_create_pc_import_decomposition.sql`.

| Table | Rows | Function |
|---|---:|---|
| `test_pc_fixtures` | 24 | Immutable Wanderer's Guide v4 JSON. Keys are `tmp-char-80` through `tmp-char-107` (with gaps), `tmp-campaign-api`, and `tmp-safe-lifecycle`. |
| `pc_import_runs` | 48 | 24 `deconstruct` runs and 24 `evidence` runs, one pair per fixture. |
| `pc_sources` | 70 | Top-level `character.*` subtrees only. No `content.*` rows are stored. |
| `pc_selections` | 0 | Defined for `operation_data.selections`. The deconstruct function inserts them. The live table is empty. |
| `pc_items` | 0 | Defined for inventory and feat rows. Empty. |
| `pc_spells` | 0 | Defined for normal, focus, and innate spells. Empty. |
| `pc_dependencies` | 0 | Defined for prerequisite checks. Nothing has written a row. |
| `pc_import_decisions` | 0 | Defined for a human or evidence-backed choice. Empty. |
| `pc_foundry_plan` | 72 | Planned actions, all `apply_status = planned`. These are the source-review steps from the current deconstruct, not item grants. |
| `pc_validation_results` | 72 | Three checks on each of the 24 deconstruct runs. `raw-snapshot-present` pass, `source-decomposition` pass, `foundry-application` not-run. No check compares a character to the catalog. |
| `pc_import_logs` | 64 | Captured import logs. All 64 are `result_status = pass`. |
| `pc_import_log_highlights` | 33 | Facts pulled out of those logs: 14 unresolved, 7 gap, 6 warning, 6 choice. |

Unique key on validation is `(import_run_id, check_name)`. A new check is a new row on the same run, not a new table.
