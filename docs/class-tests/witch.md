# Class test: Witch

Status: open. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module main at 8882a16). Built as the campaign-42 GM test account.

## Character

- WG id 91, "Hesper Nightbloom", level 1, joined to test campaign 42.
- Books: Player Core, plus the default extras. Witch is class 27.
- Gnome (Wellspring Gnome, tradition Occult, cantrip Telekinetic Hand), Hermit, Witch.
- Choices:
  - Ancestry: free boost Int. Extra languages Sylvan, Aklo, Draconic, Elven. Ancestry feat Fey Fellowship.
  - Hermit: boosts Int + Con, skill Occultism, Lore (Dubious Knowledge).
  - Class: skills Arcana, Nature, Medicine, Stealth, plus Int skills Religion, Society, Survival. Free boosts Int, Con, Dex, Wis.
  - Patron: **Spinner of Threads** (patron skill Deception). Hex cantrip Nudge Fate. Familiar spell Phase Familiar.
  - Spells (set_spells, source WITCH, PREPARED-LIST): familiar knows 10 cantrips (Daze, Detect Magic, Figment, Guidance, Light, Message, Prestidigitation, Read Aura, Shield, Telekinetic Projectile) and 5 rank-1 spells (Charm, Command, Fear, Phantom Pain, Sleep). Prepared: Daze, Detect Magic, Prestidigitation, Shield, Telekinetic Projectile; Command, Sleep.
  - **Familiar abilities: WG never asks for them.**
- 0 open choices at the end.

## WG result

Str -1, Dex +1, Con +3, Int +4, Wis +1, Cha +1. HP 17, AC 14, Perception +4, Fort +6, Ref +4, Will +6 (expert), class DC +7, spell DC 17 / attack +7 (Int, occult). Feats: Dubious Knowledge, Fey Fellowship, Spinner of Threads; features Familiar, Hex Spells, Patron, Witch Spellcasting; heritage Wellspring Gnome. Focus: Nudge Fate, Phase Familiar. Innate: Telekinetic Hand.

## Foundry import

On main (8882a16, which includes the #30 fix from #34) the import **matches WG** on attributes, HP 17/17, AC 14, Perception +4, Fort +6, Ref +4, Will +6, class DC +7 and spell DC 17. 26 matched, 0 homebrew. Witch Spells has the 10 + 5 list with 5 cantrips and 2 rank-1 prepared; Witch Focus Spells has Nudge Fate and Phase Familiar; innate Telekinetic Hand. Languages imported (Common, Fey, Gnomish, Aklo, Draconic, Elven).

The separate "#30 fix" run was not needed: #30 is closed and the fix is on main.

Unresolved in the ledger (2): the familiar-spell selection (Phase Familiar, "no PF2e target", though the spell is present) and Wellspring Gnome's tradition (Occult, not consumed by a ChoiceSet). Both are the nested-choice gap in [#8](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/8).

Screenshots (`D:\tmp\wgui-newpc\`, copies in `/workspace/wgui-newpc/`): `91-sheet-after.png`, `91-feats.png`, `91-actions.png`, `91-spells-after.png`, `91-import-report.png`.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| W1 | Familiar abilities | WG asks for familiar/master abilities | no choice offered; nothing exported | WGUI | open ([WandersGuideUI #15](https://github.com/edmund-landgraf/WandersGuideUI/issues/15)) |
| W2 | Nested answers | familiar spell and Wellspring tradition consumed | listed as unresolved; results still correct | importer | open ([#8](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/8)) |