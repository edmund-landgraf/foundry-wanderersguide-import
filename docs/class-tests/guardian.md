# Class test: Guardian

Status: **passes** (import, reload, re-import). Tested 2026-10-28 on local WGUI and the local Foundry world (PF2e 8.6.1), module at PR #69 branch `fix/wg-choice-edge-cases` (c8aca0c). Built as the campaign-42 GM test account.

## Character

- WG id 105, "Borka Ironwall", level 1, joined to test campaign 42. Books 1, 8, 7, 3, 611 (Battlecry!). Guardian is class 208.
- Dwarf (Rock Dwarf), Guard (Warfare Lore), Guardian. Key attribute **Str**.
- Feats: Dwarven Weapon Familiarity, Long-Distance Taunt.
- Inventory: Full Plate, Steel Shield, Warhammer. 0 open choices.

## Foundry import

| Check | Result |
|---|---|
| Import | PASS: 13 matched, 0 homebrew/missed, one actor |
| Key attribute | PASS: `str` |
| Taunt | PASS: one Taunt class feature plus the Taunt action it grants; no duplicate |
| Guardian's Armor | PASS: one item |
| Reload | PASS: same HP 25, AC 14, key str, 18 items |
| Re-import | PASS: one actor, 18 items |
| Duplicates | PASS: only Shield Block x2 (expected grant) |
| Clan Weapon prompt | GAP: WG has no clan weapon answer, so the prompt is left for the user (harness closed it) |
| Guard background lore | Report lists "WG chose Warfare Lore; not consumed by a PF2e ChoiceSet" as unresolved; Guard's lore is fixed in PF2e, so this is report noise |
| Changed choice / level change | not run in this pass |

Screenshots in `D:\tmp\wgui-newpc\`: `105-r1-*` and `105-r2-*`: sheet, feats, inventory, actions, import-report, prompt-0.
