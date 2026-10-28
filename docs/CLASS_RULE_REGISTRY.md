# Class rule registry design

Status: design and discovery only. This document is the input to the later implementation PR that will move class-specific heuristics out of runtime code.

## Scope

The current PF2e remaster class matrix has 29 class rows:

Alchemist, Animist, Barbarian, Bard, Champion, Cleric, Commander, Druid, Exemplar, Fighter, Guardian, Gunslinger, Inventor, Investigator, Kineticist, Magus, Monk, Necromancer, Oracle, Psychic, Ranger, Rogue, Runesmith, Sorcerer, Summoner, Swashbuckler, Thaumaturge, Witch, and Wizard.

The registry is not a claim that these classes are supported. Each class remains experimental until WG-specific evidence and Foundry validation exist.

## Hard-code audit

The current class and choice behavior is distributed across these areas:

| Runtime area | Current hard-coded behavior | Registry destination |
| --- | --- | --- |
| `scripts/selections.js` | WG selection-key parsing, scope shapes, nested-key handling, `ATTRIBUTE_*` and `SKILL_*` classifications, language special case, and evidence categories | `selection_rules`, `selection_evidence` |
| `scripts/coverage.js` | derived/library/metadata field sets, expanded content keys, selection statuses and reasons | `coverage_rules`, with generic status handling retained in code |
| `scripts/mapping.js` | class/ancestry/background/feat grouping, attribute aliases, spell-source/entry conventions, item matching assumptions | `class_sources`, `choice_rules`, `spellcasting_rules` |
| `scripts/importer.js` | item application order, supported PF2e item types, ChoiceSet prefill policy, GrantItem traversal, dedupe ownership rules, and spell-entry handling | `class_rules`, `grant_rules`, `choice_rules`, `spellcasting_rules` |
| `docs/CLASS_COVERAGE.md` | per-class priorities, conversion targets, evidence and acceptance expectations | `classes`, `class_evidence`, `coverage_cases` |

Generic safety behavior must stay in code: plan-before-write, cancellation, snapshot/rollback, legal-choice validation, and explicit-grant ownership. The registry supplies data and policy inputs; it must not become an escape hatch for arbitrary executable code.

## Proposed normalized tables

### `rulesets`

One row per ruleset/version family.

| Column | Meaning |
| --- | --- |
| `ruleset_id` | Stable key, initially `pf2e-remaster` |
| `system_id` | Foundry system identifier, initially `pf2e` |
| `min_version`, `max_version` | Compatibility bounds |
| `status` | active, experimental, retired |

### `classes`

The base table with one row for each of the 29 classes.

| Column | Meaning |
| --- | --- |
| `class_id` | Stable slug, not a display name |
| `ruleset_id` | FK to `rulesets` |
| `name` | Display name |
| `priority` | P0/P1 investigation priority |
| `support_status` | experimental, partial, verified |
| `pf2e_slug` | Expected PF2e class slug |
| `notes` | Short human-readable boundary |

### `class_sources`

Maps source concepts to PF2e documents without embedding IDs throughout the importer.

| Column | Meaning |
| --- | --- |
| `class_id` | FK to `classes` |
| `source_kind` | class, feature, feat, spell, companion, resource |
| `wg_content_id` | WG identifier when stable |
| `wg_scope`, `wg_key_pattern` | Selection/source scope |
| `pf2e_uuid`, `pf2e_slug` | PF2e target evidence |
| `match_strategy` | id, slug, exact-name, name-level, manual |
| `status` | proposed, evidence-needed, active, retired |

### `selection_rules`

Declarative rules for interpreting a WG selection.

| Column | Meaning |
| --- | --- |
| `class_id` | Nullable for shared rules |
| `source_pattern` | Exact or constrained WG source-path/key pattern |
| `owner_pattern` | Owning feature/class concept |
| `selection_kind` | choice, attribute, skill, language, grant, nested |
| `target_kind` | ChoiceSet, system field, item, spell entry, none |
| `legal_match` | exact-id, exact-slug, exact-label, evidence-only |
| `unresolved_policy` | prompt, preserve, explicit-exception |
| `priority` | Deterministic precedence |
| `status` | proposed, active, retired |

### `grant_rules`

PF2e grant and dedupe relationships.

| Column | Meaning |
| --- | --- |
| `class_id` | Nullable for shared PF2e rules |
| `parent_source_pattern` | Source feature that grants |
| `child_source_pattern` | Granted item/action/feat |
| `ownership_evidence` | GrantItem, itemGrants, rulesSelections, location |
| `dedupe_policy` | keep-grant, keep-source, never-dedupe |
| `choice_policy` | inherit, resolve-child, leave-prompt |

### `spellcasting_rules`

Class-specific spell entry and resource conventions.

| Column | Meaning |
| --- | --- |
| `class_id` | FK to `classes` |
| `source_pattern` | WG source/casting key |
| `entry_kind` | prepared, spontaneous, focus, innate |
| `tradition`, `ability` | Expected values or evidence mappings |
| `slot_policy` | source-slots, PF2e-derived, explicit-exception |
| `status` | proposed, active, retired |

### `coverage_cases`

Evidence and regression inventory, including cases that cannot yet be represented.

| Column | Meaning |
| --- | --- |
| `case_id` | Stable case key |
| `class_id` | FK to `classes` |
| `fixture_id` | Sanitized WG fixture |
| `source_path` | Exact export path |
| `expected_status` | mapped, included, unresolved, preserved, dropped |
| `reason_code` | Stable exception category |
| `evidence_ref` | WG/PF2e evidence or issue reference |
| `last_verified` | Date/version of verification |

## Relationship shape

`rulesets 1—N classes`. A class has many sources, selection rules, grant rules, spellcasting rules, and coverage cases. Shared rules use a nullable `class_id` plus explicit precedence; class-specific rows override shared rows only when their evidence is stronger and their priority is deterministic.

## Storage decision

The schema is relational even if the first runtime representation is packaged JSON or a Foundry-compatible static data module. The implementation PR should choose the smallest deployable storage format, preserve stable IDs, validate the tables at load time, and keep the data separable from executable code. A database migration is only justified if runtime authoring or user-installed rule packs is required.

## Implementation constraints for the next PR

1. Add schema validation and reject duplicate or ambiguous rule precedence before import.
2. Load the registry once per import and pass a registry context into mapping, coverage, and importer functions.
3. Replace one heuristic family at a time, beginning with unresolved-choice classification.
4. Keep generic safety invariants in code.
5. Require a fixture and a coverage assertion for every active class-specific rule.
6. Preserve an explicit exception row when a case cannot be represented; never convert an unresolved case into a guess.
