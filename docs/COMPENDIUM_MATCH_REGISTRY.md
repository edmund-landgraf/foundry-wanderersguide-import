# Compendium match registry

Migration `006_create_compendium_match_registry.sql` adds the first data-driven
layer for WG-to-PF2e matching.

The registry deliberately separates three concerns:

- `compendium_lookup_sets` and `compendium_lookup_members` define which
  compendia are searched and their priority for each item kind.
- `compendium_match_aliases` records evidence-backed WG-to-PF2e name changes
  such as `Redemption Cause` to `Redemption`.
- `compendium_match_rules` stores generic matching policy such as type maps,
  semantic suffixes, confidence gates, and graded-item fallback.

The Foundry module must consume a generated/read-only catalog from this data;
it must not connect directly to Postgres. The first runtime refactor should
load the catalog once per import and make the existing `matchEntries` order
data-driven while retaining the current hard-coded defaults as a fallback.

Every alias requires an evidence reference. Ambiguous matches remain
unresolved, and no lookup priority may cause the importer to choose the first
candidate without a confidence check.

