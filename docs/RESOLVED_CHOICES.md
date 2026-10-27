# Resolved WG choices (follow-up to PR #12 `docs/UNRESOLVED_CHOICES.md`)

PR #12 listed **66 unresolved selection rows (31 unique paths)** across the 8 test PCs.
This branch classifies every one of them from evidence inside the WG v4 export itself.
Nothing is guessed: a row is only resolved when the export proves what it is.

Classifier: `scripts/selections.js` (key grammar follows AMBA's `wgSelectionKey` /
`harvestSelections` in `wgFriendly/buildSelections.ts`, which were read, not modified).
Regression tests: `test/selections.test.mjs`, using the sanitized fixtures in `test/fixtures/pcs`
(which now keep only the `*_IDS` / `*_NAMES` lists of `content.raw_data_dump.variables`).

## Evidence used

* **Selection key**: `${scope}_${selectOpId}[-N][_${parentValue}]`.
* **Select operations**: `character.details.{ancestry,background,class}.operations` and
  `content.feats_features[*][*].operations`, including nested `optionsPredefined[].operations`
  and conditional branches.
* **WG computed state**: `content.raw_data_dump.variables.*_IDS` (FEAT_IDS, LANGUAGE_IDS, ...).

## Families

| Category | Result | Rule | Example (PC, key = value) |
|---|---|---|---|
| inactive-nested | dropped | Nested key `P_X = Y` where X is P's answer, no select op in the export reads X, and Y is absent from every WG `*_IDS` list: WG itself ignores it (stale answer from an earlier choice). | 63: `class-feature-31082_3b6ac969…_31818 = 31817` (31817 not in FEAT_IDS) |
| language | included | Top-level `ancestry_957ee14b…-N` value is a language id in WG `LANGUAGE_IDS`; imported via `content.languages`. | 63: `…-0 = 673` TANUKI; 64: `…-1 = 902` PAHTRA; also 313 AMURRUN, 81 Common |
| attribute-option | included | Background select value is the op id of an `adjValue ATTRIBUTE_*` option; final modifiers are forced from `content.attributes`. | 63 Deckhand `b4534dca…` STR; 64 Dauntless `ca495819…` WIS; 66 Herbalist `808ee9f7…` WIS; 71 Entertainer `646ec7b7…` CHA |
| choice-answer → mapped | mapped (live) | Option resolves to a named ability block that a PF2e ChoiceSet offers. | 66/76: `class-feature-21217_f78123ba… = 0ddfce1c…` → block 20412 **Plant Empathy** → PF2e Voice of Nature (`Compendium.pf2e.classfeatures.Item.d5BFFHXFJYKs5LXr`) ChoiceSet `feat` (Animal / Plant Empathy) |

Offline (golden tests, no compendium) the Voice of Nature row stays `unresolved` with reason
`choice-answer: … WG chose Plant Empathy`; in a live import it is `mapped` once the ChoiceSet consumes it.
Note: actors imported before this change had Animal Empathy (picked by a test harness, not by WG); re-import fixes it.

## Exceptions (documented, not mapped)

| Exception | PCs | Evidence | Why not mapped |
|---|---|---|---|
| `pf2e-fixed-choice` | 64, 74 | `ancestry-section-491735390724817_9f26290c…-1_29476_9a604abf…_dc582144… = 3b3b3378…` → WG Specialty Crafting **Woodworking** | PF2e's Web Weaver (`CUrxG9CzT1hSfuhP`) GrantItem hard-codes `preselectChoices.specialtyCrafting = "weaving"`. Overriding a PF2e rule element is out of scope, so the importer keeps PF2e's rule and reports `exception pf2e-fixed-choice`. |

## Counts (coverage `unresolved`)

| PC | PR #12 doc | offline golden now | live re-import now |
|---|---|---|---|
| 63 / 72 | 9 | 0 | 0 |
| 64 / 74 | 20 | 1 | 1 (exception) |
| 66 / 76 | 2 | 1 | 0 |
| 71 / 78 | 2 | 0 | 0 |
