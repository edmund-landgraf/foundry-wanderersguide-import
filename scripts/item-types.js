// WG entry kind -> PF2e Item document types, and the formula pack search order. One shared copy
// (previously duplicated in mapping.js, importer.js and formulas.js). Item types verified against
// PF2e 8.6.1 static/template.json; "pf2e.equipment-srd" against system.pf2e.json. The sf2e and
// pf2e-legacy-content packs belong to optional modules and are skipped when not installed.
// A match catalog may override any kind's list with `typeMap` (normalizeMatchCatalog).
export const KIND_TYPES = Object.freeze({
  ancestry: ["ancestry"], heritage: ["heritage"], background: ["background"], class: ["class"],
  feat: ["feat", "action"], spell: ["spell"],
  equipment: ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "kit", "ammo"], // ammo: 216 pf2e 8.6.1 equipment-pack items (e.g. Arrows) have type "ammo"
});
/** Every Item type the compendium index keeps. */
export const PACK_TYPES = new Set(Object.values(KIND_TYPES).flat());
export const FORMULA_PACK_ORDER = Object.freeze(["pf2e.equipment-srd", "sf2e.equipment", "pf2e-legacy-content.formulas-legacy", "pf2e-legacy-content.equipment-legacy"]);
export const FORMULA_TYPES = Object.freeze(["consumable", "weapon", "equipment", "armor", "shield", "backpack", "treasure", "ammo", "kit"]);
/** Types for a kind, honoring a catalog typeMap override; unknown kinds map to themselves. */
export const typesForKind = (kind, typeMap = null) => typeMap?.[kind] ?? KIND_TYPES[kind] ?? [kind];
