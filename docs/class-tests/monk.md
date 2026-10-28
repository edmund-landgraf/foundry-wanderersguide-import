# Class test: Monk (Path to Perfection, stances, qi spell)

Status: **partial**. Import, reload, re-import, changed Path to Perfection and level change pass. The Cultural Adaptability / Adopted Ancestry answer is not applied, and the resulting empty PF2e prompt blocks the import until it is closed ([#77](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/77)). Tested 2026-10-28 on local WGUI and the local Foundry world (PF2e 8.6.1), module at main 86dc0e0. Built as the campaign-42 GM test account.

## Character

- WG id 109, "Mei Stillwater", level 7 (later 8), joined to test campaign 42. Books 1, 8, 7, 256 (Player Core 2, Monk class 111).
- Halfling (Gutsy Halfling), Martial Disciple (Acrobatics), Monk. Key attribute **Dex** (chosen).
- Path to Perfection: **Will** (r1/r2), changed to **Fortitude** (r3/r4).
- Class feats: Crane Stance (1), Mountain Stance (2), Qi Spells, giving the **Qi Rush** focus spell (4), Stunning Blows (6).
- Ancestry feats: Distracting Shadows, Cultural Adaptability (Human, then Halfling Luck). Skill/general feats: Assurance (Acrobatics), Cat Fall, Battle Medicine, Combat Climber, Diehard.
- Inventory: Bo Staff. 0 open choices.

## Foundry import

| Check | Result |
|---|---|
| Import (r1) | PASS with a workaround: 20 matched, 0 homebrew, key dex, HP 97, AC 25, 30 items |
| Path to Perfection | PASS: Will, answered from WG (`pathToPerfection`) |
| Stances | PASS: Crane Stance and Mountain Stance |
| Qi spell | PASS: Qi Rush in Monk Focus Spells (divine). An extra empty "Monk Spells" spontaneous entry is also created (cosmetic) |
| Adopted Ancestry | **FAIL**: WG's Human (trait 1436) is not mapped; the prompt is left unanswered ([#77](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/77)) |
| Empty prompt | **FAIL**: Cultural Adaptability then opens a prompt with 0 choices that the importer never closes, so `importCharacter` hangs until it is dismissed ([#77](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/77)). The test driver closed it |
| Key attribute ledger | Cosmetic: Dex is applied but listed as unresolved ([#67](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/67)) |
| Reload | PASS: same HP/AC/items, no duplicates |
| Re-import (r2) | PASS: one actor, 30 items, no duplicates |
| Changed choice (r3, Will to Fortitude) | PASS: Path to Perfection (Fortitude) |
| Level change (r4, 7 to 8) | PASS: HP 110, AC 26, one actor, no duplicates |

Screenshots in `D:\tmp\wgui-newpc\`: `109-r1-*` to `109-r4-*` (sheet, feats, inventory, actions, import-report, prompt-N, plus `109-r1-hang.png` from the first blocked run). Logs: `fg\109-r*.txt`.
