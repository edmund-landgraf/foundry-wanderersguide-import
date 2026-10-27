# Class test: Necromancer

Status: open. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world. Built as the campaign-42 GM test account.

## Character

- WG id 81, "Morrow Quillgrave", level 1, joined to test campaign 42.
- Books: Player Core, Monster Core, GM Core, Impossible Magic (842). Necromancer is class id 337 in Impossible Magic.
- Dwarf (Death Warden Dwarf), Scholar, Necromancer: Puppeteer and Bone.
- Choices: ancestry free boost Int; languages Necril, Petran, Draconic, Aklo; Scholar boosts Int + Con, skill Occultism, Assurance (Occultism); class skills Arcana, Religion, Medicine, Society, Crafting, Intimidation; class free boosts Int, Con, Dex, Wis; ancestry feat Dwarven Doughtiness.
- 0 open choices at the end.

## WG result

Str +0, Dex +1, Con +3, Int +4, Wis +2, Cha -1. These match the boosts. HP 21, AC 14, Perception +5, Fort +8 (expert), Ref +4, Will +5. Spell DC 17 (occult, Int, prepared). Class feat Consume Thrall. Focus: Create Thrall, Thrall Charge, Necrotic Bomb, Bone Spear. Spells list: Harm (rank 1). Slots: 5 cantrips, 1 rank-1.

## Foundry import

The import completed after two PF2e prompts were answered by the test script: Clan Weapon -> Clan Dagger, Scholar -> Occultism. The actor has HP 21, AC 14, Fort 8, Ref 4, Will 5, matching WG. It has 25 items, including Puppeteer, Bone, Grave Spells and the four focus spells. The prepared slots are empty.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| N1 | Prepared spells / spellbook | choices for cantrips + rank-1 spellbook entries | no spell choice offered; 5 cantrip + 1 rank-1 slots empty | WGUI / connector | open |
| N2 | Dwarf Clan Weapon ChoiceSet | answered from WG (Clan Dagger is fixed in WG) | import blocks on the "Clan Weapon" prompt | importer | open |
| N3 | Scholar skill ChoiceSet | answered from the WG background selection (Occultism) | import blocks on the "Scholar" prompt | importer | open |
| N4 | Consume Thrall class feat | imported | in WG `classFeats`, not on the Foundry actor | importer | open |
| N5 | Thrall | thrall support (focus spell plus summon) | only the Create Thrall cantrip; no thrall actor | WGUI / importer (by design?) | open |
| N6 | Current HP | 21 on a fresh import | the sheet shows 13 / 21 | importer (verify) | open |
| N7 | Focus pool | 1 point at level 1 | the sheet shows an empty focus pool | importer (verify) | open |
| N8 | WG import chat card | posted | the scripted run found no "WG import:" card | importer (verify) | open |
| N9 | `set_identity` with an ancestry outside the enabled books (Kholo) | rejected | reports "saved", stores nothing | connector | open (same as Summoner S4) |
| N10 | Fort expert at level 1 | rules check | Fort +8 expert | WGUI (verify) | open |
