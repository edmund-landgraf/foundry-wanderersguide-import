# Project Status and Tool/API Investigation Notes

Date: 2026-10-31 (America/Los_Angeles)
Repository: `edmund-landgraf/foundry-wanderersguide-import`
Scope: durable handoff for the investigation and PR triage on that date.

The sections below are the 2026-10-31 snapshot. They are not rewritten when later PRs merge. Later outcomes are appended at the bottom.

## Executive summary

The repository currently has 10 open pull requests. The active dependency chains are:

- `#91` (match policy from catalog) -> `#92` (ignore stale catalog versions).
- `#88` (shared item-type map) -> `#89` (structural status) -> `#90` (prompt/divine-font data).
- `#79` is the currently checked-out branch, `codex/seed-rule-registry`.

This note was created as a standalone documentation change from `main`; it does not alter the working branch for #79.

## What worked

- Git repository inspection worked: the checkout is on `codex/seed-rule-registry`, tracking `origin/codex/seed-rule-registry`.
- The configured GitHub remote resolved to `https://github.com/edmund-landgraf/foundry-wanderersguide-import.git`.
- GitHub PR search returned the open-PR inventory and dependency metadata.
- The local checkout contains the project docs, tests, migrations, generated catalog, and class-test logs needed for follow-up work.
- The repository is clean except for an untracked `backups/` directory; those files were preserved and not included in this documentation PR.

## What needs to be checked

Before merging the relevant implementation PRs:

1. Merge or retarget the match-catalog chain in order: #91, then #92.
2. Review the stacked refactor chain in order: #88, #89, then #90.
3. Review #84 only after its stated dependency on the registry migrations is satisfied; its description says the migrations were applied to a local DB only and not to the VPS.
4. Run the test plans written on #84, #91, and #92 rather than relying only on the historical PR descriptions.
5. Decide whether the docs-only class-test PRs (#80 and #83) are ready to merge.
6. Re-check #68, whose PR description says its local test run was still pending.
7. Review #79 against the current main branch before merging because the checked-out branch is ahead of the remote main history and other PRs may have moved.

## What did not work or remains unavailable

- The current chat context did not expose a complete historical transcript of every prior tool/API call, so this file records the calls and results available in this investigation rather than inventing missing history.
- The local `git remote -v` command produced no remote lines in this shell invocation, although `git config --get remote.origin.url` confirmed the GitHub remote URL.
- No live database migration, VPS migration, Foundry UI run, or external class-test rerun was performed in this investigation.
- The untracked `backups/` directory was not inspected or modified.

## Open PR inventory captured from GitHub

| PR | Title | Base <- head | Status |
|---:|---|---|---|
| #92 | Ignore a match catalog built for another PF2e version | `refac/catalog-match-rules <- refac/catalog-stale-version` | open; depends on #91 |
| #91 | Apply match policy from the catalog | `main <- refac/catalog-match-rules` | open; prerequisite for #92 |
| #90 | Phase 8: prompt/divine-font rule data out of code; unknown spell attribute is unresolved | `refac/p6-structural-status <- refac/p8-prompt-data` | open; stacked |
| #89 | Phase 6: report fist and WG level-slot placeholders as structural | `refac/p5-shared-type-map <- refac/p6-structural-status` | open; stacked |
| #88 | Phase 5: one shared kind-to-item-type map and formula pack order | `refac/p3-aliases-from-catalog <- refac/p5-shared-type-map` | open; stacked |
| #84 | DB: wgi_rules WG-to-PF2e 8.6.1 keyword matching fixes | `main <- db/wgi-rules-keyword-fixes` | open; dependency and deployment checks needed |
| #83 | Class test docs: Wizard and Rogue | `main <- docs/class-tests-wizard-rogue` | open; docs |
| #80 | Docs: Gunslinger and Monk class tests | `main <- docs/class-tests-gunslinger-monk` | open; docs |
| #79 | Seed terminology and class rule registry mappings | `main <- codex/seed-rule-registry` | open; current checkout |
| #68 | Fix coverage ledger for applied runtime choices | `main <- fix/67-coverage-ledger-applied-selections` | open; test status needs confirmation |

## Tool/API call log for this note

| Call | Result |
|---|---|
| `git status --short --branch` | Branch `codex/seed-rule-registry`; tracks `origin/codex/seed-rule-registry`; untracked `backups/`. |
| `git remote -v` | No lines returned by this shell invocation. |
| `git config --get remote.origin.url` | `https://github.com/edmund-landgraf/foundry-wanderersguide-import.git`. |
| `git branch -vv` / `git log --oneline --decorate -12` | Confirmed current branch and recent seed-rule-registry commits; local main is behind its origin tracking ref by 10 commits. |
| `rg --files` | Confirmed project source, tests, docs, migrations, seeds, fixtures, and generated catalog are present. |
| `Get-ChildItem -Recurse -File -Filter *PR*` | Found only backup/migration files whose names contain PR-like text; no local PR report file. |
| Codex artifact listing | No attached PRs or worktrees for this chat. |
| GitHub PR search: open PRs | Returned the 10 PRs listed above, including base/head and URLs. |
| GitHub PR search: recent closed PRs | Confirmed the repository has a history of merged/closed implementation and class-test PRs; no closed PR was changed. |

## Durable next step

Use this file as the handoff point. Leave the 2026-10-31 sections intact and append a dated note when a listed PR is merged, retargeted, tested, or superseded. Keep raw API output in the PR conversation or investigation transcript; keep this file focused on decisions, evidence, and remaining verification.

## Later status (2026-11-06)

Checked against GitHub and `main` at `1ca973d39db629ca8c960656522252228c8cf8c0`. The 2026-10-31 inventory above is unchanged.

Merged since the snapshot:

- #79, merged 2026-11-05 (`codex/seed-rule-registry`).
- #84, merged 2026-11-05 (`db/wgi-rules-keyword-fixes`, migrations 041–049).
- #91, merged 2026-11-06 (`dfed5a0`).
- #92, merged 2026-11-06 (`3f483e4`), after #91.
- #68, merged 2026-11-06 (`1ca973d`). Its 2026-10-31 note said the local test run was still pending; the merge followed a Node suite run on the updated branch.

Still open from that inventory: #88, #89, and #90 (same stack and bases), plus docs PRs #80 and #83. This note is #93.
