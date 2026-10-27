# Remaining import gaps

The safe-import work in PR #6 completed the eight-PC Foundry validation matrix. The items below remain deliberately separate from that safety work.

## Not fixable in the importer alone

### WG export freshness

Changing a feat in the Wanderer's Guide database did not change the exported JSON during manual testing. The importer can only apply data that appears in the export. This needs to be verified or fixed in the WG export service before it can be used as an importer regression case.

### Nested choices without PF2e targets

Some `character.operation_data.selections` entries have no corresponding PF2e item or rule target. The importer records these as unresolved and leaves the choice for manual PF2e review. Automatically choosing an item would be unsafe. Resolving these requires a class-, ancestry-, or background-specific PF2e mapping with real WG evidence.

## Test-world cleanup

The actors renamed with `(pre-test)` are leftovers from the manual test round. They were intentionally retained and are not created by normal imports. They can be deleted from the test world after the results are archived; no importer change is required.

## Report history

An older Azarra report mentioned “pre-filled Woodworking” after the duplicate item had already been removed. Import notes are written into each import report/chat message and are not used as persistent import state. Verify the wording in a fresh report before treating it as an active importer defect.

## Release boundary

PR #6 is safe to review as an import-safety change, but class support remains experimental. The unresolved-choice and export-freshness limitations should remain visible until they have their own evidence and targeted fixes.
