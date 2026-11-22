# Refactor notes from the earlier Foundry importers

Status: candidate work, not scheduled. Nothing here is a claim that the current importer should copy those modules. The comparison is the reason a change is worth considering, and the last section is the only part proposed as a refactor.

Compared modules, read 2026-11-06:

| | This module | Official Wanderer's Guide importer | Pathbuilder importer |
|---|---|---|---|
| Repo | `foundry-wanderersguide-import` 0.1.2 | [wanderers-guide/foundry-vtt-import](https://github.com/wanderers-guide/foundry-vtt-import) 0.1.0 | [zarmstrong/foundry-pathbuilder2e-import](https://github.com/zarmstrong/foundry-pathbuilder2e-import) 0.10.2 |
| Source | Wanderer's Guide JSON v4, fetched with an API key | A downloaded `.guidechar` file | Pathbuilder JSON, fetched by a 6-digit code |
| Foundry / PF2e | Foundry 12–14 (verified 14 build 369), PF2e 6.0.0–8.6.1 | Foundry 0.8.8–0.8.9 | Foundry 10 only, PF2e 4.1.2. README says unsupported on v11+. Last release January 2023; README note August 2023 |
| Last activity | Current | Last commit 16 Jan 2023 (`Update module.json`) | Last code 29 Jan 2023 |
| Entry | Actors sidebar, multi-select | Title bar of an actor the user can edit | Title bar of a character sheet |

The official module's README still points its install URL at `bLittle1996/foundry-vtt-wanderers-guide-character-import`. The org repo's `module.json` is the 0.8.9 manifest. It credits the Pathbuilder module as the pattern it followed.

## What each one writes

**Official Wanderer's Guide importer.** Name, ability scores, proficiencies including Lore, ancestry and ancestry features, background and background feats, class, key ability, class features, and feats, including the free-archetype setting. The README lists senses, inventory (including affixed runes), and spell lists as unsupported. A name that is not in the PF2e compendium is skipped. The import pipeline in `src/index.ts` is: parse the file, optionally purge feats, add ancestry / background / class, add their features, write actor stats, add feats. Spell lists, spells, and equipment are comments, not code.

**Pathbuilder 0.10.2.** While it was maintained it also wrote spells and focus spells, inventory, potency runes, deity, alignment, senses, full HP, the prototype token name, and a Pathbuilder id on the actor. It reported misses. Matching is name-and-slug plus a hand-maintained map and blacklist inside one script, `pathbuilder-import.js` (about 77 KB, plus a minified twin). Duplicate class features and some backgrounds (Artisan specialty crafting) were left for the player to clean up. That work is frozen against PF2e 4.1.2.

**This module.** Ancestry, heritage, background, class, feats, spells and spellcasting entries, equipment, runes and materials, languages, attributes, level, and HP. Custom items go in a "Wanderer's Guide Homebrew" folder. ChoiceSets are filled only from explicit Wanderer's Guide answers, in dependency order, with no guessed fallback. Re-import finds the actor by `wgId` plus host and keeps current HP, temporary HP, prepared spells, and slot usage when the spellcasting entry still exists. Skills, saves, AC, perception, currency on re-import, and several derived proficiencies are not forced from the export. Every class is experimental. See [CLASS_COVERAGE.md](CLASS_COVERAGE.md) and [IMPORT_GAPS.md](IMPORT_GAPS.md).

## Where this module is already ahead

These are the reasons the older modules are references, not a base to port.

1. **Current Foundry and PF2e.** The other two will not load in a current world.
2. **The module fetches the character.** `wgui-ext-list-key-characters`, `wgui-ext-find-key-campaigns`, and `wgui-export-character`, with backoff on HTTP 429. The official module needs a file. Pathbuilder needs a code from a manual export.
3. **Several characters from the Actors sidebar.**
4. **A plan is shown before anything is written.** Cancel leaves the world alone.
5. **Re-import updates the same actor** and keeps play state (HP, temporary HP, prepared spells, slot usage).
6. **A failed apply rolls back.** Replacements are created before old items are removed. Failure restores the pre-import snapshot or keeps a "(WG backup)" actor.
7. **A coverage ledger** is whispered per source path: mapped, included, unresolved, leftover-preserved, dropped. Pathbuilder had a miss report. The official module skips a miss silently.
8. **Alias matching is generated, not hand-listed.** Slug, then the match catalog (about 8,800 curated aliases, built against the PF2e 8.6.1 compendiums), then an unambiguous name or name plus level. Without the catalog, exact-name matching still runs and alias misses are reported as unresolved.
9. **Spells, equipment, runes, languages, level, and HP**, which the official importer never reached. Pathbuilder did spells, inventory, and runes against PF2e 4.x data.
10. **ChoiceSets only from explicit answers**, then grant reconciliation. No guessed fallback.
11. **Homebrew has a folder.** Both older modules drop anything that is not already in the compendium.
12. **Campaign selection and optional campaign art.**
13. **Class support is evidence, not a name match.** Twenty-nine classes, a rule registry, per-class notes, and golden fixtures.
14. **Mapping is tested outside Foundry.** Node tests cover mapping, golden PCs, safe apply and rollback, selections, spells, formulas, and custom items. Pathbuilder has no test suite in the repo. The official module has Jest tests scoped to the Foundry 0.8 converter.
15. **No runtime dependencies.** The catalog is generated offline. At the table the module never opens the rules database.

## What is worth taking from them

Each item is a gap they closed and we have not. None of them requires their stack.

### 1. Lore as its own item

`src/converter/skills.ts` (`addLoreSkills`) builds one lore item per entry in `proficiencies.lore`, strips the word "lore" from the name, and splits the list into create versus update by matching an existing item of type `lore` with the same name.

We drop `SKILL_LORE_*` in `scripts/custom-items.js`. The comment there is the reason: a PF2e lore selector needs the actor's lore item slug, so the proficiency cannot be written until the item exists.

Refactor shape: create or update the lore item first, then resolve any selector that names it. Do not write a lore rank onto a skill path that has no item. Report a lore the export names and the compendium cannot slug as unresolved, the same way other misses are reported.

### 2. A local JSON v4 file as a second source

`src/index.ts` reads a `.guidechar` with `FileReader` and never calls Wanderer's Guide. That is the path that still works when the API key, the campaign grant, or the server is what failed.

Refactor shape: keep the API as the primary path. Add an optional file input that accepts the same JSON v4 the export function returns, and run it through the existing planner. The file is a source, not a second mapper. Reject anything that does not parse as a v4 export (see the version check below). Do not document the old `.guidechar` layout as supported. That file is the 0.8-era export.

### 3. Refuse an unmapped export version

`src/parser/helpers.ts` defines `UnsupportedVersionError`. The dialog shows that error and stops. A partial import of an unknown shape becomes a pile of unresolved rows that look like match failures.

Refactor shape: if the export version is missing or newer than the versions the planner knows, stop before planning and show a plain notification that names the version. Do not map the fields we happen to recognize.

### 4. A sheet-header button for the actor's owner

`renderActorSheet` in `src/index.ts` inserts "Import from Wanderer's Guide" after the window title, and only when the actor is a character and `actor.canUserModify(user, "update")` is true. Our entry point is the Actors sidebar. A player who cannot see that sidebar cannot start an import of their own character.

Refactor shape: add the same button on the character sheet, gated the same way. It imports that one actor (update if `wgId` matches, otherwise the existing create path). Leave multi-select on the sidebar.

### 5. Prototype token name

`toCharacterUpdateMap` in `src/converter/core.ts` sets `token.name` in the same update as the actor name. The table shows the token name. An actor rename that leaves the prototype token stale is a visible miss.

Refactor shape: when the import sets the actor name, set the prototype token name to the same string. Do not rename a token the user has already placed on a scene unless we already have a rule for that. Check the current apply path before adding a second write.

### 6. Deity as a compendium item

Pathbuilder wrote the deity onto the actor. We use the beliefs string only to answer a domain ChoiceSet (`deityPromptChoice` in `scripts/importer.js`). When the export has no deity, Domain Initiate / Domain Focus is left unresolved and a warning is shown. That warning is correct. The missing step is the case where the export does name a deity.

Refactor shape: match the exported deity through the same slug / catalog / unambiguous-name order as other items, set it on the actor, then let the existing domain prompt read it. An unmatched deity is an unresolved row, not a silent skip and not a guessed choice.

## What not to copy

### Direct proficiency writes

`setAbilitiesAndProficiencies` writes a rank onto every save, armor proficiency, weapon proficiency, trained skill, Perception, and class DC (`data.saves.fortitude.rank`, `data.martial.heavy.rank`, `data.skills.ath.rank`, `data.attributes.perception.rank`, `data.attributes.classDC.rank`, and the rest of that map). On PF2e 0.8 that map was the character. On 8.x those ranks are derived from class features, feats, and rule elements. Writing them again produces a rank that no longer matches the items after the next edit.

Keep the current rule: do not force skills, saves, AC, perception, or class DC from the export. Lore is the exception, and only as an item (item 1 above). Currency stays first-import only, which `scripts/coverage.js` already records.

### The rest of their machinery

- Their feat purge checkbox deletes existing feats before import. Our replace-then-rollback already covers a bad apply. A purge option would discard play-state items the rollback is there to keep.
- Their class-id table (`classIdMap` in `helpers.ts`) is twenty pre-remaster numeric ids. The match catalog replaced that.
- Pathbuilder's hand map and blacklist solved duplicate grants (Assurance, class features the class item already adds). Grant rules and "no guessed ChoiceSet" cover that, with a report when they do not.
- Pathbuilder stored potency runes as integers after a bug where they arrived as strings. Worth a fixture if a rune is ever imported as the wrong type. Not a subsystem to port.
- Senses and alignment were written as actor fields. Senses are in the derived set in `scripts/coverage.js` (`senses` is listed next to AC and speeds). Ancestry features grant them on current PF2e. Forcing the field would repeat the proficiency mistake.

## Suggested order, if this is picked up

1. Export-version refusal. Small, and it keeps a bad file from looking like a match failure.
2. Prototype token name. One field, easy to verify on a fresh actor.
3. Sheet-header button. UI only, same import path.
4. Deity compendium match. Uses the matcher we already have.
5. Lore items, then lore selectors. The one real data-model change.
6. Local JSON v4 file. Do this after the version check exists, so the file path and the API path share one gate.

Each step should land with a golden or unit fixture. No step should start writing derived ranks.
