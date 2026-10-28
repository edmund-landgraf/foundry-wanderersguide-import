# WGI seeded PC database

This database is a deterministic, API-key-free staging area for testing the Wanderer's Guide → Foundry import pipeline.

It does not replace the raw WG export and it does not replace Foundry/PF2e's rules engine. It gives us a durable snapshot, a decomposed view of the source data, a prerequisite/decision surface, and an explicit Foundry plan that can be reviewed before anything is applied.

## Database

The current development database is PostgreSQL on VPS-UNWH:

```text
database: wgi_rules
schema:   public
```

The database is separate from the proposal-manager database. PostgreSQL is containerized in `my-postgres` and is bound to localhost on the host. The Foundry module must not connect directly to PostgreSQL; a future read-only service/API should expose selected snapshots or plans.

## Source and projections

`test_pc_fixtures` stores the complete sanitized WG v4 JSON export as immutable `jsonb`. The eight current fixtures are PCs 63, 64, 66, 71, 72, 74, 76, and 78.

`test_pc_summary` is a convenience view over the raw snapshot. It exposes the WG ID, name, class, ancestry, level, and export version.

`deconstruct_test_pc(fixture_key)` rebuilds the normalized projection for one fixture. It creates one `pc_import_runs` row and populates:

- `pc_sources`: character/content source paths and raw subtrees.
- `pc_selections`: every `operation_data.selections` key and WG answer.
- `pc_items`: inventory and feat/feature records.
- `pc_spells`: normal, focus, and innate spell records when present in the export shape.
- `pc_dependencies`: prerequisite rows; currently reserved for the rules-check phase.
- `pc_import_decisions`: explicit user or evidence-backed decisions; initially empty.
- `pc_foundry_plan`: reviewable source and selection actions; initially `planned`.
- `pc_validation_results`: decomposition checks and the not-yet-run Foundry application check.

The raw snapshot is retained so the projection can be rebuilt after a parser or schema change.

## Tables

```text
test_pc_fixtures       immutable raw WG snapshots
pc_import_runs         one deconstruction/planning run per fixture
pc_sources             source-path inventory
pc_selections          WG choices and resolution state
pc_items               item/feature inventory and PF2e match state
pc_spells              spell inventory and spell-entry target state
pc_dependencies        prerequisite and grant checks
pc_import_decisions    explicit review/evidence decisions
pc_foundry_plan        ordered actions eligible for later Foundry application
pc_validation_results  expected/actual checks
pc_import_logs         best-summary rows plus references to external log files
pc_import_log_highlights concise metrics, choices, warnings, gaps, and validation facts
```

## Rebuild a fixture

From the PostgreSQL container:

```sql
SELECT deconstruct_test_pc('63');
```

The function deletes and rebuilds only the `deconstruct` run for that fixture. It does not modify the raw fixture. Rebuilding is therefore safe for test data, but later applied Foundry runs must retain their own audit records before a run is replaced.

## Intended import flow

1. Load or select an immutable WG JSON snapshot.
2. Create a `pc_import_runs` row.
3. Deconstruct the snapshot into source paths, selections, items, spells, and dependencies.
4. Apply the class/rule registry to produce matches, candidate targets, and prerequisite results.
5. Record every unresolved choice or unsupported mechanic with a reason and evidence reference.
6. Build `pc_foundry_plan` in dependency order.
7. Review the plan and decisions.
8. Apply the plan through the existing safe Foundry writer, including snapshot/rollback behavior.
9. Store validation results after Foundry evaluates PF2e rules.

The database can decide that an action is eligible for review; Foundry remains the final authority for PF2e ChoiceSets, GrantItems, prerequisites, derived values, and rule activation.

## Assumptions and prerequisites

- Exports are sanitized WG v4 JSON and contain no API keys or secrets.
- A raw export is immutable for a given fixture key; a changed export should receive a new fixture key or source hash.
- The ruleset is initially `pf2e-remaster`.
- Normalized projections are rebuildable and may evolve independently of the raw snapshot.
- A future API/service will enforce read-only access for Foundry and must never expose PostgreSQL credentials to the browser.
- The current deconstructor handles the known fixture shapes; new WG export shapes must add fixtures and projection tests.

## Current gaps

- The normalized tables are populated, but the runtime importer does not read them yet.
- `deconstruct_test_pc` resolves names, marks grant provenance, and writes a batched plan. Compendium UUID matching and user decisions are still separate.
- PF2e compendium matching and ChoiceSet legality still happen in the existing Foundry-side code.
- Foundry application, rollback, and post-application parity remain separate from database deconstruction.
- The WG export can omit or fail to refresh changes; the database cannot recover data absent from the snapshot.
- Nested choices without a PF2e target remain unresolved until class-specific evidence and registry rules exist.

## Migration files

- `001_create_wgi_rules_registry.sql`: registry tables.
- `002_seed_pf2e_remaster_classes.sql`: 29 class rows.
- `003_seed_runtime_rule_catalog.sql`: mirror of current hard-coded rule payloads.
- `004_create_test_pc_fixtures.sql`: raw fixture table and summary view.
- `005_create_pc_import_decomposition.sql`: normalized import tables and deconstructor.
- `006_create_compendium_match_registry.sql`: ordered compendium lookup and alias registry.
- `007_create_import_log_summary.sql`: best-log summaries and external-file references.
- `008_create_import_gap_rollup.sql`: best-log gaps, unresolved choices, and warnings by character and feature.
- `009_class_rename_and_plan_batches.sql`: class-scoped renames, grant provenance, and dependency batches.
- `010_seed_registry_lookup_rows.sql`: class identity lookups, shared selection policies, proposed spell-source rows, and narrow registry coverage cases.

## Rename and plan functions

`resolve_source_name(ruleset_id, class_id, item_kind, source_name)` returns one lookup candidate. A class alias wins over a global alias. Otherwise it tries a grade swap, then a semantic role suffix, then the exact name. `resolve_run_item_names` stores that candidate on `pc_items` and `pc_spells`. `match_status` becomes `renamed` only for an alias, grade swap, or semantic suffix. An exact name stays `unmatched` until a compendium index exists.

`apply_grant_provenance` marks a child `grant-child` or `rules-selection` when an active `grant_rules` row cites `GrantItem`, `itemGrants`, or `rulesSelections`. Those rows are not second creates.

`build_foundry_plan` replaces `pc_foundry_plan` for the run. Batch 1 is ancestry, background, class, and heritages. Batch 2 is inventory that is still a source item. Batch 3 is other source feats and features. Batch 4 is `link-grant` after the parent. Batch 5 is spells. A row is `create` only when the name was renamed or it is an ABC item. Unmatched and ambiguous rows are `review` with `prerequisite_status = blocked`.

A larger rename list can be loaded into `compendium_match_aliases` with `class_id` set and `status = proposed` until a WG fixture confirms it. `evidence_ref` should name the Pathmuncher source and the confirming fixture. Unverified Pathbuilder strings are not activated.

## Log retention

`pc_import_logs` intentionally stores only a summary and metadata for a log
file: its path or URI, SHA-256, byte count, MIME type, result, and quality
score. The raw JSON, screenshots, and full text remain where the test driver
already writes them. `record_pc_import_log` marks the new candidate as the
best row for its import run and log kind, while retaining the previous row as
an auditable superseded reference. `pc_import_log_highlights` stores concise
facts such as matched counts, unresolved choices, warnings, and parity results.
