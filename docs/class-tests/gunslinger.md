# Class test: Gunslinger (Way of the Sniper, then Drifter)

Status: **partial**. Import, reload, re-import, changed Way and level change all pass. The Way-granted actions are misreported and Into the Fray is added twice ([#78](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/78)), and the Clan Weapon prompt is left unanswered ([#22](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/22)). Tested 2026-10-28 on local WGUI and the local Foundry world (PF2e 8.6.1), module at main 86dc0e0. Built as the campaign-42 GM test account.

## Character

- WG id 108, "Corvin Blackpowder", level 3 (later 4), joined to test campaign 42. Books 1, 8, 7, 17 (Guns & Gears, class 62).
- Dwarf (Rock Dwarf), Bounty Hunter, Gunslinger. Key attribute **Dex** (fixed).
- Way: **Way of the Sniper** (r1/r2), changed to **Way of the Drifter** (r3/r4).
- Class feats: Cover Fire (1), Hit the Dirt! (2). Ancestry feat: Clan Pistol. Skill/general feats: Assurance (Athletics), Additional Lore (Legal).
- Inventory: Arquebus, Leather Armor. 0 open choices.

## Foundry import

| Check | Result |
|---|---|
| Import (r1) | PASS: 13 matched, one actor, key dex, HP 40, AC 19, 20 items |
| Gunslinger's Way | PASS: Way of the Sniper, answered from WG |
| Sniper actions | PARTIAL: Covered Reload and One Shot, One Kill are granted by PF2e, but reported unresolved ([#78](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/78)) |
| Clan Weapon prompt | **FAIL**: Clan Dagger / Clan Pistol prompt left unanswered although WG has the Clan Pistol feat ([#22](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/22)). The Clan Pistol weapon is granted |
| Reload | PASS: same HP/AC/items, no duplicates |
| Re-import (r2) | PASS: one actor, 20 items, no duplicates |
| Changed choice (r3, Sniper to Drifter) | PASS with a bug: the Sniper actions are removed and Drifter is applied, but **Into the Fray** is added both as a Way action and as a stray feats-srd feat; Reloading Strike is reported unresolved ([#78](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/78)) |
| Level change (r4, 3 to 4) | PASS: HP 50, AC 20, one actor, no new duplicates |

Screenshots in `D:\tmp\wgui-newpc\`: `108-r1-*` to `108-r4-*` (sheet, feats, inventory, actions, import-report, prompt-N). Logs: `fg\108-r*.txt`.
