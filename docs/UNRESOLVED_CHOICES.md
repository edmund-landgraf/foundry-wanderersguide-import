# Unresolved-choice inventory

This is the baseline for driving unresolved choices toward zero. It is derived from the eight golden snapshots in `test/golden/`.

## Baseline

There are currently **66 unresolved occurrences across 8 snapshots**, representing **31 unique exact selection paths**.

| Snapshot PCs | Unresolved occurrences |
|---|---:|
| 63, 72 | 9 each |
| 64, 74 | 20 each |
| 66, 76 | 2 each |
| 71, 78 | 2 each |

Every current row has the same classification:

> WG select answer with no PF2e target; review manually

That message is a safe fallback, not a resolution. Each occurrence must either gain a validated PF2e target or receive a durable, evidence-backed exception record.

## Normalized inventory

The UUID and option suffixes vary by character. The stable source families below account for all 66 occurrences.

| Source family | Occurrences | PCs |
|---|---:|---|
| `ancestry` selection family | 14 | 63, 64, 71, 72, 74, 78 |
| `background` selection family | 12 | 63, 64, 66, 71, 72, 74, 76, 78 |
| `ancestry-section-2707339574403411` | 4 | 63, 64, 72, 74 |
| `ancestry-section-491735390724817` | 4 | 64, 74 |
| `ancestry-section-5742419753466526` | 2 | 64, 74 |
| `class-feature-30975` | 4 | 63, 72 |
| `class-feature-30970` | 4 | 63, 72 |
| `class-feature-31082` | 2 | 63, 72 |
| `class-feature-31083` | 2 | 63, 72 |
| `class-feature-31093` | 2 | 64, 74 |
| `class-feature-31305` | 2 | 64, 74 |
| `class-feature-31094` | 2 | 64, 74 |
| `class-feature-31203` | 2 | 64, 74 |
| `class-feature-30977` | 2 | 64, 74 |
| `class-feature-31096` | 2 | 64, 74 |
| `class-feature-30978` | 2 | 64, 74 |
| `class-feature-30971` | 2 | 64, 74 |
| `class-feature-21217` | 2 | 66, 76 |

The exact source paths, including operation UUIDs and option suffixes, remain in each snapshot's `coverage.unresolved` array. Do not replace them with normalized labels in the importer report; the exact path is required for reproducible mapping work.

## Reduction gate

For each mapping PR:

1. Add or update a fixture expectation for the exact WG selection path.
2. Identify the owning WG feature and the legal PF2e target(s) from a real export and PF2e item/rule data.
3. Resolve only when the target is unambiguous and legal.
4. Add a test proving the selection is consumed and no longer appears in `coverage.unresolved`.
5. Re-run all eight snapshots and record the new total.
6. If a case cannot be represented in PF2e, keep it unresolved but replace the generic reason with a specific, durable exception category and evidence.

The target is zero unresolved rows for supported mappings. Any remaining rows must be explicit exceptions, not silent guesses or generic fallbacks.

## Suggested order

Start with the repeated ancestry and background families, then handle the class-feature families one stable feature ID at a time. This should reduce duplicated work across PCs 63/72, 64/74, 66/76, and 71/78 while keeping each mapping independently reviewable.
