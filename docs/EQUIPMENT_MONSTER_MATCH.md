# Getting equipment and monsters to about 90%

Counts below the fold are from local `PathfinderUtil` (`pf2.Equipment`, `pf2.Monster`) compared with `wgi_rules.pf2e_catalog_entries` on 2026-10-31. A hit is a normalized name: lower case, apostrophes removed, every other non-letter collapsed to a space. Level is checked only after the name hits.

`matchEntries` now tries `catalogLookupNames` in order against `pf2e_catalog_entries` (`item_kind` `equipment` or `npc`). The first phrase that hits exactly one row wins. Two rows stay unresolved. Material and grade are stored beside a precious-material match. `wg_pf2e_catalog_matches` is not rebuilt for this.

Scored again on 2026-11-01 with that gate, against the same PathfinderUtil tables:

| Source | Rows | Matched | Rate |
|---|---:|---:|---:|
| Equipment | 9,865 | 7,735 | 78.4% |
| Monster | 7,961 | 5,990 | 75.2% |

Equipment phrases are unique in the catalog, so the one-row rule does not drop equipment hits. This is 60 below the 7,795 rewrite dry run because those phrases are not in the current catalog. Creatures are below the 6,166 dry run because 154 names phrase to two catalog documents and stay unresolved. The alias list is still what closes the gap to 90%.

| Source | Rows | Exact name | Rate | Rows needed for 90% |
|---|---:|---:|---:|---:|
| Equipment | 9,865 | 7,637 | 77% | 8,879 |
| Monster | 7,961 | 5,556 | 70% | 7,165 |

Apply the rewrites below in the matcher, before the catalog lookup. Do not insert a second copy of the Foundry row. Keep the original PF2 name on the source row and store the rewrite as the match key.

## Equipment

Automatic rewrites, in this order, stop at the first catalog hit.

1. **Exact name.** Already 7,637 rows.
2. **Drop a trailing parenthetical only when the remainder is an exact catalog name.** This adds 114 rows (78.6%). `Barding (Light)` can match `Barding`. `Barding (Light; Large)` does not, and must stay unmatched. 605 other parentheticals still miss after the strip. Do not strip those.
3. **Scroll rank alias.** `1st-rank Scroll` and `1st-Level Scroll` are the Foundry item `Scroll of 1st-rank Spell`, and the same for ranks 2 through 10. That is 23 rows.

After those three rules the rate is about **79%** (7,774). The next block is what closes the gap to 90%.

4. **Precious-material grade is not part of the name.** 193 rows look like `Abysium Armor (High-Grade)`. Foundry stores the base item plus `system.material.type` and `system.material.grade`. Match the base item (`armor`, `shield`, `weapon`, `buckler`, or the named weapon) and record the material and grade beside the match. Count the row as matched only when that base item exists. This is the same split `scripts/mapping.js` already does for a Wanderer's Guide item name.
5. **Reviewed aliases for the rest.** About 1,100 further rows are required. They are in the 1,316 unmatched names with no parenthetical and the 605 parentheticals whose remainder is not a catalog name. Examples: `Alchemist's Tools`, `Artisan's Tools`, `Unarmored`, `Ablative Armor Plating`. Add them to `compendium_match_aliases` with `item_kind = 'equipment'`, one evidence note each. Do not fuzzy-match. A duplicate PF2 row with the same normalized name as a row that already matched should not be aliased again. It should count as the same match.

Rules 4 and 5 are the difference between 79% and 90%. Rule 4 is safe if the base item is real. Rule 5 is a list, not a regex.

## Monsters

Automatic rewrites, in this order.

1. **Exact name.** Already 5,556 rows.
2. **Drop a trailing parenthetical only when the remainder is an exact catalog name.** This adds 159 rows. `Abrikandilu (PFS)` matches when `Abrikandilu` exists. 75 parentheticals still miss, mostly `(Playtest)` and `(Level N)`. Leave those unmatched.
3. **Elite and Weak are adjustments, not names.** 284 unmatched rows start with `Elite ` or `Weak `. Strip that word and match the base creature. Store the adjustment on the match. Foundry's goblin warrior is `Goblin Warrior`, not `Elite Goblin Warrior`.
4. **Dragon age sits in parentheses.** PF2 says `Adult Black Dragon`. Foundry says `Black Dragon (Adult)`. Rewrite `(Wyrmling|Young|Adult|Ancient|Old) <color or metal> Dragon` to `<color or metal> Dragon (<Age>)`, and the same with `Spellcaster` kept as a second parenthetical when it is present. Up to 200 unmatched names contain "dragon". Only count a row when the rewritten name exists. Spellcaster files are separate documents (`Black Dragon (Adult, Spellcaster)` or a dedicated file). Check the catalog rather than assuming one pattern.

If every dragon rewrite and every elite or weak strip hits, the rate is about **78%** (6,199). That is the ceiling of the mechanical rules.

The remaining gap to 7,165 is about **970 rows**. They are named adventure NPCs and one-off creatures (`Aadrushian`, `Adney Tinhill`, `10-foot Matryoshka`) that have no Foundry document under another spelling. Two ways to treat them:

- **Alias the ones that are a rename** of a catalog creature, the same way as equipment, with evidence. Quoted names such as `“Fenfang”` belong here only when the unquoted name, or another catalog name, is the same creature.
- **Take the rest out of the denominator.** A creature with no Foundry document cannot be matched to 90% by a better normalizer. Report two rates: matched among rows that have a catalog candidate, and unmatched because the pack has no such creature.

90% of all 7,961 monster rows is only realistic if most of those 970 named NPCs are either aliases or removed from the score. The rewrites in steps 2 through 4 should land first. They do not require a new table.

## What not to do

- Do not lowercase-contains match. `Wolf` inside `Werewolf` is a false hit.
- Do not strip every parenthetical. A remainder that is not itself a catalog name is a different creature or a different item.
- Do not rebuild `wg_pf2e_catalog_matches` for this. That table does not contain equipment grades or creatures. These rules belong in the matcher that reads `pf2e_catalog_entries`, and the approved renames belong in `compendium_match_aliases`.
