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

## Live export recheck (2026-10-28)

The local `wgui-export-character` API was queried again after the importer fixes. It confirms the source values rather than an importer-calculated mismatch:

- `ATTRIBUTE_CON` is `0` and `content.max_hp` is `16`, even though the saved selections include `ATTRIBUTE_CON` as a free boost. Tracked in [WandersGuideUI #16](https://github.com/edmund-landgraf/WandersGuideUI/issues/16).
- `content.spell_slots` contains five rank-0 SUMMONER slots and one rank-1 SUMMONER slot. Tracked in [WandersGuideUI #17](https://github.com/edmund-landgraf/WandersGuideUI/issues/17); the correct rules verdict is still pending.
- `SAVE_FORT` is expert, so the corresponding Necromancer Fortitude concern is not evidence of an importer defect.
- The export has a PC-side `Fey Eidolon` feature but `companions` is still null; a linked eidolon cannot be imported until WGUI exports a companion/eidolon block.

## Foundry import

13 matched, 0 missed, 0 unresolved. HP, AC and saves match WG. The Eidolon and Evolution Feat prompts were answered from the WG selections. Re-imports came out identical. Skill selections were dropped (by design).

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| S1 | Con modifier | +1 (elf -1, Feybound +1, class free +1) | +0, so HP 16 not 17 | WGUI | open |
| S2 | Spell repertoire | choices for 5 cantrips + 2 rank-1 spells | slots exist, no choice offered, repertoire empty | WGUI / connector | fixed (PR #4 + #18) |
| S3 | Eidolon stat block | eidolon companion in the export and in Foundry | `companions` null; no eidolon actor | WGUI / importer | open |
| S4 | `set_identity` with a class outside the enabled books | rejected | reports "saved", stores nothing | connector | open |
| S5 | `export_character` over the MCP tool | returns JSON | ~4 MB export kills the local stdio server; the edge function works | connector | open |
| S6 | Feybound background skill/feat | needs a rules check | no skill or feat added | WGUI (verify) | open |

## Spell diagnosis (2026-10-27)

**Verdict: the break is on the WGUI side, in character creation through the connector. The Foundry import is not at fault.**

- **Export:** in the export, `character.spells` is `null`, and the operation selections have no spell keys. `content.spells.all` holds only spells granted by operations (none for Summoner, `Harm` for Necromancer). `content.spell_slots` lists empty slots, 5 for cantrips and 1 for rank 1.
- **Where WG stores chosen spells:** they live outside operations. The `ManageSpellsModal` "addSpell" handler (in `frontend/src/modals/ManageSpellsModal.tsx`) appends `{spell_id, rank, source}` to `character.spells.list`, which covers repertoire and spellbook. Prepared spells go in `character.spells.slots`. `collect-content.ts` builds `content.spells.all` from `spells.list`. None of this is a selection, so `list_open_choices` and `choose` can never offer it.
- **Connector:** `update-character` and the connector's save path (`SAVE_FIELDS` includes `spells`) can already write the field, but no tool exposes it.
- **Importer:** the importer reads `content.spells.all`, `focus_spells` and `innate_spells`, and those all came through. Character 80 got Boost Eidolon, Evolution Surge and Shield. Character 81 got Harm and its four focus spells.
- **Why the tests passed:** none of the fixtures has hand-picked spells. `character.spells` is empty or null on PCs 63, 64, 66, 71, 76 and 78, and on sample-v4. The real-test2 fixture has only `Phantasmal Minion`, which a class feature grants. The spell assertions in `mapping.test.mjs` check only granted and focus spells (Counter Performance, Courageous Anthem, Phantasmal Minion). So the tests prove the Foundry mapping works, not that repertoire, spellbook or prepared spells reach Foundry.

**Proposed fixes:**
- **Connector:** add `list_spell_options` (tradition, rank and source from `content.spell_sources` and `spell_slots`) and `add_spell` / `set_spells`. They would write `character.spells.list` (and, for prepared casters, `spells.slots`) with the same shape the UI writes, using `expected_updated_at`.
- **Importer:**
  - Add a fixture that has real `spells.list` entries, for a spontaneous caster and a prepared caster, and assert that they land in the right spellcasting entry and rank.
  - Add a coverage warning when `spell_slots` exist but `spells.all` holds no spells of that source ("caster has empty repertoire").

## Spell fix outcome (2026-10-27)

- **Connector** (WandersGuideUI PR #4, not merged): `list_spell_options`, `add_spell`, `remove_spell`, `set_spells`. Sources and slot counts come from the builder operation pass; spell lookups include the common core book (id 3); list entries match ManageSpellsModal `{ spell_id, rank, source }`; prepared slots are `{ rank, source, spell_id }`. Rejections checked live (off-tradition Daze, unknown id).
- **Importer** (foundry-wanderersguide-import PR #18, not merged): prepared spells are read from `content.spell_slots` and placed into the entry's slots; new warning when a slotted caster has no spells from its source; fixtures 80/81 plus `test/spells.test.mjs`.
- **Tests:** module 49/49; tactics-mcp 38/39 (the one failure, focus-spells "Kota", fails the same way on main).
- **Spells given (via set_spells):** cantrips Tangle Vine, Electric Arc, Detect Magic, Light, Guidance; rank 1 Fear.
- **Live re-import:** Summoner Spells (spontaneous, primal) shows all six; focus Boost Eidolon and Evolution Surge; innate Shield. No warnings. Screenshots: `D:\tmp\wgui-newpc\80-spells-after.png`, `80-import-report.png`.
- **Open question:** WG computes 1 rank-1 slot; check whether a level 1 Summoner repertoire should hold one or two rank-1 spells.
