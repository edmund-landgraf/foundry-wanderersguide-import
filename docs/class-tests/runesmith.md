# Class test: Runesmith

Status: open. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module on main). Built as the campaign-42 GM test account.

## Character

- WG id 85, "Brannoc Runecarver", level 1, joined to test campaign 42.
- Books: Player Core, Monster Core, GM Core, Impossible Magic (842). Runesmith (class id 336) is in Impossible Magic. There is also a playtest copy (167), which was not used.
- Dwarf (Forge Dwarf), Artisan, Runesmith. Not a caster, so no spell tools were needed.
- Choices:
  - Ancestry: free boost Dex; languages Draconic, plus Petran from the Int boost; Dwarven Weapon Familiarity.
  - Artisan: boosts Int + Str, skill Athletics, Specialty Crafting (Blacksmithing).
  - Class: Runesmith skill Arcana; class skills Society, Intimidation, Diplomacy, plus Medicine from the Int boost; free boosts Str, Con, Dex, Wis; class feat Engraving Strike.
  - Runic Repertoire: Marssyl (Impact), Esvadir (Whetstones), Atryl (Fire), Sertum (Preparedness).
- 0 open choices at the end.

## WG result

Str +2, Dex +2, Con +2, Int +2, Wis +2, Cha -1. HP 20 (dwarf 10 + class 8 + Con 2), AC 15, Perception +5, Fort +7 (expert), Ref +5, Will +7 (expert), class DC +5 (Int). Trained: Arcana, Athletics, Crafting, Diplomacy, Intimidation, Medicine, Society, Guild Lore. Features: Runes, Runic Repertoire, Shield Block, Trace Rune, Invoke Rune. Languages: Common, Dwarven, Draconic, Petran.

The intended build had free boosts Str/Con/Dex/Int, for Int +3. The Wis boost could not be changed after it was saved (R5).

## Foundry import

10 matched, 4 created as homebrew (the four runes). The import completed after one prompt was answered by the test script: Runesmith -> Arcana. Clan Weapon -> Clan Dagger was answered from the existing Foundry selection. HP 20, AC 15, Fort 7, Ref 5, Will 7, Perception 5, class DC 5 match WG. Trace Rune and Invoke Rune came in as actions, and Clan Dagger came in as a weapon. Skill selections were dropped (by design, #10), so only Arcana and Crafting are trained.

Screenshots (`D:\tmp\wgui-newpc\`): `85-sheet-after.png`, `85-feats.png`, `85-actions.png`, `85-import-report.png`.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| R1 | Feat slots | Dwarven Weapon Familiarity in Ancestry Feats 1, Engraving Strike in Class Feats 1 | both on the actor with no slot; sheet shows "Empty Slot" for both | importer | open ([#26](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/26)) |
| R2 | Runesmith skill ChoiceSet | answered from the WG class selection (Arcana) | import blocks on the "Runesmith" prompt; WG selection dropped as a skill | importer | open ([#28](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/28), same family as #22) |
| R3 | Runes | PF2e rune items | created as homebrew feats; PF2e 8.6.1 ships no Atryl/Esvadir/Marssyl/Sertum items, so homebrew is the right fallback | none (PF2e content) | not a bug |
| R4 | Current HP | 20 on a fresh import | sheet shows 12 / 20 | importer (verify) | open (#24, same as N6) |
| R5 | Change a saved choice | `choose` can replace an answered selection | "That choice is not open." (NOT_FOUND) | connector | open ([WandersGuideUI #9](https://github.com/edmund-landgraf/WandersGuideUI/issues/9)) |
| R6 | Skills | WG skills trained in Foundry | only Arcana, Crafting | importer (by design) | tracked (#10) |
| R7 | Clan Weapon prompt | answered from WG | answered from the existing Foundry selection (an earlier run), not WG | importer | open (#22) |
