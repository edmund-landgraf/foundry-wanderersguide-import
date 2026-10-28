# Class test: Alchemist (Bomber)

Test PC: WG character 95, "Pip Cinderwhisk", a level 1 Charhide Goblin Artisan Alchemist (Bomber Research Field, Quick Bomber, Burn It!). Fixture: `test/fixtures/pcs/95.json` (user and campaign ids removed).

## WG side

- Formulas are inventory items with `is_formula: true`. They show up in `content.inventory_flat` with the flag set. Bombs keep group WEAPON; elixirs are GENERAL.
- Containers: `character.inventory.items[].container_contents` nests items (the Backpack holds Alchemist's Fire (Lesser) x1). `inventory_flat` lists the nested item but has no parent link.
- Research field: `operation_data.selections["class-feature-31299_<uuid>"] = 32985`, the feat "Bomber Research Field".
- WG grants Versatile Vial (Lesser) through `raw_data_dump.variables.EXTRA_ITEM_IDS` (15516).

## Import mapping

| WG | Foundry PF2e |
| --- | --- |
| `is_formula` inventory items | `system.crafting.formulas` (UUIDs), written once with `{diff: false}`. Existing formulas are kept and the list is deduped by UUID. |
| Formula name | Resolved by exact name, then `scripts/item-renames.js`, then the Greater/Lesser grade swap. Pack order is `pf2e.equipment-srd`, `sf2e.equipment`, then the legacy packs. The matched item keeps its own type, so bombs stay weapons. |
| Item inside a container | `system.containerId` points at the imported backpack (created with `keepId`). If the parent isn't a PF2e container, the child is placed loose and a warning is logged. |
| `EXTRA_ITEM_IDS` items | Skipped. PF2e grants its own (the Versatile Vials resource). The coverage ledger records the skip as dropped, with the reason. |
| "Bomber Research Field" | The Research Field ChoiceSet gets "Bomber" (semantic stem, `choiceNameKeys`). |

The import report and the dry-run review both have a **Formulas** section listing each formula, its pack, and any misses.

## Result (2026-10-27, local Foundry, PF2e)

- 16 matched, 0 homebrew or missed, 0 unresolved. Research Field: Bomber and Specialty Crafting: Alchemy were both answered from WG.
- Crafting tab: Acid Flask (Lesser), Alchemist's Fire (Lesser), Antidote (Lesser) and Elixir of Life (Minor) are all from pf2e.equipment-srd.
- Inventory: the Backpack contains Alchemist's Fire (Lesser) x1. Versatile Vial x6 and Formula Book (Blank) are PF2e grants.
- Screenshots (not committed): `95-sheet`, `95-inventory`, `95-crafting`, `95-import-report`.

## Known gaps

- Daily preparation (advanced alchemy, versatile vial counts, prepared formulas) is left to PF2e's crafting tab. WG doesn't export it.
- Kits: WG already expands pack contents into separate items, so kits are imported as their parts.
- Formulas WG has that PF2e doesn't have under any candidate name show as misses in the Formulas section. They aren't guessed.
