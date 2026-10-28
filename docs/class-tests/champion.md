# Class test: Champion

Status: open. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module main at 7696614). Built as the campaign-42 GM test account.

## Character

- WG id 87, "Seraphine Dawnward", level 1, joined to test campaign 42.
- Books: Player Core, Monster Core, GM Core, Player Core 2 (256). Champion is class 109; Champion (legacy) 40 was not used.
- Dwarf (Forge Dwarf), Acolyte, Champion. No spell slots; devotion (focus) spell only.
- Choices:
  - Ancestry: free boost Str; Dwarven Doughtiness. Clan Dagger is granted.
  - Acolyte: boosts Wis + Cha, skill Medicine (Student of the Canon).
  - Class: key attribute Str; class skills Athletics, Diplomacy; free boosts Str, Con, Wis, Cha.
  - Cause: **Redemption** (Glimpse of Redemption). Class feat: Desperate Prayer.
  - Deity feature: sanctification Holy, divine skill Society, favored weapon Warhammer. **WG never asks for a deity.**
  - Devotion spell: Lay on Hands.
- 0 open choices at the end.

## WG result

Str +3, Dex +0, Con +2, Int +0, Wis +3, Cha +1. HP 22 (dwarf 10 + class 10 + Con 2), AC 13 (no armor), Perception +6, Fort +7 (expert), Ref +3, Will +8 (expert), class DC +6 (Str), spell DC 14 (Cha). Feats: Shield Block, Student of the Canon, Desperate Prayer, Glimpse of Redemption, Dwarven Doughtiness, Redemption Cause; features Cause, Champion's Aura, Deity, Devotion Spells. Focus spell: Lay on Hands.

## Foundry import

On main, the import is **wrong for every stat that depends on attributes**: Str 0, Con +1, Wis +1, Cha -1 (ancestry boosts only), HP 21, Fort +6, Will +6, Perception +4. The cause is a regression from 0776f05 ([#30](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/30)). The same re-import of Exemplar 86 now gives HP 15 instead of 17.

With the one-line fix from #30 applied locally (not committed), the screenshots below match WG on attributes, max HP 22, AC 13, Fort +7, Ref +3, Will +8, Perception +6 and class DC +6. Lay on Hands lands in Champion Focus Spells (focus max 1). 9 matched, 2 created as homebrew (Glimpse of Redemption, Redemption Cause).

Prompts: Clan Weapon was answered (Clan Dagger). **Deity (Champion)** had nothing to answer from and was left blank. **Cause** offered only Justice, Liberation and Obedience, so it became Justice.

Screenshots (`D:\tmp\wgui-newpc\`, copies in `/workspace/wgui-newpc/`): `87-sheet-after.png`, `87-feats.png`, `87-actions.png`, `87-spells-after.png`, `87-import-report.png`.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| C1 | Attributes wiped | WG attribute mods forced (Str +3, Con +2, Wis +3, Cha +1) | ancestry-only mods; HP 21, Fort 6, Will 6 | importer (regression 0776f05) | open ([#30](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/30)) |
| C2 | Cause | Redemption from WG | PF2e prompt lacks Redemption, so Justice; Redemption Cause and Glimpse of Redemption are homebrew | importer | open ([#31](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/31)) |
| C3 | Deity | deity from WG | WG has no deity choice; Deity (Champion) prompt blank; `a.deity` null | WGUI | open ([WandersGuideUI #11](https://github.com/edmund-landgraf/WandersGuideUI/issues/11)) |
| C4 | Key attribute | `class.keyAbility.selected = str` | null; ledger lists "WG chose Strength" unresolved | importer | open ([#32](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/32)) |
| C5 | Sanctification, favored weapon, devotion pick | applied from WG | unresolved in the ledger (Holy, Warhammer, Lay on Hands choice) | importer | open ([#31](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/31)) |
| C6 | Feat slots | Dwarven Doughtiness, Desperate Prayer in feat slots 1 | Ancestry Feats 1 and Class Feats 1 show Empty Slot (after 0776f05) | importer | open ([#26](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/26)) |
| C7 | Current HP | 22 / 22 fresh | 21 / 22 | importer | open ([#24](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/24)) |
| C8 | Two Shield Blocks | one feature + its granted feat | same as Thorncup; PF2e grant pair | none | not a bug |
| C9 | Focus points | 1 / 1 | 0 / 1 | importer (verify) | note |
| C10 | Skills | WG skills trained | only Religion | importer (by design) | tracked (#10) |
