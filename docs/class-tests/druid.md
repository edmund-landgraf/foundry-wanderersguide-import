# Class test: Druid

Status: open (stats match; duplicate homebrew feats). Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module main at 1c8b773). Built as the campaign-42 GM test account.

## Character

- WG id 94, "Wren Thornhollow", level 1, joined to test campaign 42.
- Books: default (1, 8, 7). Druid is class 23.
- Elf (Woodland Elf), Animal Whisperer, Druid.
- Choices:
  - Ancestry: free boost Wis; language Sylvan; Nimble Elf.
  - Animal Whisperer: boosts Wis + Con, skill Survival, Lore (Train Animal).
  - Class: skills Athletics, Medicine, Stealth; free boosts Wis, Con, Dex, Str.
  - Order: **Animal Order** (order skill Acrobatics since Athletics was already trained). Voice of Nature: Animal Empathy. Order spell Heal Animal.
  - **Animal companion: WG never asks for the companion type** and exports none.
  - Spells (set_spells, DRUID PREPARED-TRADITION): Electric Arc, Tangle Vine, Guidance, Stabilize, Light; Heal, Summon Animal.
- 0 open choices at the end.

## WG result

Str +1, Dex +2, Con +1, Int +1, Wis +4, Cha +0. HP 15, AC 15, Perception +7, Fort +4, Ref +5, Will +9 (expert), class DC +7, spell DC 17 / attack +7 (Wis, primal). Feats: Shield Block, Train Animal, Animal Companion (Druid), Animal Empathy (Druid), Nimble Elf, Animal Order. Focus: Heal Animal.

## Foundry import

On main (1c8b773) the stats **match WG**: attributes, HP 15/15, AC 15, Perception +7, Fort +4, Ref +5, Will +9, class DC +7. Druidic Order (Animal Order) and Voice of Nature (Animal Empathy) prompts were answered from WG. Druid Spells has the 5 cantrips and Heal, Summon Animal; Druid Focus Spells has Heal Animal.

16 matched, 2 homebrew: **Animal Companion (Druid)** and **Animal Empathy (Druid)**. PF2e already grants Animal Companion and Animal Empathy, so both appear twice. No companion actor is created (WG exports none).

Screenshots (`D:\tmp\wgui-newpc\`, copies in `/workspace/wgui-newpc/`): `94-sheet-after.png`, `94-feats.png`, `94-actions.png`, `94-spells-after.png`, `94-import-report.png`.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| D1 | Duplicate feats | WG "(Druid)" feats matched to PF2e grants | 2 homebrew duplicates | importer | open ([#43](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/43)) |
| D2 | Animal companion | companion type chosen and exported | no choice; nothing exported | WGUI | open ([WandersGuideUI #8](https://github.com/edmund-landgraf/WandersGuideUI/issues/8), companion export) |