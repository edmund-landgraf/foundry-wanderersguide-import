# Class test: Animist

Status: open. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module main at 7696614). Built as the campaign-42 GM test account.

## Character

- WG id 88, "Tamsin Mossveil", level 1, joined to test campaign 42.
- Books: Player Core, Monster Core, GM Core, War of Immortals (400). Animist is class 148; the playtest copy (69) was not used.
- Elf (Woodland Elf), Herbalist, Animist. Divine prepared caster plus apparition repertoire.
- Choices:
  - Ancestry: free boost Wis; language Sylvan; Otherworldly Magic with cantrip Tangle Vine (innate, arcane).
  - Herbalist: boosts Wis + Con (Natural Medicine).
  - Class: skill Occultism; class skills Medicine, Religion, Stealth; free boosts Wis, Dex, Con, Cha.
  - Practice: Liturgist (grants Circle of Spirits). Apparitions: Custodian of Groves and Gardens (primary), Steward of Stone and Fire.
- Spells through the spell tools (`set_spells`):
  - `ANIMIST` prepared: Vitality Lash, Guidance (cantrips), Heal (rank 1).
  - `ANIMIST_APPARITION` repertoire: Light, Divine Lance, Bless.
- 0 open choices at the end.

## WG result

Str +0, Dex +2, Con +1, Int +1, Wis +4, Cha +1. HP 15 (elf 6 + class 8 + Con 1), AC 15, Perception +7, Fort +4, Ref +5, Will +9 (expert), class DC +7, spell DC 17 / attack +7 (Wis). Slots: ANIMIST 2 cantrips + 1 rank 1; ANIMIST_APPARITION 2 + 1. No focus spells. Export is 9.2 MB (7.5 MB in `raw_data_dump.history`).

## Foundry import

On main: Wis +1, Dex +1, Con -1, HP 13, AC 14, Will +6 (regression [#30](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/30)). With the #30 fix applied locally: attributes, max HP 15, AC 15, Perception +7, Fort +4, Ref +5 and Will +9 match WG. 18 matched, 0 homebrew. The Animistic Practice prompt was answered from WG (Liturgist). All three spellcasting entries were created:

- Animist Spells (prepared): slots 2 / 1, prepared Vitality Lash, Guidance, Heal. These match WG.
- Animist Apparition Spells (spontaneous): Light, Divine Lance, Bless, plus **Tangle Vine and Ignition**, which PF2e grants from the apparitions and WG never had.
- Innate Spells (Arcane): Tangle Vine. That makes a "spell:tangle-vine unexpected duplicate" diagnostic, which is expected (Otherworldly Magic plus Custodian).

Class DC is **+3** against WG's +7, because `details.keyability` stays `str`. Focus pool max 0, and there is no vessel spell in either WG or Foundry.

Screenshots (`D:\tmp\wgui-newpc\`, copies in `/workspace/wgui-newpc/`): `88-sheet-after.png`, `88-feats.png`, `88-spells-after.png`, `88-actions.png`, `88-import-report.png` (with the #30 fix). The `88-*.main.png` files are the same views from unmodified main.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| A1 | Attributes wiped | WG mods (Wis +4, Dex +2, Con +1) | ancestry-only; HP 13, AC 14, Will 6 | importer (regression 0776f05) | open ([#30](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/30)) |
| A2 | Class DC | +7 (Wis) | +3; `details.keyability` = str | importer | open ([#32](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/32)) |
| A3 | Apparition spells | each apparition's spells in the WG repertoire | WG offers only the plain divine list; PF2e adds Tangle Vine and Ignition | WGUI | open ([WandersGuideUI #12](https://github.com/edmund-landgraf/WandersGuideUI/issues/12)) |
| A4 | Vessel spell / focus pool | primary apparition vessel spell, 1 Focus Point | none in WG or Foundry | WGUI (then importer) | open ([WandersGuideUI #12](https://github.com/edmund-landgraf/WandersGuideUI/issues/12)) |
| A5 | Rank-5 slot row | none at level 1 | `ANIMIST` source reports `{rank 5, amount null}` | WGUI | open ([WandersGuideUI #12](https://github.com/edmund-landgraf/WandersGuideUI/issues/12)) |
| A6 | Export size / slim | slim export used | full export is 9.2 MB; slim function returns 500 locally, so the importer falls back to full | WGUI (local stack) | open ([WandersGuideUI #12](https://github.com/edmund-landgraf/WandersGuideUI/issues/12)) |
| A7 | Feat slots | Otherworldly Magic in Ancestry Feats 1 | Empty Slot | importer | open ([#26](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/26)) |
| A8 | Current HP | 15 / 15 fresh | 13 / 15 | importer | open ([#24](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/24)) |
| A9 | Tangle Vine twice | innate plus apparition | duplicate diagnostic | none | not a bug |
| A10 | Skills | WG skills trained | not imported | importer (by design) | tracked (#10) |
