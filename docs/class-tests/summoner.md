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
