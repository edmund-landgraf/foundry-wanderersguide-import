# Class test: Wizard

Status: **partial**. Import, reload and re-import pass and spells come through. The school/thesis feat answers are not applied correctly, and the changed choice carries over a stale selection. Tested 2026-10-28 on local WGUI and the local Foundry world (PF2e 8.6.1). The module junction pointed at `D:\repos\foundry-wanderersguide-import` on branch `codex/seed-rule-registry` (571918b plus uncommitted changes from the other worker), not main. Built as the campaign-42 GM test account.

## Character

- WG id 110, "Aldric Vellum", level 5, joined to test campaign 42. Books 1, 8, 7.
- Gnome (Umbral Gnome), Scholar, Wizard (class 26).
- Choices: Int key; Gnome Obsession (Academia Lore), Illusion Sense; School of Battle Magic; thesis Experimental Spellshaping (sub-picks Reach Spell, Widen Spell); feats Reach Spell, Cantrip Expansion (Wizard); skill feats Arcane Sense, Dubious Knowledge, Recognize Spell; languages Draconic, Elven, Fey, Aklo.
- WG has no Arcane Bond choice (PF2e's Arcane Bond item comes through with no selection).
- Spellbook (set_spells, WIZARD PREPARED-LIST): cantrips Daze, Detect Magic, Electric Arc, Shield, Telekinetic Projectile, Light; rank 1 Force Barrage, Mystic Armor, Sure Strike, Grease; rank 2 Blur, Mist, Resist Energy; rank 3 Fireball, Lightning Bolt, Haste. Prepared: 5 cantrips, Force Barrage / Mystic Armor / Sure Strike, Blur / Mist / Resist Energy, Fireball / Lightning Bolt and **Force Barrage heightened to rank 3**.
- Staff in the inventory. 0 open choices before import.

## Foundry result (r1)

Int +4, Dex +3, Con +3, Wis +2, Cha +1, Str -1. HP 53, AC 20, class DC +11. Key attribute int on the actor and on the class item (`selected: int`). Wizard Spells (prepared, arcane) DC 21 / attack +11 with all 16 book spells; Wizard Focus Spells: Force Bolt; Innate Spells: Detect Magic (Arcane Sense). Languages Common, Gnomish, Fey, Draconic, Elven, Aklo. 35 matched, 2 missed (Drain Bonded Item, Cantrip Expansion (Wizard)).

## Checks

| Check | Result |
|---|---|
| Import (r1) | PASS with problems: stats, key attribute and spells right; W1-W4 below |
| Reload | PASS: same HP, AC, key, item count (46) |
| Re-import (r2) | PASS: one actor, 46 items, same result |
| Spells | PASS: book complete, heightened prepared Force Barrage present at rank 3 (as a second item, W4) |
| Key attribute | PASS: int / int |
| Changed choice (r3: Battle Magic -> Unified Magical Theory, bonus feat Counterspell) | FAIL: school and focus spell (Hand of the Apprentice) switched, but the school got the stale Widen Spell selection; W5 |
| Level change | NOT RUN: the WG tactics MCP has no tool to change a character's level (only create_character) |

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| W1 | Experimental Spellshaping sub-picks | Reach Spell and Widen Spell | Widen Spell only; "kept PF2e's rule" | importer | new issue (draft) |
| W2 | Cantrip Expansion (Wizard) | matched to Cantrip Expansion | unresolved, not defaulted | importer | new issue (draft) |
| W3 | Drain Bonded Item | matched | missed | importer | new issue (draft) |
| W4 | Heightened prepared spell | one Force Barrage, prepared at rank 3 | two items; report says "unexpected duplicate" | importer | new issue (draft) |
| W5 | Changed school bonus feat | Counterspell on Unified Magical Theory | school gets Widen Spell (stale); Counterspell unresolved; Experimental Spellshaping prompt empty | importer | new issue (draft) |
| W6 | Scholar Assurance | as WG | WG Society/Occultism vs PF2e Arcana, kept PF2e | importer | known (#22) |

## Files

On DAEDALUS `D:\tmp\wgui-newpc\`: `110-r1-*`, `110-r2-*`, `110-r3-*` (actor.json, after-reload.json, report.txt, sheet, inventory, feats, actions, import-report). Build logs in `fg\w1`-`w11`, import logs `fg\imp-110-r*.log`.