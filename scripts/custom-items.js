// Wanderer's Guide custom (homebrew) items -> PF2e item data with rule elements.
// Pure functions only (no Foundry globals) so the translation is unit-testable in Node.
// Nothing is guessed: an operation without a confident PF2e equivalent is reported as
// unresolved, with the raw WG operation, and is never turned into a rule.
import { MODULE_ID } from "./constants.js";

/** Content source ids that belong to a user (WG homebrew): all_sources rows with a user_id. */
export function homebrewSourceIds(content) {
  const ids = new Set();
  for (const s of content?.all_sources ?? []) if (s && typeof s.id === "number" && typeof s.user_id === "string" && s.user_id.trim()) ids.add(s.id);
  return ids;
}

/** True when the export has custom items whose trait ids are missing from content.all_traits
 * (the slim export drops official traits), so the full export is needed to name them. */
export function needsTraitCatalog(exp) {
  const ct = exp?.content ?? {};
  const hb = homebrewSourceIds(ct);
  const known = new Set((ct.all_traits ?? []).map((t) => t?.id));
  return (ct.inventory_flat ?? []).some((inv) => { const it = inv?.item ?? inv; return isCustomItem(it, hb) && (it.traits ?? []).some((id) => !known.has(id)); });
}

/** True when an inventory_flat row is a WG custom item (its content source is homebrew). */
export function isCustomItem(it, homebrewIds) {
  return !!it && it.content_source_id != null && homebrewIds.has(it.content_source_id);
}

const slug = (s) => String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// WG variable -> PF2e statistic selector. Only exact, documented equivalents.
const SAVES = { SAVE_FORT: "fortitude", SAVE_REFLEX: "reflex", SAVE_WILL: "will" };
const SPEEDS = { SPEED: "land-speed", SPEED_FLY: "fly-speed", SPEED_CLIMB: "climb-speed", SPEED_BURROW: "burrow-speed", SPEED_SWIM: "swim-speed" };
const OTHER = { PERCEPTION: "perception", AC_BONUS: "ac", MAX_HEALTH_BONUS: "hp", ATTACK_ROLLS_BONUS: "attack-roll", SPELL_ATTACK: "spell-attack-roll", SPELL_DC: "spell-dc", CLASS_DC: "class" };
const SKILLS = new Set(["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"]);

export function selectorFor(variable) {
  const v = String(variable ?? "");
  if (SAVES[v]) return SAVES[v];
  if (SPEEDS[v]) return SPEEDS[v];
  if (OTHER[v]) return OTHER[v];
  const m = v.match(/^SKILL_([A-Z]+)$/);
  if (m && SKILLS.has(m[1].toLowerCase())) return m[1].toLowerCase();
  return null; // includes SKILL_LORE_*: PF2e lore selectors depend on the actor's lore item slug
}

const BONUS_TYPES = new Set(["item", "status", "circumstance"]);
const SENSE_ACUITY = { SENSES_PRECISE: "precise", SENSES_IMPRECISE: "imprecise", SENSES_VAGUE: "vague" };
const IWR = { RESISTANCES: "Resistance", WEAKNESSES: "Weakness", IMMUNITIES: "Immunity" };
const RANK = { U: 0, T: 1, E: 2, M: 3, L: 4 };

const unresolved = (op, reason) => ({ status: "unresolved", type: op?.type ?? null, reason, raw: op });

/**
 * Translate one WG operation. ctx: { itemName, abilityUuid(type, wgId) -> uuid|null,
 * spellCovered(spellId, type) -> string|null, validDamageType(slug) -> bool }.
 * Returns { status: mapped|partial|covered|unresolved, rule?, reason, raw }.
 */
export function translateOp(op, ctx = {}) {
  return { type: op?.type ?? null, ...translateOne(op, ctx) };
}

function translateOne(op, ctx) {
  const d = op?.data ?? {};
  const label = ctx.itemName ?? "Wanderer's Guide item";
  switch (op?.type) {
    case "addBonusToValue": {
      const selector = selectorFor(d.variable);
      const value = Number(d.value);
      if (!selector || !Number.isFinite(value) || typeof d.value === "string" && !/^[+-]?\d+$/.test(d.value.trim())) return unresolved(op, `no PF2e selector or numeric value for ${d.variable} = ${JSON.stringify(d.value)}`);
      const type = BONUS_TYPES.has(String(d.type ?? "").toLowerCase()) ? String(d.type).toLowerCase() : "untyped";
      if (d.text && String(d.text).trim()) {
        // Situational bonus: WG keeps the condition as free text, which PF2e cannot predicate safely.
        if (selector === "ac" || selector.endsWith("-speed") || selector === "hp") return unresolved(op, `situational ${d.variable} bonus "${d.text}" has no roll to attach a note to`);
        const sign = value >= 0 ? "+" : "";
        return { status: "partial", rule: { key: "Note", selector, title: label, text: `${sign}${value} ${type === "untyped" ? "" : type + " "}bonus ${String(d.text).trim()} (not applied automatically).` }, reason: "situational bonus kept as a roll note", raw: op };
      }
      return { status: "mapped", rule: { key: "FlatModifier", selector, type, value, label }, reason: `${d.variable} -> ${selector}`, raw: op };
    }
    case "adjValue": {
      if (IWR[d.variable]) {
        const m = String(d.value ?? "").match(/^\s*([^,]+?)\s*(?:,\s*(\d+))?\s*$/);
        if (!m) return unresolved(op, `unparsed ${d.variable} value ${JSON.stringify(d.value)}`);
        const type = slug(m[1]);
        if (ctx.validDamageType && !ctx.validDamageType(IWR[d.variable], type)) return unresolved(op, `"${m[1]}" is not a PF2e ${IWR[d.variable].toLowerCase()} type`);
        const rule = { key: IWR[d.variable], type };
        if (IWR[d.variable] !== "Immunity") { if (!m[2]) return unresolved(op, `${d.variable} without an amount`); rule.value = Number(m[2]); }
        return { status: "mapped", rule, reason: `${d.variable} -> ${rule.key}`, raw: op };
      }
      if (SENSE_ACUITY[d.variable]) {
        const m = String(d.value ?? "").match(/^\s*([^,]+?)\s*(?:,\s*(\d+))?\s*$/);
        if (!m) return unresolved(op, `unparsed sense ${JSON.stringify(d.value)}`);
        const rule = { key: "Sense", selector: slug(m[1]), acuity: SENSE_ACUITY[d.variable] };
        if (m[2]) rule.range = Number(m[2]);
        return { status: "mapped", rule, reason: `${d.variable} -> Sense`, raw: op };
      }
      if (d.variable === "MAX_HEALTH_BONUS" && Number.isFinite(Number(d.value)) && typeof d.value !== "object") {
        return { status: "mapped", rule: { key: "FlatModifier", selector: "hp", value: Number(d.value), label }, reason: "MAX_HEALTH_BONUS -> hp", raw: op };
      }
      const sk = String(d.variable ?? "").match(/^SKILL_([A-Z]+)$/);
      if (sk && SKILLS.has(sk[1].toLowerCase()) && d.value && typeof d.value === "object" && RANK[d.value.value] != null) {
        return { status: "mapped", rule: { key: "ActiveEffectLike", mode: "upgrade", path: `system.skills.${sk[1].toLowerCase()}.rank`, value: RANK[d.value.value] }, reason: `${d.variable} proficiency ${d.value.value} -> rank upgrade`, raw: op };
      }
      return unresolved(op, `no confident PF2e equivalent for adjValue ${d.variable} = ${JSON.stringify(d.value)}`);
    }
    case "setValue": {
      const m = String(d.variable ?? "").match(/^SPEED_(FLY|CLIMB|BURROW|SWIM)$/);
      if (m && Number.isFinite(Number(d.value)) && Number(d.value) > 0) return { status: "mapped", rule: { key: "BaseSpeed", selector: m[1].toLowerCase(), value: Number(d.value) }, reason: `${d.variable} -> BaseSpeed`, raw: op };
      return unresolved(op, `no confident PF2e equivalent for setValue ${d.variable}`);
    }
    case "giveAbilityBlock": {
      const uuid = ctx.abilityUuid?.(d.type, d.abilityBlockId) ?? null;
      if (!uuid) return unresolved(op, `WG ${d.type} ${d.abilityBlockId} has no compendium match in this import`);
      // PF2e rejects a persistent GrantItem on a physical item ("parent item must not be physical",
      // grant-item/rule-element.ts); only in-memory condition grants are allowed there. WG also lists the
      // granted feat in feats_features, so the import creates it as an ordinary feat instead.
      if (ctx.physical !== false) return { status: "covered", uuid, reason: `${d.type} ${d.abilityBlockId} is imported as a feat (WG lists it in feats_features); PF2e does not allow GrantItem on a physical item, so it is not tied to the item`, raw: op };
      return { status: "mapped", rule: { key: "GrantItem", uuid, allowDuplicate: false }, reason: `${d.type} ${d.abilityBlockId} -> GrantItem`, raw: op };
    }
    case "giveSpell": {
      const how = ctx.spellCovered?.(d.spellId, d.type) ?? null;
      if (how) return { status: "covered", reason: how, raw: op };
      return unresolved(op, `spell ${d.spellId} (${d.type}) is not in the export's spell lists`);
    }
    case "giveLanguage":
      return ctx.languagesCovered ? { status: "covered", reason: "WG lists granted languages in content.languages; imported as actor languages", raw: op } : unresolved(op, "language not listed in the export");
    default:
      return unresolved(op, `WG ${op?.type ?? "unknown"} operation has no PF2e rule element equivalent`);
  }
}

const USAGE = (u) => {
  const s = String(u ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^held in 1 hand/.test(s)) return { usage: "held-in-one-hand", carryType: "held", handsHeld: 1 };
  if (/^held in 2 hands/.test(s)) return { usage: "held-in-two-hands", carryType: "held", handsHeld: 2 };
  if (/^held in 1 or 2 hands/.test(s)) return { usage: "held-in-one-plus-hands", carryType: "held", handsHeld: 1 };
  if (/^worn/.test(s)) return { usage: s.replace(/\s+/g, ""), carryType: "worn", handsHeld: 0 };
  return null;
};

function bulkValue(b) {
  const s = String(b ?? "").trim().toUpperCase();
  if (s === "L") return 0.1;
  if (s === "" || s === "-" || s === "0") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** WG markdown-ish description -> HTML. Links to WG content become @UUID links when the import knows the compendium item. */
export function descriptionHtml(text, linkUuid = () => null) {
  const html = esc(text).replace(/\[([^\]]+)\]\(link_(\w+?)_(\d+)\)/g, (_, label, kind, id) => {
    const uuid = linkUuid(kind, Number(id));
    return uuid ? `@UUID[${uuid}]{${label}}` : label;
  }).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p.replace(/\r?\n/g, "<br>")}</p>`).join("");
}

const TYPE_BY_GROUP = { WEAPON: "weapon", ARMOR: "armor", SHIELD: "shield", GENERAL: "equipment" };

/**
 * Build PF2e item data for one WG custom item.
 * look: { traitName(id) -> name|null, validTrait(type, slug) -> bool, ...translateOp ctx }.
 * Returns { data, report } where report = { name, type, ops: [...], traits: { unresolved: [] }, notes: [] }.
 */
export function customItemData(inv, look = {}) {
  const it = inv.item ?? inv;
  const md = it.meta_data ?? {};
  const group = String(it.group ?? "GENERAL").toUpperCase();
  const type = TYPE_BY_GROUP[group] ?? "equipment";
  const notes = [];
  if (!TYPE_BY_GROUP[group]) notes.push(`WG group ${group} imported as equipment`);
  const traits = [];
  const unresolvedTraits = [];
  for (const id of it.traits ?? []) {
    const name = look.traitName?.(id) ?? null;
    const s = name ? slug(name) : null;
    if (s && (!look.validTrait || look.validTrait(type, s))) traits.push(s);
    else unresolvedTraits.push(name ? `${name} (${id}) is not a PF2e ${type} trait` : `trait id ${id} (name not in export)`);
  }
  const ops = (it.operations ?? []).map((op) => translateOp(op, { ...look, itemName: it.name }));
  const rules = ops.filter((o) => o.rule).map((o) => o.rule);
  const passthrough = Array.isArray(md.foundry?.rules) ? md.foundry.rules : [];
  if (passthrough.length) { rules.push(...passthrough); notes.push(`${passthrough.length} PF2e rule(s) passed through from meta_data.foundry.rules`); }

  const price = {};
  for (const k of ["pp", "gp", "sp", "cp"]) if (Number(it.price?.[k])) price[k] = Number(it.price[k]);
  const u = USAGE(it.usage);
  const invested = traits.includes("invested");
  // WG applies a GENERAL item's operations whether or not it is equipped (operation-controller),
  // invested items only while invested, and weapons/armor/shields only while equipped.
  const active = group === "GENERAL" ? (invested ? !!inv.is_invested : true) : !!inv.is_equipped;
  const equipped = u && active
    ? { carryType: u.carryType, handsHeld: u.handsHeld, ...(u.carryType === "worn" ? { inSlot: true } : {}), ...(invested ? { invested: !!inv.is_invested } : {}) }
    : { carryType: "worn", handsHeld: 0, ...(invested ? { invested: !!inv.is_invested } : {}) };
  const system = {
    description: { value: descriptionHtml(it.description, look.linkUuid) },
    level: { value: Number(it.level ?? 0) },
    price: { value: price },
    bulk: { value: bulkValue(it.bulk) },
    quantity: Number(inv.quantity ?? md.quantity ?? 1) || 1,
    traits: { value: traits, rarity: String(it.rarity ?? "common").toLowerCase(), otherTags: [] },
    equipped,
    rules,
    publication: { title: look.sourceName?.(it.content_source_id) ?? "", authors: "", license: "OGL", remaster: true },
  };
  if (u && type === "equipment") system.usage = { value: u.usage };
  if (type === "weapon") {
    Object.assign(system, {
      category: String(md.category ?? "simple").toLowerCase(),
      group: md.group ? String(md.group).toLowerCase() : null,
      damage: { dice: Number(md.damage?.dice ?? 1), die: md.damage?.die ?? "d4", damageType: String(md.damage?.damageType ?? "bludgeoning").toLowerCase() },
      runes: { potency: Number(md.runes?.potency ?? 0), striking: Number(md.runes?.striking ?? 0), property: [...(md.runes?.property ?? [])].map((r) => slug(r?.name ?? r)) },
      range: md.range ? Number(md.range) || null : null,
      reload: { value: md.reload != null && md.reload !== "" ? String(md.reload) : null },
    });
    if (u) system.usage = { value: u.usage };
  } else if (type === "armor") {
    Object.assign(system, {
      category: String(md.category ?? "light").toLowerCase(),
      group: md.group ? String(md.group).toLowerCase() : null,
      acBonus: Number(md.ac_bonus ?? 0), dexCap: Number(md.dex_cap ?? 5), checkPenalty: Number(md.check_penalty ?? 0),
      speedPenalty: Number(md.speed_penalty ?? 0), strength: md.strength != null ? Number(md.strength) : null,
      runes: { potency: Number(md.runes?.potency ?? 0), resilient: Number(md.runes?.resilient ?? 0), property: [...(md.runes?.property ?? [])].map((r) => slug(r?.name ?? r)) },
    });
  } else if (type === "shield") {
    Object.assign(system, { acBonus: Number(md.ac_bonus ?? 2), hardness: Number(md.hardness ?? 0), hp: { value: Number(md.hp ?? 0), max: Number(md.hp_max ?? md.hp ?? 0) } });
  }
  const unresolvedOps = ops.filter((o) => o.status === "unresolved").map((o) => o.raw);
  const data = {
    name: it.name, type, system,
    flags: { [MODULE_ID]: { wgContentId: it.id ?? null, kind: "equipment", customItem: true, wgItemId: it.id ?? null, wgInvId: inv.id ?? null, wgSourceId: it.content_source_id ?? null, ...(unresolvedOps.length ? { wgUnresolvedOps: unresolvedOps } : {}) } },
  };
  return { data, report: { name: it.name, type, wgItemId: it.id ?? null, ops, traits: { mapped: traits, unresolved: unresolvedTraits }, notes } };
}

/** "Custom items" import-report section. reports: [{ name, type, outcome, ops, traits, notes }]. */
export function customItemsHtml(reports) {
  if (!reports?.length) return "";
  const row = (r) => {
    const by = (s) => r.ops.filter((o) => o.status === s);
    const li = (o) => `<li>${esc(o.type)}: ${esc(o.reason)}${o.status === "unresolved" ? ` <code>${esc(JSON.stringify(o.raw?.data ?? o.raw))}</code>` : ""}</li>`;
    const parts = [];
    for (const [s, label] of [["mapped", "Rules"], ["partial", "Partial (note only)"], ["covered", "Covered elsewhere in the import"], ["unresolved", "Unresolved (not applied)"]]) if (by(s).length) parts.push(`<p>${label}:</p><ul>${by(s).map(li).join("")}</ul>`);
    if (r.traits?.unresolved?.length) parts.push(`<p>Unresolved traits:</p><ul>${r.traits.unresolved.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
    if (r.notes?.length) parts.push(`<ul>${r.notes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
    return `<li><strong>${esc(r.name)}</strong> (${esc(r.type)}${r.outcome ? `, ${esc(r.outcome)}` : ""})${parts.join("")}</li>`;
  };
  const n = (s) => reports.reduce((a, r) => a + r.ops.filter((o) => o.status === s).length, 0);
  return `<h4>Custom items</h4><p>${reports.length} item(s); operations: ${n("mapped")} mapped, ${n("partial")} partial, ${n("covered")} covered, ${n("unresolved")} unresolved.</p><ul>${reports.map(row).join("")}</ul>`;
}
