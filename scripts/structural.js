// WG rows that have no PF2e Item by design. They are not matched, not created as homebrew, and not
// silently dropped: buildPlan reports each one with status "structural" ("structural / no PF2e item").
// Names come from wgi_rules: the WG level-slot placeholders below are the unresolved
// wg_pf2e_catalog_matches names with no PF2e catalog entry (Skill Increase 206, Skill Feat 192,
// Attribute Boosts 92, General Feat 91 rows, 2026-10-28). "Fist" is PF2e's built-in strike
// (actor system strike, not an Item in 8.6.1 packs).
export const STRUCTURAL_STATUS = "structural";
export const STRUCTURAL_PREFIX = "structural / no PF2e item";
export const STRUCTURAL_NAMES = Object.freeze({
  equipment: Object.freeze({ fist: "built-in strike, not an item" }),
  feat: Object.freeze({
    "skill-feat": "WG level-slot placeholder", "general-feat": "WG level-slot placeholder",
    "attribute-boosts": "WG level-slot placeholder", "skill-increase": "WG level-slot placeholder",
  }),
});
/** Reason string when a WG row is structural, else null. `slug` is sluggified. */
export function structuralReason(kind, slug) {
  const why = STRUCTURAL_NAMES[kind]?.[slug];
  return why ? `${STRUCTURAL_PREFIX}: ${why}` : null;
}
