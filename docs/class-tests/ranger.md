# Class test: Ranger

Status: **passes** with one homebrew duplicate ([#72](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/72)). Tested 2026-10-28 on local WGUI and the local Foundry world (PF2e 8.6.1), module at PR #69 branch `fix/wg-choice-edge-cases` (c8aca0c). Built as the campaign-42 GM test account.

## Character

- WG id 107, "Wren Thornstep", level 2 (raised to 3 for the level-change check), joined to test campaign 42. Books 1, 8, 7.
- Elf (Woodland Elf), Hunter, Ranger. Key attribute **Dex**. Language Orcish.
- Hunter's Edge **Flurry** (changed to Precision for the changed-choice check).
- Class feats: Initiate Warden (focus spell Gravity Weapon), Twin Takedown. Ancestry feat Nimble Elf. Skill feat Automatic Knowledge.
- Level 3: Toughness, skill increase Stealth.
- Inventory: 2 Shortswords, Leather Armor. 0 open choices.

## Foundry import

| Check | Result |
|---|---|
| Import (r1) | PASS with a gap: 14 matched, 1 homebrew ("Flurry Edge") |
| Key attribute | PASS: dex |
| Hunter's Edge | PASS: `huntersEdge` = Flurry, answered from WG |
| Hunter's Edge feat | **FAIL**: WG "Flurry Edge" imported as homebrew next to PF2e's Flurry ([#72](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/72)) |
| Focus spell | PASS: Ranger Focus Spells entry (primal, DC 16), Gravity Weapon |
| Reload | PASS: HP 28, AC 18, 20 items |
| Re-import (r2) | PASS: one actor, 20 items |
| Changed choice (r3, Flurry to Precision) | PASS: Precision replaces Flurry, no Flurry left, still 20 items. The homebrew is now "Precision Edge" (#72). `precisionHuntersEdge` is null (to check) |
| Level change (r4, 2 to 3) | PASS: one actor, HP 42, AC 19, Will Expertise and Toughness added, Gravity Weapon heightened to 2, DC 17 |
| Manual work kept | not tested (the harness has no manual edit step) |
| Duplicates | Shortsword x2 is intentional (two bought); the report calls it an "unexpected duplicate" |

The report lists "Ranger: WG chose Dexterity; not consumed by a PF2e ChoiceSet" as unresolved, but the key is dex. This is report noise.

Screenshots in `D:\tmp\wgui-newpc\`: `107-r1-*`, `107-r2-*`, `107-r3-*` (changed choice), `107-r4-*` (level 3): sheet, feats, inventory, actions, import-report.