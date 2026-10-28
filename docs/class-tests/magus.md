# Class test: Magus

Status: open (stats match; hybrid study prompt unanswered). Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world (PF2e 8.6.1, module branch fix/cleric-domain-prompt at 70e597e, not main). Built as the campaign-42 GM test account.

## Character

- WG id 97, "Kael Ironsong", level 1, joined to test campaign 42.
- Books: default plus 842 (Magus is class 77).
- Orc (Hold-Scarred Orc, Diehard), Martial Disciple, Magus.
- Choices:
  - Ancestry: free boosts Str, Con; language Goblin; Orc Ferocity.
  - Martial Disciple: boosts Str + Dex, skill Athletics (Quick Jump).
  - Class: key attribute Str; skills Acrobatics, Intimidation, Stealth; free boosts Str, Int, Con, Dex.
  - Hybrid study: **Inexorable Iron** (conflux spell Thunderous Strike). Arcane Cascade and Spellstrike granted.
  - Spells (set_spells, MAGUS PREPARED-LIST): spellbook Shield, Electric Arc, Frostbite, Gouging Claw, Detect Magic, Light, Ignition, Telekinetic Projectile; Force Barrage, Mystic Armor, Thunderstrike, Breathe Fire. Prepared: 5 cantrips and Thunderstrike. WG's slot list shows 5 cantrips, 1 rank-1, and a rank-2 entry with amount null. There is no separate studious-spells source.
  - Inventory: Longsword (item 7090), added with the new `add_inventory_item` tool. The tool is only in the `D:\repos\wgui-inv` worktree (`feat/mcp-inventory-tools`); the main WGUI checkout has uncommitted work and was not pulled.
- 0 open choices at the end.

## WG result

Str +4, Dex +2, Con +2, Int +1, Wis +0, Cha +0. HP 22, AC 15, Perception +3, Fort +7 (expert), Ref +5, Will +5 (expert), class DC +7, spell DC 14 / attack +4 (Int, arcane). Feats: Diehard, Quick Jump, Arcane Cascade, Spellstrike, Orc Ferocity, Inexorable Iron Hybrid Study; features Arcane Cascade, Conflux Spells, Hybrid Study, Magus Spellcasting, Spellstrike. Focus: Thunderous Strike.

## Foundry import

On fix/cleric-domain-prompt (70e597e) the stats **match WG**: attributes, HP 22/22, AC 15, Perception +3, Fort +7, Ref +5, Will +5, class DC +7. Arcane Cascade and Spellstrike import as features and actions. Magus Spells has the 12-spell book; Magus Focus Spells has Thunderous Strike. The Longsword is in the inventory.

23 matched, 1 homebrew (**Inexorable Iron Hybrid Study**). The PF2e **Hybrid Study** prompt (option "Inexorable Iron") was not answered from WG, so Hybrid Study shows "?" on the sheet. Ledger: key attribute "WG chose Strength; not consumed by a PF2e ChoiceSet" (class DC is still correct).

Screenshots (`D:\tmp\wgui-newpc\`, copies in `/workspace/wgui-newpc/`): `97-sheet-after.png`, `97-feats.png`, `97-actions.png`, `97-spells-after.png`, `97-import-report.png`.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| M1 | Hybrid study | Inexorable Iron pre-filled from WG | prompt unanswered; WG feat is homebrew | importer | open ([#50](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/50)) |
| M2 | Key attribute | Str consumed | unresolved in the ledger (stats correct) | importer | noted in [#50](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/50) |
| M3 | Slot list | magus level-1 slots | rank-2 slot entry with amount null in list_spell_options | WGUI connector | noted |