# Class test: Barbarian (Dragon Instinct)

Status: **partial**. Import, reload and re-import pass, but the dragon is not applied ([#71](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/71)). Tested 2026-10-28 on local WGUI and the local Foundry world (PF2e 8.6.1), module at PR #69 branch `fix/wg-choice-edge-cases` (c8aca0c). Built as the campaign-42 GM test account.

## Character

- WG id 106, "Vashka Emberjaw", level 6, joined to test campaign 42. Books 1, 8, 7, 256 (Player Core 2, needed for Barbarian, class 108).
- Orc (Battle-Ready Orc), Warrior, Barbarian. Key attribute **Str** (fixed).
- Instinct: **Dragon Instinct**, dragon **Diabolic** (not the first option).
- Class feats: Draconic Arrogance (1), Acute Scent (2), Second Wind (4), **Dragon's Rage Breath** (6).
- Ancestry feats: Orc Weapon Familiarity, Orc Ferocity. Skill/general feats: Battle Medicine, Toughness, Quick Coercion, Intimidating Prowess.
- Inventory: Greataxe, Hide Armor. 0 open choices.

## Foundry import

| Check | Result |
|---|---|
| Import | PASS: 20 matched, 0 homebrew/missed, one actor |
| Key attribute | PASS: str |
| Instinct | PASS: Dragon Instinct, answered from WG |
| Dragon | **FAIL**: WG Diabolic not applied. The report says "WG answer Diabolic differs from PF2e's grant via Instinct; kept PF2e's grant" and PF2e asks "Select a dragon" ([#71](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/71)) |
| Dragon's Rage Breath | PASS: present (damage type depends on the missing dragon) |
| Reload | PASS: HP 112, AC 20, 26 items |
| Re-import | PASS: one actor, 26 items, same result (dragon still unanswered) |
| Duplicates | PASS: only Intimidating Glare x2 (Orc grant plus Warrior background; expected) |

Screenshots in `D:\tmp\wgui-newpc\`: `106-r1-*` and `106-r2-*`: sheet, feats, inventory, actions, import-report, prompt-N.