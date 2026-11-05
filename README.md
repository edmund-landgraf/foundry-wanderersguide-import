# Wanderer's Guide Import (Foundry VTT, PF2e)

Imports Pathfinder 2e player characters from Wanderer's Guide (WGUI) into the current Foundry world. The module is experimental: every class is still marked experimental, and the import report always tells you what did not come across.

| | |
|---|---|
| Module id | `foundry-wanderersguide-import` |
| Version | 0.1.2 |
| Foundry | minimum 12, verified 14 (build 369) |
| System | `pf2e`, minimum 6.0.0, verified 8.6.1 |
| Tests | `npm test` (Node built-in test runner, 94 tests passing as of 2026-11-01) |

## Install

Foundry → Add-on Modules → Install Module → Manifest URL:

```
https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/module.json
```

For development, link the repo into `<Foundry Data>/modules/foundry-wanderersguide-import` (Windows: `mklink /J`). Enable the module in a PF2e world.

### Other manifests hosted here

`manifests/` publishes update manifests for related Foundry modules so Foundry can check them for updates:

| Manifest | Module |
|---|---|
| `manifests/amba-bridge.json` | AMBA Bridge: receives scenes, actors, tokens, journals and map pins published from Adventure Maker By Act (AMBA) |
| `manifests/foundry-pf2-import.json` | PF2 import helper |
| `manifests/green-fvtt.json` | Green VTT UI theme |
| `manifests/sheet-theme-green.json` | Green PF2e sheet theme |

Manifest URLs follow the pattern `https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/<file>.json`.

## Settings

Foundry → Configure Settings → Wanderer's Guide Import. All settings are **client** settings, stored only in your browser.

| Setting | Purpose |
|---|---|
| **API Key** | Key of a Wanderer's Guide API client (Account → API Clients). Never logged. |
| **WG server** | **Production** (default, `https://amba.wandersguide.site/functions/v1`) or **Custom**. |
| **Custom server URL** | Used when WG server is Custom (local dev default `http://127.0.0.1:8000/functions/v1`). A URL saved by an older build is kept and switched to Custom. |

The old Auth URL / client id settings are hidden and unused; the server scopes everything by API key.

### API key setup

1. In Wanderer's Guide, open account settings and create an API client. Copy its key.
2. On each character you want to import, grant that API client access.
3. Paste the key into **API Key** in the module settings.

## Use

Actors sidebar → **Import from Wanderer's Guide** → tick characters → **Import selected**.

- Imports are planned and shown for review before anything is written; Cancel changes nothing.
- Re-importing the same WG character updates the same actor (flags `wgId` + host) and keeps current HP, temporary HP, prepared spells and spell-slot usage where the spellcasting entry still exists.
- Replacements are created before old items are removed; a failure restores the pre-import snapshot (or keeps a "(WG backup)" actor).
- Each import whispers you a miss/parity report with a coverage ledger (mapped / included / unresolved / leftover-preserved / dropped per source path).

## What works / what doesn't yet

**Implemented (experimental):** character list, one-at-a-time JSON v4 export with 429 backoff, actor create/update by flags, compendium matching (slug, match-catalog aliases, then an unambiguous name or name+level) for ancestry, heritage, background, class, feats, spells and equipment; ChoiceSet hints; dependency-ordered GrantItem/ChoiceSet evaluation; runtime-grant reconciliation; rune/material parsing; spellcasting entries; WG custom items in a "Wanderer's Guide Homebrew" folder; optional dry-run diff and parity reporting; campaign selection and optional campaign art; level, languages, attributes and HP reconciliation.

**Match catalog:** alias matching comes from a generated `data/match-catalog.json` (git-ignored, built from the rules database; see [db/README.md](db/README.md#match-catalog-export)). Without it, imports still run on exact names only and alias-dependent misses are reported as unresolved ("match catalog not loaded").

**Known limitations:** no Foundry-world integration test suite; parity covers a subset of the PF2e sheet; skills, saves, AC, perception, currency and several derived/proficiency fields are not yet forced from WG; campaign visibility can exceed exportability when WG has not granted the API client access to a PC. Class status: [docs/CLASS_COVERAGE.md](docs/CLASS_COVERAGE.md).

## Wanderer's Guide functions used

POST `<server>/<function>` with `Authorization: Bearer <API key>`:

- `wgui-ext-list-key-characters`: characters the key can read.
- `wgui-ext-find-key-campaigns`: campaign names for the Campaign column.
- `wgui-export-character`: the JSON v4 export used for the import.

Errors such as `INVALID_API_KEY`, `CAMPAIGN_FORBIDDEN` and `CAMPAIGN_ID_INVALID` show as plain notifications. These functions must be deployed on the selected WG server.

## Relationship to AMBA and WGUI

- **WGUI (Wanderer's Guide)** is the source of truth for PCs. This module only reads from it; it never writes characters back.
- **AMBA (Adventure Maker By Act)** builds adventures (scenes, maps, encounters). It publishes to Foundry through the separate **AMBA Bridge** module, whose manifest is hosted in this repo. AMBA also pushes encounters to WGUI. PC import from WGUI into Foundry stays in this module.

## Databases

See [Databases and row counts](#databases-and-row-counts) below and [db/README.md](db/README.md).

## Development

```
npm install   # no runtime dependencies; Node 20+ recommended
npm test
npm run golden:update   # regenerate golden PC outputs after an intended mapping change
```

Tests cover mapping, golden PC fixtures (`test/fixtures/pcs`, `test/golden`), safe apply/rollback, selections, spells, formulas and custom items. Design notes live in [docs/](docs/) (plan, AMBA reuse plan, class rule registry, compendium match registry, import gaps, resolved/unresolved choices, per-class test notes).

## Databases and row counts

The module itself never connects to a database. Two PostgreSQL databases support it at development time. Row counts below are exact `count(*)` results taken inside a `READ ONLY` transaction on the development copies on **2026-11-01 at 1:59 PM Pacific (PST)**. Production copies were not measured and may differ.

### 1. `wgi_rules`: import rules and test staging

Built by `db/migrations/`. Holds the class/rule registry, the WG ↔ PF2e matching catalog, and deterministic, sanitized test PC snapshots. Its main runtime output is `data/match-catalog.json`, which the module loads.

**Rule registry**

| Table | Rows | Purpose / key columns |
|---|---:|---|
| `rulesets` | 1 | Ruleset (`pf2e-remaster`) and supported system versions. |
| `classes` | 29 | One row per PF2e class: `pf2e_slug`, `support_status`. |
| `class_sources` | 58 | How a class's WG content maps to PF2e (`wg_key_pattern`, `pf2e_slug`, `match_strategy`). |
| `selection_rules` | 8 | Class choice rules: which WG selection fills which PF2e target, and the unresolved policy. |
| `grant_rules` | 1,089 | Parent → child grants (GrantItem etc.) and dedupe policy, so granted items are not created twice. |
| `spellcasting_rules` | 29 | Spellcasting entry kind, tradition, ability and slot policy per class. |
| `coverage_cases` | 29 | Expected import status per class/fixture source path. |
| `rule_definitions` | 30 | Mirror of rule payloads that are still hard-coded in `scripts/`. |

**Compendium matching**

| Table | Rows | Purpose / key columns |
|---|---:|---|
| `compendium_lookup_sets` | 1 | Named ordered set of PF2e compendiums to search. |
| `compendium_lookup_members` | 4 | Compendium packs in a lookup set, with priority. |
| `compendium_match_aliases` | 8,857 | Curated WG name → PF2e name/slug aliases (`status`, `priority`, `class_id`, `evidence_ref`). Exported to the match catalog. |
| `compendium_match_rules` | 5 | Generic match rules (grade swap, suffix, etc.). |
| `wg_name_rename_rules` | 6 | Pattern renames applied to WG names before matching. |
| `match_catalog_snapshots` | 2 | Versioned exports of the match catalog (`pf2e_version`, `checksum`, `row_count`, `payload`). |
| `mapping_domain_inventory` | 18 | Per content domain: WG table, PF2e collection, row counts and active matches. |

**PF2e catalog (from Foundry PF2e 8.6.1 compendiums)**

| Table | Rows | Purpose / key columns |
|---|---:|---|
| `pf2e_catalog_entries` | 29,631 | Every PF2e compendium entry: `item_kind`, `pf2e_name`, `pf2e_slug`, `compendium_collection`, `level`, `traits`, `rarity`. |
| `pf2e_bestiary_headers` | 6,442 | Creature headers (size, HP, AC, rarity) for bestiary entries. |
| `pf2e_class_keywords` | 2,969 | Class-scoped PF2e features/feats used for class matching. |
| `pf2e_spell_keywords` | 1,294 | PF2e spells with rank and traditions. |
| `pf2e_book_wg_scope` | 209 | Which PF2e source books are in scope for WG content. |

**WG content snapshot and matches**

| Table | Rows | Purpose / key columns |
|---|---:|---|
| `wg_source_entity_snapshot` | 26,203 | Snapshot of WG content rows (`source_table`, `wg_id`, `wg_name`, `row_data`) with source ref. |
| `wg_keyword_snapshot` | 27,193 | WG names/keywords used for matching. |
| `wg_source_relationship_inventory` | 10 | Documented foreign-key relationships between WG content tables. |
| `wg_rule_objects` | 23,605 | WG content objects that carry rule operations. |
| `wg_rule_operations` | 15,982 | Individual WG operations (`operation_type`, `operation_data`). |
| `wg_rule_select_options` | 2,443 | Options inside WG select operations. |
| `wg_pf2e_catalog_matches` | 27,193 | WG → PF2e catalog match per WG row (`match_strategy`, `status`, `candidate_count`). Differing names are exported to the match catalog. |
| `wg_pf2e_keyword_matches` | 5,126 | WG → PF2e class keyword matches. |
| `wg_pf2e_spell_matches` | 1,174 | WG → PF2e spell matches. |
| `wg_pf2e_name_proposals` | 1,373 | Proposed name matches awaiting review. |
| `wg_scope_proposals` | 1,194 | Proposed in/out-of-scope decisions for WG rows. |

**Test PC staging and import logs**

| Table | Rows | Purpose / key columns |
|---|---:|---|
| `test_pc_fixtures` | 24 | Immutable sanitized WG v4 exports (`fixture_key`, `wg_export` jsonb, `source_sha256`). |
| `pc_import_runs` | 48 | One deconstruction/planning run per fixture. |
| `pc_sources` | 70 | Source-path inventory per run. |
| `pc_selections` | 0 | WG choices and resolution state. |
| `pc_items` | 0 | Item/feature inventory and match state. |
| `pc_spells` | 0 | Spell inventory and spell-entry target. |
| `pc_dependencies` | 0 | Prerequisite and grant checks (reserved). |
| `pc_import_decisions` | 0 | Explicit review/evidence decisions. |
| `pc_foundry_plan` | 72 | Ordered, batched actions eligible for Foundry application. |
| `pc_validation_results` | 72 | Expected/actual checks. |
| `pc_import_logs` | 64 | Best-log summaries with references (path, SHA-256, size) to external log files. |
| `pc_import_log_highlights` | 33 | Concise facts per log: counts, unresolved choices, warnings, parity. |

Views (no stored rows): `test_pc_summary`, `pc_best_import_logs`, `pc_import_gap_rollup`, `pf2e_unmatched_entries`, `wg_pf2e_unresolved`.

### 2. Wanderer's Guide database (WGUI)

The self-hosted Wanderer's Guide backend (Supabase/PostgreSQL). The module reaches it only through the `wgui-ext` / `wgui-export-character` functions above, never directly. Counts are from the development copy, `public` schema.

| Table | Rows | Purpose / how the import uses it |
|---|---:|---|
| `character` | 58 | Player characters; the source of every import (via the export function). |
| `campaign` | 20 | Campaigns; names shown in the Campaign column. |
| `campaign_join_grant` | 7 | Campaign membership grants. |
| `public_user` | 33 | WG user profiles. |
| `encounter` | 30 | GM encounters (AMBA pushes these; not used by this module). |
| `content_source` | 106 | Rulebooks/content sources. |
| `ability_block` | 14,760 | Feats, features, actions, class features, heritages etc. |
| `ancestry` | 114 | Ancestries. |
| `versatile_heritage` | 30 | Versatile heritages. |
| `background` | 652 | Backgrounds. |
| `class` | 59 | Classes. |
| `class_archetype` | 18 | Class archetypes. |
| `archetype` | 308 | Archetypes. |
| `item` | 7,164 | Equipment. |
| `spell` | 2,730 | Spells. |
| `trait` | 1,268 | Traits. |
| `language` | 166 | Languages. |
| `creature` | 1,591 | Creatures (encounters, not PC import). |
| `syndicated_nodes` | 5 | Federated content nodes. |
| `admin_audit_log` | 27 | Admin action log. |
| `content_update` | 0 | Pending community content updates. |
| `edge_work_budget` | 0 | Function work budget bookkeeping. |
| `creature_image_url_backup_20261023` | 334 | One-off backup of creature image URLs (maintenance). |

Not measured: the production copies of both databases, and non-`public` schemas (auth, storage) of the WG database.

## Changelog

- **Current main**: match catalog is generated from `wgi_rules` (migration 033) into a git-ignored `data/match-catalog.json` and loaded at runtime; hard-coded WG alias table removed; class-scoped renames and batched plans (migration 009); update manifests published for AMBA Bridge, PF2 import, Green VTT and the green sheet theme.
- **0.1.0**: first release; API-key-only auth via `wgui-ext` functions, WG server picker (Production / Custom), planned and reversible imports, coverage ledger and parity report.

## Credits

Formula matching (rename table, grade swap, pack order) is adapted from [Pathmuncher](https://github.com/MrPrimate/pathmuncher) by Jack Holloway, MIT License, Copyright (c) 2023 Jack Holloway. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).