# Class test: Exemplar

Status: open. Remaster Exemplar only (WG class 149, War of Immortals book 400; 85 is a second copy; playtest class 70 not used).

Runs:
- **Run A (2026-10-27, earlier):** Ilyra Starborn (WG 86), module on main at the time.
- **Run B (2026-10-27, 21:05-21:30 PDT):** Corwin Ashguard (WG 101) and Sylvaine Farshot (WG 102), importer `origin/main` **99297be** in detached worktree `D:\repos\fwi-main` (module junction swapped for the run, restored to `D:\repos\foundry-wanderersguide-import` after). Local WGUI as the campaign-42 GM test account, local Foundry world, PF2e 8.6.1. Each PC: import, page reload, re-import, reload.

Test prompt policy (Run B): the harness answered nothing itself. Ikon prompts were answered by the importer from WG. Every other PF2e prompt (WG has no answer) was screenshotted and closed, so it stays unresolved. No choice was guessed.

## Characters

### WG 86 Ilyra Starborn (Run A, regression for E1/E2)
- Elf (Woodland Elf), Martial Disciple, key Str. Class feat Vow of Mortal Defiance. Ikons: Gleaming Blade, Skin Hard as Horn, Victor's Wreath.
- WG: HP 17, AC 15, Perception +4, Fort +6, Ref +5, Will +6, class DC +6. Foundry matched all of these.
- Run A's test script answered 6 of 7 PF2e prompts by hand (2 ikon prompts, Gleaming Blade -> Weapon -> "Grant me a new item", Victor's Wreath -> "Grant me a new item"); the Gleaming Blade weapon pick did not register, so no blade was granted. Screenshots: `D:\tmp\wgui-newpc\86-sheet-after.png`, `86-feats.png`, `86-actions.png`, `86-import-report.png`.

### WG 101 Corwin Ashguard (Run B, test 1: "existing item" path)
- Human (Versatile Human, general feat Toughness), Martial Disciple (Str, free Con, Athletics -> Quick Jump), Exemplar key **Str**.
- Ancestry boosts Str, Con; language Empyrean; ancestry feat Cooperative Nature. Class skills Acrobatics, Intimidation, Medicine. Class free boosts Str, Dex, Con, Cha. Class feat Vow of Mortal Defiance.
- Ikons in WG order: **Gleaming Blade, Skin Hard as Horn, Mirrored Aegis**.
- Inventory: exactly one Longsword and one Steel Shield (nothing else).
- 0 open WG choices; joined campaign 42.

### WG 102 Sylvaine Farshot (Run B, test 2: "ambiguous" path)
- Elf (Woodland Elf), Hunter (Dex, free Wis, Survey Wildlife), Exemplar key **Dex**.
- Ancestry free boost Con; language Sylvan; ancestry feat Nimble Elf. Class skills Acrobatics, Stealth, Nature, Intimidation. Class free boosts Dex, Str, Con, Wis. Class feat Energized Spark (Fire).
- Ikons in WG order: **Unfailing Bow, Gaze Sharp as Steel, Thousand-League Sandals**.
- Inventory: Shortbow + Longbow (two bow candidates), no sandals.
- 0 open WG choices; joined campaign 42.

## Stats (WG vs Foundry, Run B; identical after reload and after re-import)

| | 101 WG | 101 Foundry | 102 WG | 102 Foundry |
|---|---|---|---|---|
| HP (max / current) | 22 | 22 / 22 | 17 | 17 / 17 |
| AC | 14 | 14 | 17 | 17 |
| Perception | +3 | +3 | +5 | +5 |
| Fort / Ref / Will | +8 / +4 / +5 | +8 / +4 / +5 | +6 / +7 / +7 | +6 / +7 / +7 |
| Class DC | +7 | +7 | +7 | +7 |
| Str/Dex/Con/Int/Wis/Cha | 4/1/3/0/0/1 | 4/1/3/0/0/1 | 1/4/1/1/2/0 | 1/4/1/1/2/0 |
| Key attribute (details) | Str | str | Dex | dex |

## Predictions vs result (Run B)

| Prediction (from research) | 101 | 102 |
|---|---|---|
| All 3 ikon prompts answered from WG | **PASS** (report: "prompt answered from WG selection" x3; firstIkon/secondIkon/thirdIkon = Gleaming Blade / Skin Hard as Horn / Mirrored Aegis) | **PASS** (Unfailing Bow / Gaze Sharp as Steel / Thousand-League Sandals) |
| Ikon item sub-choice answered only from a single inventory candidate, else unresolved | **FAIL**: Gleaming Blade "unarmed attack or weapon?" and Mirrored Aegis "Grant me a new item / Use an existing item" prompted; not answered although exactly one sword and one shield were in WG inventory. Listed unresolved (7 entries). No blade / shield bound. | **PASS (by accident)**: Unfailing Bow and Sandals origin prompted and listed unresolved (5 entries); nothing granted or defaulted. Correct outcome, but only because nothing is ever answered. |
| Inventory created before class/ikon grants | **FAIL**: console order `created class` -> ikon prompts -> `created feat` -> `created equipment`; the Longsword / Steel Shield did not exist on the actor when PF2e asked. | same order |
| Shift Immanence once | PASS (1 action, grantedBy Divine Spark and Ikons) | PASS |
| Transcendence actions once | PASS: Flowing Spirit Strike, Crash Against Me, Raise the Walls (each once, grantedBy their ikon) | PASS: Arrow Splits Arrow, A Moment Unending, Marathon Dash |
| Shield Block once | PASS with note: class feature Shield Block + feats-srd Shield Block granted by it (PF2e's own chain; report "expected PF2e grant relationship") | same |
| Spark Transcendence maps to PF2e source (covered by Divine Spark and Ikons), no homebrew | **FAIL**: created as homebrew feat (no compendium source) | **FAIL** |
| Feat slots (E1) | PASS: Cooperative Nature in ancestry-1, Vow of Mortal Defiance in class-1, Toughness under Versatile Human | PASS: Nimble Elf ancestry-1, Energized Spark (Fire) class-1 |
| Current HP on fresh import (E5) | PASS 22/22 | PASS 17/17 |
| Reload | PASS: 22 items before and after, same stats | PASS: 21 items, same stats |
| Re-import | PASS: one actor per WG id (same actor id), no new items, same unresolved list | PASS |
| Nothing defaulted | PASS (no granted ikon item, no weapon/unarmed guess) | PASS |

## Problems (all gaps)

| # | Problem | Evidence | Fix direction | State |
|---|---|---|---|---|
| E1 | Feat slots | Run A: no slot, "Empty Slot". Run B: ancestry-1 / class-1 correct on both PCs | none (fixed on main) | **fixed on main** (re-verified 101/102; [#26](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/26)) |
| E2 | Ikon prompts (firstIkon/secondIkon/thirdIkon) | Run A: only 1 of 3 auto-answered. Run B: 3 of 3 answered from WG on both PCs | keep: **ordered ikon assignment** - WG ikons in WG selection order, each consumed once (same shape needed for Commander tactics, Wizard curriculum, Runesmith repertoire). Add a regression test. | **passes on main 99297be** (re-verify before closing [#27](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/27)) |
| E3 | Ikon item sub-choices (unarmed/weapon, granted/existing, existingIkon, grantedIkon) | WG has no such questions. 101: 7 unresolved, prompts screenshotted (`101-r1-prompt-0.png`, `-1.png`) even with exactly one Longsword and one Steel Shield. 102: 5 unresolved (`102-r1-prompt-0.png`, `-1.png`) | **single-candidate owned-item answer, else unresolved**: if WG inventory has exactly one item matching the ikon's `existingIkon` ownedItems predicate, answer origin=`existing` (and `weapon` for unarmed-capable ikons) + that item's new actor id; 0 or >=2 candidates (102's two bows) or worn ikon not in inventory (102's sandals) -> leave unresolved with the candidate list; never pick `granted` or `unarmed` by default. | open ([WandersGuideUI #10](https://github.com/edmund-landgraf/WandersGuideUI/issues/10) for the WG side; importer part has no issue yet) |
| E4 | Spark Transcendence imported as a homebrew copy (importer bug) | Run A, 101, 102: report "1 created as homebrew or missed: feat: Spark Transcendence" (no compendium source). PF2e 8.6.1 has **no standalone item** named Spark Transcendence (no match for `"name": "Spark Transcendence"` in any pack); it is defined as the `<h3>Spark Transcendence</h3>` section of the description of `packs/pf2e/class-features/divine-spark-and-ikons.json` (Divine Spark and Ikons), and each ikon's transcendence action is its own action item (e.g. `actionspf2e` Flowing Spirit Strike, Arrow Splits Arrow), already granted. | Spark Transcendence **must import and must never be homebrew, skipped or dropped**. Importer fix: when a WG feature has no same-name PF2e item, look up at runtime whether a PF2e item already on the actor covers it (here Divine Spark and Ikons, by its description section / class-feature grant) and record WG's Spark Transcendence as **matched to Divine Spark and Ikons** (covered-by link in the import report), creating no copy. Resolve by name at runtime, no hard-coded UUID. If a future PF2e version adds its own item, map to it. If no PF2e source is found at all, record an unresolved "PF2e gap" note in the report, still no homebrew item. | open (importer bug) |
| E5 | Current HP on fresh import | Run A: 7/17. Run B: 22/22 and 17/17 | none | **fixed on main** (#24) |
| E6 | Skills | WG skill training selections are "dropped" by design in the coverage ledger | none here | tracked (#10) |
| E7 | Inventory created after class grants | console order: `created class` (ikon prompts fire here) -> `created feat` -> `created spell` -> `created equipment` | **inventory-before-grants**: create physical items before the class/ikon items (or defer ikon sub-choices until after equipment exists) so E3's single-candidate answer can point at a real actor item id | new, open |
| E8 | Duplicate detection across item types | Run B: Shift Immanence, transcendence actions, Shield Block each appear once, but only because WG lists them as feats and PF2e grants them; the shared fix still matters for other classes (Kineticist #52) | **grantedBy duplicate check across all item types** (action, feat, equipment), using `flags.pf2e.grantedBy`, as in #8. For worn ikons: if WG inventory already holds the item, answer `existing` instead of granting a second one. | new, preventive (no Exemplar duplicate seen) |
| E9 | Class item key attribute left unselected | class `system.keyAbility` = `{value:[dex,str], selected:null}` on 101 and 102, while `details.keyability` is str/dex and class DC is right. Coverage ledger: "WG chose Strength/Dexterity; not consumed by a PF2e ChoiceSet" (unresolved) | set the class item's `keyAbility.selected` from WG's key attribute choice (never default; missing -> unresolved). Same family as Psychic [#53](https://github.com/edmund-landgraf/foundry-wanderersguide-import/issues/53) | new, open |
| E10 | Human extra language unresolved | 101 coverage ledger: `ancestry_d363245a...` (Empyrean) "WG select answer with no PF2e target; review manually". 102's Elf language (Sylvan) did not show this | check where PF2e 8.6.1 stores the Human additional language and map the WG answer there | new, open (not Exemplar-specific) |
| E11 | Root epithet name (L3+) | WG "Brave" vs PF2e "The Brave" (research; not testable at L1) | **epithet "The " prefix** normalisation when matching (prefix, not suffix) | later (test at level 3) |
| E12 | Gleaming Blade weapon pick did not register (Run A) | Run A only; test script likely passed a label where the grantedIkon prompt needs a compendium uuid | test-harness note, not importer | not reproduced in Run B (prompt intentionally closed) |

## Screenshots

On DAEDALUS `D:\tmp\wgui-newpc\` (`r1` = first import, `r2` = re-import):
- 101: `101-r1-sheet.png`, `101-r1-inventory.png`, `101-r1-feats.png`, `101-r1-actions.png`, `101-r1-import-report.png`, `101-r1-prompt-0.png` (Gleaming Blade unarmed/weapon), `101-r1-prompt-1.png` (Mirrored Aegis origin); same set as `101-r2-*`.
- 102: `102-r1-sheet.png`, `102-r1-inventory.png`, `102-r1-feats.png`, `102-r1-actions.png`, `102-r1-import-report.png`, `102-r1-prompt-0.png` (Unfailing Bow origin), `102-r1-prompt-1.png` (Sandals origin); same set as `102-r2-*`.
- Data: `10x-r1-actor.json`, `10x-r1-after-reload.json`, `10x-r1-report.txt` (and r2). Run A: `86-*.png`.
