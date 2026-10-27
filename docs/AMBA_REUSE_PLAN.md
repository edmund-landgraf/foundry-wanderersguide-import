# WG v4 to Foundry PF2e: AMBA reuse plan

Status: implementation plan, 2026-10-27. The module currently imports many core items, spells, gear, currency, and hero points. This document describes the remaining functional work. It is not a claim that the class scenarios below already pass in Foundry.

## Goal and governing decision

Use AMBA's existing Wanderer's Guide (WG) export interpretation as the canonical source reader. Preserve its tested conversion methods and `wg-friendly/v1` data shape wherever possible. Add a Foundry PF2e adapter after that reader. Do not maintain a second independent interpretation of WG operation keys, compiled feat groups, calculated statistics, or composed item names in `scripts/mapping.js`.

The source snapshot reviewed for this plan is local `D:\repos\AdventureMakerByAct` at commit `3a4ba8220d754f68941dac4bfa74a4ffcd7d2659`. AMBA is a separate checkout and remains untouched by this plan. Before copying code into the published module, verify the redistribution terms and record the source commit and notices in the copied directory. Preserve upstream method names and tests where practical so later AMBA fixes can be compared and brought forward.

```text
WG JSON v4
  -> AMBA unwrap/convert/harvest/leftover methods
  -> wg-friendly/v1 + raw WG selection ledger + source evidence
  -> Foundry content resolver and class-specific choice mapping
  -> complete, previewable actor plan
  -> staged PF2e application
  -> parity, unresolved-choice, and leftover report
```

The WG-friendly object is an interpretation, not a replacement for raw export evidence. Retain source WG IDs, full `operation_data.selections` keys, compiled content, and source paths alongside each resolved entry. This prevents a class feature from being lost merely because a display name or category changes.

## 1. What to preserve from AMBA

The paths in this table are relative to `D:\repos\AdventureMakerByAct\src\shared\wanderersGuideExport`.

| AMBA source | Methods/data to preserve | Foundry use | Adaptation boundary |
| --- | --- | --- | --- |
| `wgFriendly/fromWgCharacterExport.ts` | `unwrapWgCharacterExport`, `summarizeWgCharacterExport`, `wgExportToFriendlyCharacter`, async variant, compiled feat/spell/language/stat extraction | Canonical WG v4 decoder and normalized model | Keep parser logic; extend output with provenance where needed. Do not use sheet HTML as a Foundry intermediate. |
| `wgFriendly/types.ts` | `WgFriendlyCharacter`, refs, selection scopes and full `selectionKey` | Shared contract between decoder and PF2e adapter | Add import-only metadata in an adjacent type rather than altering AMBA's core contract gratuitously. |
| `wgFriendly/harvestSelectionsForImport.ts` | `classifyNumericSelection`, `promoteSelectionsIntoFriendlyDoc` | Promote selected heritage, feats, spells and languages hidden in operation selections | Preserve ambiguous numeric values in an unresolved ledger; do not force them into feat slots by guess. |
| `wgFriendly/buildSelections.ts` | `wgSelectionKey`, `scopeFromSelectionKey`, `effectiveSelectionScope`, `buildSelectionsRecord` | Stable WG scope/owner/operation identity | Use these keys to locate WG answers, then translate to PF2e `ChoiceSet` selections; WG keys are not PF2e flags. |
| `wgFriendly/applyCalculatedStats.ts` | `readCalculatedStats`, skills/proficiencies, notes and ability extraction | Expected values and fallback evidence for parity | Separate rank from final modifier. A total bonus alone is not a safe PF2e proficiency rank. |
| `wgFriendly/selections/wgOperations.ts` and `simulateWgOperations.ts` | Operation flattening, conditional evaluation and nested selection context | Resolve nested choices on class features and ancestry features | Bring their dependency closure, but invoke simulation only where export data does not already state the answer. |
| `wgFriendly/collectWgImportLeftover.ts` and `slimWgExport.ts` | Source preservation, pruning and leftover formatting | Starting point for a Foundry coverage report | Its predefined mapped-key list describes AMBA's sheet importer, not Foundry consumption. Retain source-preservation helpers, but derive Foundry coverage from actual source-path outcomes. Replace sheet/HTML parking with an import report or private actor flag. |
| `composedItemName.ts` | `parseComposedItemName`, `splitItemPotency`, `itemLookupNames` | Find base equipment and separate runes/materials | Reuse parsing; map its result to the verified PF2e item schema. |
| `classDefaultSkills.ts` | Class skill defaults | Diagnostic fallback when WG omits a grant | Treat inferred values as review items, never as source truth. |
| `assignSheetFeatLevels.ts` | Feat progression level assignment | Reference for missing feat-level fallback | It imports sheet-specific progression code; extract or adapt its pure decision logic only after checking WG's explicit levels. |
| `contentResolver.ts`, `categoryFallback.ts`, `searchData.ts` | Ranked resolution, category fallback, unresolved outcomes | Design and scoring reference for compendium matching | These call WG find endpoints. Foundry needs a separate resolver over PF2e compendium indexes with the same result/evidence shape. |
| `wgFriendly/wgImportCompleteness.ts` | Mapped/leftover/dropped report shape | Import completeness report | Its current function parses AMBA sheet HTML and `WgImportResult` and relies on static mapped keys. Preserve the report concepts, but replace the coverage algorithm with a per-source-path consumption audit. |
| `wgFriendly/completeImportedSheet.ts`, `wgFriendlyToSheetData.ts`, `wgImportToSheet.ts` | Sheet-oriented presentation/fallback | Test oracle and examples | Keep in AMBA; do not ship sheet rendering and HTML dependencies in the Foundry module. |
| `buildCharacter.ts`, `wgFriendly/toCharacterPayload.ts`, `wgFriendly/stagedExport.ts` | Reverse direction: constructing WG operations and staged payloads | Contract examples for selection semantics and expected outcomes | Do not execute this reverse exporter during Foundry import. Port a tested helper only when the importer needs it. |

AMBA's converter has a real dependency graph: `fromWgCharacterExport.ts` imports selection helpers, stat extraction, slim export, chunking and types; harvesting imports spell-source and section-ID helpers. Copy the minimum transitive, browser-safe closure under `src/amba-wg/`, keeping source filenames and comments. Type-only imports may be bundled away. The plan includes a small build step that compiles that TypeScript to one ESM bundle for Foundry; `module.json` points to the built entry and the package contains that output. Keep existing Node tests for pure mapping functions while migrating callers. Record the exact copied file list and AMBA commit in `src/amba-wg/UPSTREAM.md`.

## 2. Current importer integration

Current entry points are `scripts/api.js` (WG export), `scripts/mapping.js` (`buildPlan`, matching, choice hints, runes, spells, diff and parity), `scripts/importer.js` (Foundry actor mutation), and `scripts/dialog.js` (UI). Keep API-key, campaign list and dialog behavior. Replace `buildPlan(exp)` internally in two steps:

1. `decodeWgExport(exp)` calls preserved AMBA conversion and returns `{ friendly, rawSelections, leftover, warnings, provenance }`. Validate v4 shape and retain explicit missing/invalid fields.
2. `buildFoundryPlan(decoded, compendiumIndex, worldSettings)` creates the same actor-plan shape currently consumed by the dialog/importer, extended with selection resolutions, class configuration, companions, and a per-entry status ledger.

Keep a temporary `buildPlan(exp)` facade so current tests and preview behavior remain intact during migration. Remove duplicate WG parsing in `scripts/mapping.js` only after differential tests show that all current fixture fields remain present. Keep `diffPlan`, `parityCheck`, `captureRuntimeState`, and `summarizeActor` as separate responsibilities; expand their coverage rather than replacing them wholesale.

`matchEntries` becomes a Foundry resolver with ordered evidence: explicit WG-content-ID mapping (when maintained), exact type/slug, explicit alias and class context, exact name with level/source, then reviewable fuzzy candidates. A low-confidence match requires a user choice. If no class, ancestry, heritage or background is found, offer an explicit typed choice from the configured compendiums or world items; cancellation leaves the actor untouched, and skipping the core item is reported as a blocking or degraded import decision. Remember a chosen replacement by source identity and verify it still exists on re-import. Maintain a versioned alias table for remaster/legacy names. Cache compendium indexes per import and allow configured extra packs.

## 3. Selection and rule-element mapping

Store each answer as `{ wgSelectionKey, scope, ownerWgId, operationId, rawValue, displayedValue, chosenContentId, sourcePath }`. Keep the exact WG key to distinguish nested choices that share labels; do not assume it survives rebuilding or retraining a WG feature. A mapping record connects that answer to `{ itemSourceId, ruleIndex, ruleFlag, pf2eValue, confidence }`; it must be validated against the actual `ChoiceSet` options on the resolved PF2e item. Treat `ruleIndex` as diagnostic evidence, not a persistent identity, because item rules can be reordered.

Resolution order:

1. Match source item by WG ID and resolved compendium UUID, including granted items.
2. Identify the relevant `ChoiceSet` by a stable PF2e rule flag or explicit adapter mapping. Match by rule label only when unambiguous.
3. Map WG selected content ID/variable/name to a legal PF2e option value or UUID.
4. Preselect before item creation where the verified PF2e API supports it; otherwise create in the controlled stage, then set `flags.pf2e.rulesSelections` on the owning item and reevaluate. Check the resulting actor state.
5. Mark the source answer `chosen` or `unresolved` with reason and candidate list. Never suppress a prompt by selecting an arbitrary first option.

PF2e `GrantItem` and `ChoiceSet` internals change with system versions. Isolate their calls in one version-checked adapter, following Pathmuncher's `Pf2eRules` boundary. Prefer standard PF2e item creation and rule evaluation. If an API is absent on the installed system, show a compatibility error before actor mutation. The app currently claims Foundry 12–14 and PF2e 6.0.0–8.6.1; verify the specific APIs in each supported combination or narrow the manifest's verified range.

Give each source feature an outcome: `created`, `granted`, `chosen`, `included`, `ignored`, `unmatched`, or `blocked`. Record Foundry item ID/UUID and explanation. This prevents duplicate class features and makes re-import diffs auditable.

## 4. Complex classes and companions

Class adapters should be small declarations that map WG selectors and class concepts to PF2e items/rules. Keep generic decode, matching, and staged writing shared. Each adapter defines required choices, item categories, companion requirements, and parity checks; it should not recalculate the whole class.

| Scenario | Source data to retain | Foundry plan | Acceptance checks |
| --- | --- | --- | --- |
| Witch | Patron and lesson/hex choices, prepared spell source, familiar abilities, class feature selections | Class and patron items; spellcasting entry and spell ranks; separate familiar actor where configured; relationship flags | Patron and hex selections persist after reload; focus spells and familiar abilities present; no duplicate granted features. |
| Runesmith class runes | Learned runes, class choices, runic feats and any WG trace/etch configuration | Class/feat/rune feature items and validated rule selections; report a class rune with no PF2e representation | Learned rune list and choices survive reload/re-import; no class rune is converted into a weapon or armor property rune. |
| Equipment runes | WG inventory runes and materials on specific physical items | Weapon/armor/shield item schema, using AMBA's composed-item parsing | Base item, fundamental/property runes and material round-trip independently of Runesmith class features. |
| Exemplar | Ikon identities, immanence/transcendence related choices, class and archetype feats | Ikon/feature items and rule selections in class context | Ikons and their grants survive re-import; feature counts and choices match WG. |
| Summoner | Eidolon type, evolution choices, shared resources | Parent actor and separately linked eidolon actor | Eidolon created once, linked to parent, and updated idempotently. |
| Inventor | Innovation, modifications, possible construct companion | Class feature selections plus linked construct actor where applicable | Innovation choices and construct progression persist without duplicate actors. |
| Multiclass/archetypes | Feat slot type, level and source, free-archetype variant | Slot-aware feat locations and variant mismatch notice | Feats occupy legal locations; unmatched slots remain visible. |

Require a sanitized real WG v4 export and an inspected PF2e compendium/rule-item example before declaring support for each complex class. Record actual selection keys, feature IDs, granted children, spell sources and companion data in fixture expectations. If a real export is unavailable, the class adapter remains experimental and its unverified fields appear in the import report. Synthetic fixtures can test logic, but cannot establish WG's emitted selection paths. For a companion, plan creation/update separately from the parent actor with a stable key `{ host, wgId, companionKind, sourceId }`; snapshot both actors before mutation and report partial failures. Preserve manually added companion items unless the user explicitly selects them for replacement.

## 5. Safe apply and re-import

`previewImport` must build and validate the complete plan before any Foundry write. Show adds, updates, removals, unmatched items, unresolved choices, companion actions and likely parity differences. Include a review of actor items and companion items that were added by hand: let the user keep them, replace selected ones, or cancel. The default is to keep them. Show any missing core-item replacement choice before confirming the plan. The confirmation applies that exact plan; if the WG export or relevant compendium indexes changed, regenerate preview.

For an update, snapshot the actor and any managed companion actors. Track ownership with module flags on every imported item and the relation to granted children. Keep current HP/temp HP, spent resources, prepared spell state, hero points and manually added items according to the reviewed preservation choices. Currency and hero points initialize new actors only unless the user explicitly asks to overwrite runtime state. Delete only items proven to be managed by this module, after the replacement plan is complete. Current `scripts/importer.js` removes managed items before replacement finishes; fix that path before adding new class writers. On failure, save a recoverable backup actor or restore from the snapshot, then report what needs attention. Do not describe an import as atomic until rollback behavior is tested in Foundry.

Re-import memory may store resolved compendium UUIDs and user answers, keyed by WG selection key plus owner ID and PF2e rule flag. Reuse an answer only when that same rule and a legal option still exist. Report invalidated answers for review.

## 6. Completeness and parity

Build a Foundry-oriented `auditImportCoverage` using AMBA's leftover/report concepts. Enumerate relevant source paths from the raw v4 export, including nested operations and `operation_data.selections`. A path counts as `mapped` or `included` only when a concrete plan action or resulting actor item/field cites it. Record `unresolved`, `leftover-preserved`, and `dropped` separately with reasons; a field merely listed in AMBA's `WG_IMPORT_MAPPED_CHARACTER_KEYS` does not count as consumed. The pass condition is zero unexplained dropped fields, with every unresolved path visible in the review report. Keep raw leftovers in a private actor flag only if size and privacy checks pass; otherwise provide a downloadable local report without secrets.

Expand post-import parity beyond current level/HP/attributes/items. Compare: ancestry/heritage/background/class; class-specific selections; skill, save, perception, armor and weapon ranks; AC, class DC, spell attack/DC, speed and languages; HP; spell entries, ranks, focus and slots; equipment quantities, runes and materials; coins and hero points on initial import; companion links. Distinguish an unsupported feature from a calculable mismatch. A full calculated total may differ because of active effects, so report it with context rather than overwriting PF2e derived fields blindly.

The UI and private report should give each difference a source path, expected WG value, actual Foundry value, reason, and next action. Reports must exclude the API key and avoid placing private character notes in public chat.

## 7. Delivery sequence and gates

1. **Baseline and evidence.** Freeze present behavior with current v4 fixtures and capture preview, diff and parity outputs. Obtain sanitized real WG exports and corresponding PF2e item/rule snapshots for each target class; record missing evidence explicitly. Gate: current `npm test` remains green and no class is marked supported without a real export.
2. **Safe writer first.** Build and validate the complete current plan, review manual items, snapshot actors, apply in dependency order, and recover on injected failures. Move homebrew-folder creation behind plan confirmation. Gate: cancellation changes nothing; a failed re-import retains or restores a usable actor with no duplicate managed items.
3. **Vendor AMBA parser slice.** Copy the browser-safe dependency closure and focused AMBA unit tests with provenance. Add a deterministic bundle build and packaged output. Gate: AMBA converter tests pass in this repo and the built module loads in Foundry.
4. **Dual decoder.** Run old `buildPlan` and AMBA conversion on the same fixtures without changing actor writes. Enumerate every mismatch and decide which interpretation is correct from the raw WG export. Gate: no regression in currently supported fields; operation selections and source IDs are preserved.
5. **Resolver and source ledger.** Add typed compendium candidates, aliases, missing-core replacement choices, and per-source-path outcomes. Gate: no fuzzy match silently becomes final, no granted feature duplicates, and a static mapped-key list cannot hide dropped data.
6. **Rule selections.** Implement the isolated PF2e adapter and persistent choice memory. Gate: a class choice remains selected after actor reload and second import; cancellation changes no actor.
7. **Class slices.** Implement and test Witch first (patron, hex, familiar), then Runesmith class runes and Exemplar, then Summoner/Inventor companions. Each slice requires a real WG export, matching PF2e rule examples, and import/reload/re-import checks before being marked supported. Keep unsupported cases visible in the report.
8. **Coverage and parity.** Extend source-path coverage and PF2e comparisons. Gate: each fixture has zero unexplained dropped source paths; supported fields match and unresolved or unsupported fields are listed clearly.
9. **Foundry matrix and release.** Run manual or automated Foundry-world checks on declared versions, narrow compatibility if required, update README, and package the built JS. Gate: a fresh module installation imports and re-imports each supported class fixture.

The critical Foundry-world cases are: first import, identical second import, a WG choice change, a compendium rename, no access (403), malformed export, import cancellation, failure halfway through item creation, a missing core compendium item, a player-added item kept or explicitly replaced, a granted child item, and a companion updated twice. Unit tests should use the raw WG fixtures and assert meaningful normalized selections, plan entries, source-path ledger statuses and parity results; they cannot substitute for PF2e rule evaluation in a real world.

## 8. Concrete file shape

```text
src/amba-wg/                 copied AMBA parser slice, original filenames, UPSTREAM.md
src/import/decode.ts         WG v4 validation + AMBA converter + source ledger
src/import/plan.ts           wg-friendly/v1 -> Foundry actor/companion plan
src/import/match.ts          PF2e compendium resolver + aliases + evidence
src/import/choices.ts        WG selection key -> verified PF2e ChoiceSet option
src/import/classes/          small Witch, Runesmith, Exemplar, Summoner, Inventor maps
src/import/pf2eRules.ts      version-checked PF2e rule adapter
src/import/apply.ts          snapshot, staged actor update, recovery
src/import/coverage.ts       actual source-path consumption and unresolved/leftover/dropped ledger
src/import/parity.ts         post-import comparison and report
test/fixtures/              sanitized WG v4 exports and expected facts
```

The current `scripts/*.js` entry points can import the bundled implementation while the UI migrates. Do not fork the AMBA parser into several rewritten JavaScript files: preserving the TS source and tests makes future upstream comparisons feasible and keeps the most complex WG logic in one place.
