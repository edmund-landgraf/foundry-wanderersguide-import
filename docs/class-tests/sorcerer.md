# Class test: Sorcerer

Status: open (stats match; bloodline prompt unanswered). Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module main at 70e597e). Built as the campaign-42 GM test account.

## Character

- WG id 96, "Ysolde Emberveil", level 1, joined to test campaign 42.
- Books: default plus Player Core 2 (256). Sorcerer is class 113; Sorcerer (legacy) 45 was not used.
- Goblin (Unbreakable Goblin), Noble, Sorcerer.
- Choices:
  - Ancestry: free boost Con; Burn It!.
  - Noble: boosts Cha + Dex, Heraldry Lore (Courtly Graces).
  - Class: skills Deception, Intimidation; free boosts Cha, Dex, Con, Str.
  - Bloodline: **Imperial** (bloodline skill Arcana). Focus spell Ancestral Memories.
  - Repertoire (set_spells, SORCERER SPONTANEOUS-REPERTOIRE): Daze, Detect Magic, Electric Arc, Shield, Telekinetic Projectile; Force Barrage, Fear, Sleep. 5 cantrip and 3 rank-1 slots. WG has no signature-spell choice at level 1.
- 0 open choices at the end.

## WG result

Str +1, Dex +3, Con +2, Int +0, Wis -1, Cha +4. HP 18, AC 16, Perception +2, Fort +5, Ref +6, Will +4 (expert), class DC +7, spell DC 17 / attack +7 (Cha, arcane). Feats: Courtly Graces, Burn It!, Imperial Bloodline; features Bloodline, Sorcerer Spellcasting, Sorcerous Potency, Spell Repertoire. Focus: Ancestral Memories.

## Foundry import

On main (70e597e) the stats **match WG**: attributes, HP 18/18, AC 16, Perception +2, Fort +5, Ref +6, Will +4, class DC +7. Sorcerer Spells has the 8-spell repertoire; Sorcerer Focus Spells has Ancestral Memories.

15 matched, 1 homebrew (**Imperial Bloodline**). The PF2e **Bloodline** prompt (options "Bloodline: Imperial" and others) was not answered from WG, so Bloodline shows "?" on the sheet. Ledger: Noble's Heraldry Lore not consumed.

Screenshots (`D:\tmp\wgui-newpc\`, copies in `/workspace/wgui-newpc/`): `96-sheet-after.png`, `96-feats.png`, `96-actions.png`, `96-spells-after.png`, `96-import-report.png`.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| S1 | Bloodline | Imperial pre-filled from WG | prompt unanswered; WG feat is homebrew | importer | open ([#50](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/50)) |
| S2 | Noble lore | Heraldry Lore consumed | unresolved in the ledger | importer | noted in [#50](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/50) |