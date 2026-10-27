# Class test: Summoner

Status: open. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world. Built as the campaign-42 GM test account.

## Character

- WG id 80, "Veshka Ashbound", level 1, joined to test campaign 42.
- Books: Player Core, Monster Core, GM Core, Impossible Magic (842). Summoner (class id 74) is in Impossible Magic, not Player Core 2.
- Elf (Whisper Elf), Feybound, Summoner with a Fey Eidolon.
- Choices: ancestry free boost Cha; language Fey; Feybound boosts Cha + Con; class skills Nature, Diplomacy, Deception, Occultism; class free boosts Cha, Con, Dex, Wis; Fey Eidolon; evolution feat Expanded Senses; Otherworldly Magic with the Shield cantrip. The eidolon's Deception/Nature were already trained, so WG offered replacements: Performance, Stealth.
- 0 open choices at the end.

## WG result

Str +0, Dex +2, Con +0, Int +1, Wis +1, Cha +3. HP 16, AC 15, Perception +4, Fort +5 (expert), Ref +5, Will +6 (expert), spell DC 16 (primal, Cha). Focus: Boost Eidolon, Evolution Surge. Innate: Shield. Slots: 5 cantrips, 1 rank-1.

## Foundry import

13 matched, 0 missed, 0 unresolved. HP, AC and saves match WG. The Eidolon and Evolution Feat prompts were answered from the WG selections. Re-imports came out identical. Skill selections were dropped (by design).

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| S1 | Con modifier | +1 (elf -1, Feybound +1, class free +1) | +0, so HP 16 not 17 | WGUI | open |
| S2 | Spell repertoire | choices for 5 cantrips + 2 rank-1 spells | slots exist, no choice offered, repertoire empty | WGUI / connector | open |
| S3 | Eidolon stat block | eidolon companion in the export and in Foundry | `companions` null; no eidolon actor | WGUI / importer | open |
| S4 | `set_identity` with a class outside the enabled books | rejected | reports "saved", stores nothing | connector | open |
| S5 | `export_character` over the MCP tool | returns JSON | ~4 MB export kills the local stdio server; the edge function works | connector | open |
| S6 | Feybound background skill/feat | needs a rules check | no skill or feat added | WGUI (verify) | open |
