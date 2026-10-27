# Class test: Necromancer

Status: open. Tested 2026-10-27 on local WGUI (localhost) and the local Foundry world. Built as the campaign-42 GM test account.

## Character

- WG id 81, "Morrow Quillgrave", level 1, joined to test campaign 42.
- Books: Player Core, Monster Core, GM Core, Impossible Magic (842). Necromancer is class id 337 in Impossible Magic.
- Dwarf (Death Warden Dwarf), Scholar, Necromancer: Puppeteer and Bone.
- Choices: ancestry free boost Int; languages Necril, Petran, Draconic, Aklo; Scholar boosts Int + Con, skill Occultism, Assurance (Occultism); class skills Arcana, Religion, Medicine, Society, Crafting, Intimidation; class free boosts Int, Con, Dex, Wis; ancestry feat Dwarven Doughtiness.
- 0 open choices at the end.

## WG result

Str +0, Dex +1, Con +3, Int +4, Wis +2, Cha -1. These match the boosts. HP 21, AC 14, Perception +5, Fort +8 (expert), Ref +4, Will +5. Spell DC 17 (occult, Int, prepared). Class feat Consume Thrall. Focus: Create Thrall, Thrall Charge, Necrotic Bomb, Bone Spear. Spells list: Harm (rank 1). Slots: 5 cantrips, 1 rank-1.

## Foundry import

The import completed after two PF2e prompts were answered by the test script: Clan Weapon -> Clan Dagger, Scholar -> Occultism. The actor has HP 21, AC 14, Fort 8, Ref 4, Will 5, matching WG. It has 25 items, including Puppeteer, Bone, Grave Spells and the four focus spells. The prepared slots are empty.

## Problems

| # | Problem | Expected | Actual | Layer | State |
|---|---|---|---|---|---|
| N1 | Prepared spells / spellbook | choices for cantrips + rank-1 spellbook entries | no spell choice offered; 5 cantrip + 1 rank-1 slots empty | WGUI / connector | open |
| N2 | Dwarf Clan Weapon ChoiceSet | answered from WG (Clan Dagger is fixed in WG) | import blocks on the "Clan Weapon" prompt | importer | open |
| N3 | Scholar skill ChoiceSet | answered from the WG background selection (Occultism) | import blocks on the "Scholar" prompt | importer | open |
| N4 | Consume Thrall class feat | imported | in WG `classFeats`, not on the Foundry actor | importer | open |
| N5 | Thrall | thrall support (focus spell plus summon) | only the Create Thrall cantrip; no thrall actor | WGUI / importer (by design?) | open |
| N6 | Current HP | 21 on a fresh import | the sheet shows 13 / 21 | importer (verify) | open |
| N7 | Focus pool | 1 point at level 1 | the sheet shows an empty focus pool | importer (verify) | open |
| N8 | WG import chat card | posted | the scripted run found no "WG import:" card | importer (verify) | open |
| N9 | `set_identity` with an ancestry outside the enabled books (Kholo) | rejected | reports "saved", stores nothing | connector | open (same as Summoner S4) |
| N10 | Fort expert at level 1 | rules check | Fort +8 expert | WGUI (verify) | open |

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
