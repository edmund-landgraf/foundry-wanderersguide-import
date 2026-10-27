# Issue #28 research: Runesmith skill ChoiceSet

Research snapshot: 2026-10-27. This document records the evidence and implementation boundary before changing runtime code.

## Reported behavior

[Issue #28](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/28) uses WG character 85, Brannoc Runecarver, a level-1 Runesmith. The WG export contains a class selection whose value is `SKILL_ARCANA`. Foundry's PF2e Runesmith class item exposes a ChoiceSet named `runesmithSkill` with legal options Arcana, Nature, Occultism, and Religion.

The current import blocks on the PF2e `PickAThingPrompt`. The test harness must click Arcana. The import report says the WG selection was dropped because it is a skill option.

## Evidence from the current code

`scripts/selections.js` deliberately classifies a selected operation whose `adjValue.variable` starts with `SKILL_` as:

```text
status: dropped
category: skill-option
```

That policy is correct for direct skill writes: the PF2e class, background, ancestry, and ChoiceSet rules should derive proficiency and avoid a second competing write.

The importer already has a separate ChoiceSet hint path:

1. `scripts/mapping.js::wgChoiceHints` reads explicit WG selections and turns them into owner-scoped names.
2. `scripts/importer.js::choiceContext` stores those hints and tracks which source keys were consumed.
3. `resolveChoiceSet` accepts a hint only when it maps to exactly one legal PF2e option.
4. `prefillChoices` writes the selection before item creation; otherwise the PF2e prompt remains visible and the import report records it as unresolved.

The defect is at the boundary between those two policies. `SKILL_*` is dropped before it can become a ChoiceSet hint. It must remain dropped in the coverage ledger while also being available as a non-writing hint.

## Export shape

The existing real fixture `test/fixtures/pcs/81.json` demonstrates the same WG operation family. Its selections include:

```text
class_720d2fe6-f042-4353-8313-1293375b1301-0 = SKILL_ARCANA
class_720d2fe6-f042-4353-8313-1293375b1301-1 = SKILL_RELIGION
...
```

The export stores these as selected operation values, not as Foundry item UUIDs and not as a direct `system.skills` payload. The selection value is therefore suitable as evidence for a ChoiceSet, but not as a standalone actor update.

For character 85 specifically, the class selection described in the issue is:

```text
WG answer: SKILL_ARCANA
PF2e legal ChoiceSet value: the Arcana option in runesmithSkill
```

The implementation must match the semantic skill name, not assume that WG's `SKILL_ARCANA` string is the PF2e ChoiceSet value. PF2e may use a slug, localized label, or another internal value.

## Related evidence and scope

- [Issue #22](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/22) is the same family for a Scholar background skill ChoiceSet.
- [Runesmith class log](https://github.com/edmund-landgraf/foundry-wanderersguide-import/blob/main/docs/class-tests/runesmith.md) confirms that Arcana is the intended class skill, the prompt appears during import, and direct skill selections are currently documented as dropped by design.
- [WandersGuideUI issue #9](https://github.com/edmund-landgraf/WandersGuideUI/issues/9) concerns changing an already-answered WG choice. It is separate from #28 because #28 only consumes an existing export answer.
- [WandersGuideUI issue #10](https://github.com/edmund-landgraf/WandersGuideUI/issues/10) concerns Exemplar sub-choices and is unrelated to the Runesmith skill ChoiceSet.
- The existing selection tests cover `SKILL_*` classification and ChoiceSet matching independently, but no test proves that a `SKILL_*` answer can satisfy a PF2e ChoiceSet while remaining a dropped direct skill write.

## Proposed implementation

Make `wgChoiceHints` understand `adjValue` options whose variable starts with `SKILL_`. Normalize the variable to the semantic label (`SKILL_ARCANA` → `Arcana`, or an equivalent canonical skill label) and add it to the owning feature's hint list. Preserve the existing `classifySelection` result as `dropped` with category `skill-option`. Keep the exact selection key in the hint provenance map so `markUsed` can mark the answer consumed only when the ChoiceSet actually uses it.

Do not:

- write `SKILL_*` values directly into the actor;
- answer a ChoiceSet from a class skill list unless the WG export contains the corresponding explicit selection;
- choose the first legal skill when the hint is absent or ambiguous;
- change the connector or WG data model as part of issue #28;
- mark the class verified based on this one ChoiceSet.

## Required tests

1. Add a sanitized fixture derived from character 85, or a minimal fixture that retains its real selection operation shape and `SKILL_ARCANA` answer.
2. Assert `classifySelection` still returns `dropped` / `skill-option` for the direct selection.
3. Assert `wgChoiceHints` exposes `Arcana` for the owning Runesmith feature and preserves the exact WG key in `hints.keys`.
4. Assert a ChoiceSet with Arcana/Nature/Occultism/Religion resolves Arcana exactly once.
5. Assert no hint or direct skill write is produced when the WG answer is absent.
6. Assert duplicate or ambiguous legal labels remain unresolved.
7. Run the full suite and confirm the eight existing goldens are unchanged.
8. Update `docs/class-tests/runesmith.md` so R2 is fixed only after a Foundry import of character 85 completes without a prompt and the resulting Arcana proficiency is verified.

## Expected result

Issue #28 should be fixed in the importer only. The WG answer becomes evidence for the PF2e Runesmith ChoiceSet, while coverage continues to show that the raw skill-option selection was not directly written. This preserves the safety rule and makes the class prompt deterministic without guessing.
