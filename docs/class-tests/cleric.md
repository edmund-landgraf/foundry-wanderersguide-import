# Class test: Cleric

Status: **fails** (import hangs). Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module main at 1c8b773). Built as the campaign-42 GM test account.

## Character

- WG id 93, "Aldric Vane", level 1, joined to test campaign 42.
- Books: default (1, 8, 7). Cleric is class 22. Human (id 8) was rejected by set_identity as NOT_IN_BOOKS, so the ancestry is Dwarf.
- Dwarf (Rock Dwarf), Acolyte, Cleric.
- Choices:
  - Ancestry: free boost Str; Rock Runner. Clan Dagger granted.
  - Acolyte: boosts Wis + Con, skill Society (Student of the Canon).
  - Class: skills Diplomacy, Athletics; free boosts Wis, Con, Dex, Str.
  - Deity feature: divine skill Medicine, favored weapon Scimitar, sanctification Holy. **WG never asks for a deity** (as for Champion).
  - Divine font: Healing Font. Doctrine: **Cloistered Cleric**. Domain: Healing, domain spell Healer's Blessing.
  - Spells (set_spells): CLERIC prepared Divine Lance, Shield, Guidance, Stabilize, Light; Bless, Command. CLERIC_DIVINE_FONT: Heal x4.
- 0 open choices at the end.

## WG result

Str +2, Dex +1, Con +3, Int +0, Wis +4, Cha -1. HP 21, AC 14, Perception +7, Fort +6, Ref +4, Will +9 (expert), class DC +7, spell DC 17 / attack +7 (Wis, divine). Feats: Student of the Canon, Domain Initiate, Healing Font, Rock Runner, Cloistered Cleric Doctrine; features Cleric Spellcasting, Deity, Divine Font, Doctrine. Focus: Healer's Blessing.

## Foundry import

The import **never finishes**. Ancestry (Clan Weapon answered), heritage and background are built. While building the class:

- Deity (Cleric) has nothing to answer from; the test harness picked the first deity.
- Doctrine (Battle Creed / Cloistered Cleric / Warpriest) is not answered from WG's "Cloistered Cleric Doctrine".
- Domain Initiate shows "Select a deity's domain." with no options, and the import hangs there.

No actor stats to compare. Screenshot (`D:\tmp\wgui-newpc\`, copy in `/workspace/wgui-newpc/`): `93-hang.png`.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| CL1 | Deity | deity from WG | WG has no deity choice | WGUI | open ([WandersGuideUI #11](https://github.com/edmund-landgraf/WandersGuideUI/issues/11), same gap as Champion) |
| CL2 | Doctrine | Cloistered Cleric from WG | prompt not answered | importer | open ([#42](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/42)) |
| CL3 | Domain Initiate | Healing / Healer's Blessing from WG | no options without a deity; import hangs | importer | open ([#42](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/42)) |
| CL4 | Human not in books | Human usable with Player Core | list_options lists Human 8, set_identity says NOT_IN_BOOKS | WGUI connector | noted (related to [WandersGuideUI #7](https://github.com/edmund-landgraf/WandersGuideUI/issues/7)) |