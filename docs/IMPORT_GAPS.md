# Remaining import gaps

The safe-import work in PR #6 completed the eight-PC Foundry validation matrix. Since then, PRs 12, 14, 15, 16, 17, 18, 19, 20, and 29 have added evidence inventories, class-registry design, choice handling, duplicate diagnostics, prepared-spell handling, slim-export fallback, and Runesmith/Exemplar test logs. The items below remain deliberately separate from that completed safety work.

## Current implementation status

- **Implemented and tested:** no guessed ChoiceSet fallback, safe apply/rollback, grant provenance diagnostics, prepared-spell import, slim-export fallback, feat-slot placement, and skill-option hints for explicit PF2e ChoiceSets. The current repository suite passes 52/52.
- **Still experimental:** all class support. The 29-class matrix records required WG evidence; Pathmuncher fixtures are leads, not WG parity proof.
- **Recent class evidence:** Runesmith 85 and Exemplar 86 logs identify open follow-ups for repeated Exemplar ChoiceSets, live feat-slot verification, HP validation, and WG/connector choice recording.

## Not fixable in the importer alone

### WG export freshness

Changing a feat in the Wanderer's Guide database did not change the exported JSON during manual testing. The importer can only apply data that appears in the export. This needs to be verified or fixed in the WG export service before it can be used as an importer regression case.

### Connector and export limitations

The WG connector cannot currently revise an already-answered choice ([WandersGuideUI #9](https://github.com/edmund-landgraf/WandersGuideUI/issues/9)). Exemplar ikon sub-choices are also not recorded in the WG export ([WandersGuideUI #10](https://github.com/edmund-landgraf/WandersGuideUI/issues/10)). These cannot be repaired safely in this importer without source evidence.

### Nested choices without PF2e targets

Some `character.operation_data.selections` entries have no corresponding PF2e item or rule target. The importer records these as unresolved and leaves the choice for manual PF2e review. Automatically choosing an item would be unsafe. Resolving these requires a class-, ancestry-, or background-specific PF2e mapping with real WG evidence.

## Test-world cleanup

The actors renamed with `(pre-test)` are leftovers from the manual test round. They were intentionally retained and are not created by normal imports. They can be deleted from the test world after the results are archived; no importer change is required.

## Report history

An older Azarra report mentioned “pre-filled Woodworking” after the duplicate item had already been removed. Import notes are written into each import report/chat message and are not used as persistent import state. Verify the wording in a fresh report before treating it as an active importer defect.

## Open importer work

The next implementation targets are tracked as issues:

- [#27](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/27): consume multiple explicit WG answers for repeated Exemplar ikon ChoiceSets.
- [#22](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/22): apply the same evidence-backed ChoiceSet approach to Necromancer Clan Weapon, Scholar skill, and Assurance.
- [#23](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/23): verify or report Necromancer Consume Thrall when the installed PF2e compendium lacks it.
- [#24](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/24): finish rules checks for Summoner/Necromancer HP, focus pool, proficiency, and spell slots.
- [#25](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/25): capture Foundry golden fixtures for PCs 80 and 81.
- [#21](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/21): create and idempotently update a linked Summoner eidolon actor after WG exports the eidolon block.

Issue #28 is closed: explicit WG `SKILL_*` answers remain dropped as direct skill writes but now answer a matching PF2e ChoiceSet. Issue #26 has implementation coverage in main and needs live character-85/86 verification before closure.

## Release boundary

The safe-import changes are merged and tested, but class support remains experimental. Keep unresolved-choice, export-freshness, connector, and compendium limitations visible until each has evidence and a targeted fix or explicit exception.

