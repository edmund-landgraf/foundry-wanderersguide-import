// Rule data the importer used to keep inline. Verified against PF2e 8.6.1.
/** Feats whose ChoiceSet lists the deity's domains, so it has no options when no deity is imported.
 *  packs/pf2e/feats/class/cleric/level-1/domain-initiate.json, level-12/domain-focus.json.
 *  Advanced Domain (level-8/advanced-domain.json) is listed with the same no-deity handling (approved by
 *  Edmund). In 8.6.1 it has no ChoiceSet (rules: one ActiveEffectLike), so PF2e opens no prompt for it
 *  today and this entry only takes effect if a later version adds the deity-domain ChoiceSet. */
export const DOMAIN_PROMPT_FEATS = Object.freeze(["Domain Initiate", "Domain Focus", "Advanced Domain"]);
/** Prompt title word that marks a deity ChoiceSet (answered only from WG's exported beliefs). */
export const DEITY_PROMPT_WORD = "deity";
/** WG spell-source suffix for divine font slots: extra prepared Heal or Harm on the class entry. */
export const DIVINE_FONT_SUFFIX = "_DIVINE_FONT";
/** PF2e innate spellcasting uses Charisma (8.6.1 spellcasting-entry-dialog/app.svelte: innate -> "cha"). */
export const INNATE_ATTRIBUTE = "cha";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const DOMAIN_PROMPT = new RegExp(DOMAIN_PROMPT_FEATS.map((n) => esc(n.toLowerCase())).join("|"), "i");
export const DEITY_PROMPT = new RegExp(esc(DEITY_PROMPT_WORD), "i");
