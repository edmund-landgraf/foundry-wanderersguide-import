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
## Retest 2026-10-27: Liesl Starwhisper (103), Desna, on origin/main 7d96f4f

Aldric (93) was left untouched. New level-1 Cleric built on local WGUI as fwi.gm@tester.com and joined to campaign 42.

- Human (Skilled Human: Stealth), Acolyte, Cleric. Boosts: ancestry Wis/Con, background Wis/Cha, free Wis/Dex/Con/Cha. Language Elven. Ancestry feat Cooperative Nature.
- Deity (WG `details.info.beliefs`): Desna. Deity skill Acrobatics, favored weapon Starknife, sanctification Holy.
- Healing Font; Cloistered Cleric Doctrine; Domain Initiate: Luck (Bit of Luck).
- Spells: CLERIC Divine Lance, Shield, Light, Guidance, Stabilize; Bless, Heal. CLERIC_DIVINE_FONT: Heal x4. Inventory: Starknife.
- `npm test`: 85/86 pass. The one failure is the Exemplar inventory-order test (#59), which passes a Buffer where it needs a string; it is not Cleric-related.

| Check | Result |
|---|---|
| No hang (#42) | PASS: both imports finished, about 2 min each |
| Deity from WG beliefs | PASS: Deity (Cleric) answered "Desna (prompt answered from WG deity)", with no harness pick |
| Sanctification | PASS: Holy, from WG |
| Doctrine | PASS: Cloistered Cleric |
| Domain | PASS with a report bug: Domain Initiate (Luck) has `domainInitiate: luck`, but the report also lists Domain Initiate as unresolved |
| Divine font | PASS: Divine Font (Healing), `divineFont: heal` |
| Spells | PASS: 5 cantrips, Bless, Heal; focus Bit of Luck; DC 17, attack +7 (matches WG) |
| Stats vs WG | PASS for attributes, HP 18, AC 14, Perception +7, saves +5/+4/+9 and key Wis. FAIL for skills: Acrobatics (deity) +1 vs WG +4, Diplomacy +2 vs +5, Medicine +4 vs +7, Stealth untrained (Skilled Human prompt unresolved) |
| Reload | PASS: same values, 28 items |
| Re-import | PASS: one actor, 28 items, no duplicates |

Gaps:
- CL5: The Skilled Human skill prompt is not answered from WG's Stealth selection.
- CL6: Skill trainings are dropped ("skills are not imported"), so the deity skill (Acrobatics) and class skills (Diplomacy, Medicine) end up untrained in Foundry.
- CL7: "Healing Font" and "Domains" are created as homebrew/missed. They duplicate Divine Font (Healing) and Domain Initiate.
- CL8: The import report lists Domain Initiate as unresolved even though it was answered (Luck).

CL2 and CL3 (#42) are fixed on main. CL1 is worked around through WG beliefs.

Screenshots in `D:\tmp\wgui-newpc\`: `103-r1-*` (first import) and `103-r2-*` (re-import): sheet, inventory, feats, actions, import-report, prompt-0.
