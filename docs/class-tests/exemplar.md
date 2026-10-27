# Class test: Exemplar

Status: open. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module on main). Built as the campaign-42 GM test account.

## Character

- WG id 86, "Ilyra Starborn", level 1, joined to test campaign 42.
- Books: Player Core, Monster Core, GM Core, War of Immortals (400). Exemplar (class id 149) is in War of Immortals (book 400; 85 is a second copy). There is also a playtest copy (70), which was not used.
- Elf (Woodland Elf), Martial Disciple, Exemplar. Not a caster.
- Choices:
  - Ancestry: free boost Wis; language Empyrean; Elven Weapon Familiarity.
  - Martial Disciple: boosts Str + Con, skill Athletics (grants Quick Jump).
  - Class: key attribute Str; class skills Acrobatics, Intimidation, Medicine, Diplomacy; free boosts Str, Dex, Con, Cha; class feat Vow of Mortal Defiance.
  - Ikons: Gleaming Blade, Skin Hard as Horn, Victor's Wreath.
- 0 open choices at the end. No epithet at level 1.

## WG result

Str +3, Dex +2, Con +1, Int +1, Wis +1, Cha +1. HP 17 (elf 6 + class 10 + Con 1), AC 15, Perception +4, Fort +6 (expert), Ref +5, Will +6 (expert), class DC +6 (Str). Trained: Acrobatics, Athletics, Diplomacy, Intimidation, Medicine, Religion, Warfare Lore. Features: Divine Spark and Ikons, Humble Strikes, Shift Immanence, Spark Transcendence, Shield Block. Languages: Common, Elven, Empyrean.

## Foundry import

12 matched, 1 created as homebrew (Spark Transcendence). HP 17, AC 15, Fort 6, Ref 5, Will 6, Perception 4, class DC 6 match WG. The three ikons are under Divine Spark and Ikons, with their actions: Shift Immanence, Flowing Spirit Strike, Crash Against Me and One Moment till Glory. The Victor's Wreath item was granted. Seven PF2e prompts opened, and the test script answered six of them:

- 2 of the 3 ikon prompts (the third was answered from WG);
- Gleaming Blade -> Weapon, then "Grant me a new item";
- Victor's Wreath -> "Grant me a new item".

The Gleaming Blade weapon pick did not register, so PF2e dropped that choice and no blade was granted.

Screenshots (`D:\tmp\wgui-newpc\`): `86-sheet-after.png`, `86-feats.png`, `86-actions.png`, `86-import-report.png`.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| E1 | Feat slots | Elven Weapon Familiarity in Ancestry Feats 1, Vow of Mortal Defiance in Class Feats 1 | on the actor with no slot; sheet shows "Empty Slot" for both | importer | open ([#26](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/26)) |
| E2 | Ikon prompts | all 3 "Select an ikon" prompts answered from the 3 WG ikon selections | first 2 prompt the user; only the last resolves (uniqueChoice needs a single legal WG answer) | importer | open ([#27](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/27)) |
| E3 | Ikon sub-choices | Gleaming Blade unarmed/weapon + which weapon, Victor's Wreath item, known from WG | WG never asks; 4 PF2e prompts; listed as unresolved | WGUI (verify rules) | open ([WandersGuideUI #10](https://github.com/edmund-landgraf/WandersGuideUI/issues/10)) |
| E4 | Spark Transcendence | PF2e item | homebrew feat; no item by that name in PF2e 8.6.1 packs (likely covered by Divine Spark and Ikons text) | none (verify) | not a bug (verify) |
| E5 | Current HP | 17 on a fresh import | sheet shows 7 / 17 | importer (verify) | open (#24) |
| E6 | Skills | WG skills trained in Foundry | only Athletics, Religion | importer (by design) | tracked (#10) |
