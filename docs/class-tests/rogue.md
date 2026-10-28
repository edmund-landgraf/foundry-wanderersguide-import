# Class test: Rogue

Status: **partial**. Import, reload and re-import pass. The class item's key attribute stays Dex for Str and Int rackets. Tested 2026-10-28 on local WGUI and the local Foundry world (PF2e 8.6.1). The module junction pointed at `D:\repos\foundry-wanderersguide-import` on branch `codex/seed-rule-registry` (571918b plus uncommitted changes from the other worker), not main. Built as the campaign-42 GM test account.

## Character

- WG id 111, "Sable Knucklebone", level 5, joined to test campaign 42. Books 1, 8, 7.
- Dwarf (Rock Dwarf), Criminal (Experienced Smuggler), Rogue (class 25).
- Racket **Ruffian** (34057) with key attribute **Strength** and racket skill Intimidation.
- Feats: Rock Runner, Mountain Strategy, Twin Feint, Brutal Beating, Mug, Intimidating Glare, Quick Jump, Titan Wrestler, Cat Fall, Combat Climber.
- Shortsword, Sap, Leather Armor, Thieves' Toolkit. 0 open choices before import.

## Foundry result (r1)

Str +4, Dex +3, Con +3, Wis +3, Int 0, Cha -1. HP 65, AC 20, class DC +11 (Str). Actor `keyability` str, but class item `keyAbility` `{value:["dex"], selected:"dex"}`. Rogue's Racket prompt answered with Ruffian. 19 matched, 1 missed (Ruffian Racket). No spellcasting entries.

## Checks

| Check | Result |
|---|---|
| Import (r1) | PASS with problems (R1, R2, R3) |
| Reload | PASS: same HP, AC, key, items (26) |
| Re-import (r2) | PASS: one actor, 26 items, no duplicates |
| Key attribute (non-Dex) | PARTIAL: actor str and class DC from Str; class item still dex (R1) |
| Changed choice (r3: Ruffian -> Mastermind, key Int, skills Society/Occultism) | PARTIAL: racket, Int boost, class DC +8 and Occultism selection applied; class item still dex; "Mastermind Racket" unresolved. WG then had 2 new open choices (language, skill) from the Int boost; imported with them open |
| Level change | NOT RUN: the WG tactics MCP has no tool to change a character's level |

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| R1 | Class item key attribute | str (r1) / int (r3) | dex both times; ledger "WG chose Strength; not consumed" | importer | new issue (draft); related #53 |
| R2 | WG "X Racket" feat | matched/folded into the answered prompt | "Ruffian Racket" / "Mastermind Racket" unresolved | importer | new issue (draft); pattern of #50 |
| R3 | Dwarf Clan Weapon prompt | Clan Dagger from WG | unanswered, closed by harness | importer | known (#22) |

## Files

On DAEDALUS `D:\tmp\wgui-newpc\`: `111-r1-*`, `111-r2-*`, `111-r3-*` (actor.json, after-reload.json, report.txt, prompt-0, sheet, inventory, feats, actions, import-report). Build logs in `fg\w1`-`w11`, import logs `fg\imp-111-r*.log`.