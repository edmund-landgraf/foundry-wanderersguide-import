# Class test: Thaumaturge

Status: passes. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module main at 8882a16). Built as the campaign-42 GM test account.

## Character

- WG id 92, "Corvin Saltmark", level 1, joined to test campaign 42.
- Books: default plus Dark Archive (12). Thaumaturge is class 39.
- Halfling (Jinxed Halfling), Fortune Teller, Thaumaturge. No spellcasting.
- Choices:
  - Ancestry: free boost Cha. Ancestry feat Halfling Luck.
  - Fortune Teller: boosts Cha + Con, skill Diplomacy (Oddity Identification granted).
  - Class: skills Arcana, Religion, Deception. Free boosts Cha, Dex, Con, Wis.
  - First implement: **Lantern**. Class feat: Divine Disharmony. Esoteric Lore and Exploit Vulnerability granted.
- 0 open choices at the end.

## WG result

Str -1, Dex +2, Con +2, Int +0, Wis +2, Cha +4. HP 16, AC 15, Perception +7 (expert), Fort +7 (expert), Ref +5, Will +7 (expert), class DC +7 (Cha). Feats: Dubious Knowledge, Oddity Identification, Divine Disharmony, Exploit Vulnerability, Halfling Luck, Jinx, Lantern Implement; features Esoteric Lore, Esoterica, First Implement, Implement's Empowerment.

## Foundry import

On main (8882a16) the import **matches WG**: attributes, HP 16/16, AC 15, Perception +7, Fort +7, Ref +5, Will +7, class DC +7. 11 matched, 0 homebrew, 0 unresolved. Lantern lands as the PF2e Lantern implement feature with Initiate Benefit (Lantern) and a Lantern Implement item. Halfling Luck and Divine Disharmony are in their level-1 feat slots.

An earlier run on 75b06e8 (before #36) made Lantern Implement a homebrew feat; #36's semantic matching fixed that.

Skills come from PF2e's own choices, not WG (by design, [#10](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/10)).

Screenshots (`D:\tmp\wgui-newpc\`, copies in `/workspace/wgui-newpc/`): `92-sheet-after.png`, `92-feats.png`, `92-actions.png`, `92-spells-after.png`, `92-import-report.png`.

## Problems

None new.