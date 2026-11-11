# Rogue and Wizard importer regressions

## Scope

Follow-up to issues #82 (R1) and #81 (W1/W5). This does not address W4 heightened spell duplication.

- Reconcile the managed class item's selected key attribute after PF2e prepares the current racket and old managed items have been removed. Use the actor's prepared legal key options; do not expand the base class's options.
- Mark the WG key-attribute selection mapped only after reconciliation succeeds.
- Read indexed WG sub-picks, consume each owner-specific answer once, and mark only its source selection consumed.
- Do not answer a feature from an unrelated feature's global hints. Explicit current answers block old selections and fixed-grant fallback.
- For filtered choices, a parenthesized name variant is accepted only when exactly one candidate passes PF2e's supported trait/tag checks. Record that selected UUID so the corresponding WG entry can be reconciled to its actual runtime grant.

## Validation (2026-11-11)

Base: main at 4d469c6. Existing golden files and the golden PC list are unchanged by this patch.

- node --test test/*.mjs: 152 passed.
- Focused scenarios use minimal synthetic WG operation shapes, not refreshed full exports of PCs 110/111.
- Connected to local Foundry world price-of-prophecy-test, PF2e 8.6.1, through the API. The patched checkout was served only to an isolated test client. No installed module files or persisted actors were changed.
- In-memory actors using the real Rogue/Ruffian/Mastermind compendium documents prepared legal options dex/str and dex/int. Reconciliation selected str/int on both the class and the derived actor; reconstructing from source retained the selection. A repeated call made no second write.
- Installed catalog loaded with 1094 rows. Ruffian Racket, Mastermind Racket, and Cantrip Expansion (Wizard) resolved through catalog aliases. Drain Bonded Item resolved directly to the action compendium by slug. No extra database mapping is needed for that action on this tree.
- Live compendium filtering resolved Reach Spell, Widen Spell, and Counterspell (Prepared). Counterspell (Spontaneous) was excluded by the Wizard trait constraint.

## Remaining acceptance check

Replay full WG exports of PCs 110 and 111 through persisted import/reload/re-import, including switching school/racket. The API checks above validate PF2e preparation and resolver behavior, but do not constitute that full character round trip. Leave issues #81/#82 open until that check; #81 also retains W4.
