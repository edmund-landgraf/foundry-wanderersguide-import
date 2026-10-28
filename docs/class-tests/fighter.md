# Class test: Fighter

Status: **passes** (import, reload, re-import). Tested 2026-10-28 on local WGUI and the local Foundry world (PF2e 8.6.1), module at PR #69 branch `fix/wg-choice-edge-cases` (c8aca0c). Built as the campaign-42 GM test account.

## Character

- WG id 104, "Tamsin Quickblade", level 5, joined to test campaign 42. Books 1, 8, 7, 3.
- Human (Skilled Human: Stealth), Acrobat, Fighter. Language Elven.
- Key attribute **Dex**. Class skill Acrobatics. Skill increases Acrobatics, then Athletics.
- Weapon Mastery (level 5): **Sword**.
- Feats: Double Slice, Lunge, Twin Parry; Haughty Obstinacy, Clever Improviser; Bargain Hunter, Automatic Knowledge; Armor Proficiency.
- Inventory: Rapier. 0 open choices.

## Foundry import

| Check | Result |
|---|---|
| Import | PASS: 17 matched, 0 homebrew/missed, one actor |
| Key attribute | PASS: `keyAbility.selected = dex` |
| Weapon Mastery group | PASS: Fighter Weapon Mastery (Sword), `fighterWeaponMastery: sword`, answered from WG |
| Skilled Human | PASS: `skill: stealth`, pre-filled from WG |
| Class skill | PASS: `fighterSkill: acrobatics` |
| Armor Proficiency | GAP: on the first import the report says "no explicit WG answer"; it ended up Heavy, and the re-import kept it as an existing legal Foundry choice |
| Reload | PASS: same HP 73, AC 21, key dex, 21 items |
| Re-import | PASS: one actor, 21 items, same selections |
| Duplicates | PASS: only Shield Block x2 (class feature plus the general feat it grants; expected) |
| Changed choice / level change | not run in this pass |

The report also lists one ancestry selection as unresolved ("WG select answer with no PF2e target"). Skill trainings are still dropped by design (see CL6 in cleric.md).

Screenshots in `D:\tmp\wgui-newpc\`: `104-r1-*` (first import) and `104-r2-*` (re-import): sheet, feats, inventory, actions, import-report.
