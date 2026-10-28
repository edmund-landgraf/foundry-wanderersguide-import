// Alchemist (and other crafter) formula handling: WG exports formulas as inventory items with
// is_formula=true; PF2e keeps them as UUID references in system.crafting.formulas.
// Pack preference order and the rename-then-match flow follow Pathmuncher's #processFormulas
// (https://github.com/MrPrimate/pathmuncher), MIT License, Copyright (c) 2023 Jack Holloway.
import { itemNameCandidates } from "./item-renames.js";

export const FORMULA_PACK_ORDER = ["pf2e.equipment-srd", "sf2e.equipment", "pf2e-legacy-content.formulas-legacy", "pf2e-legacy-content.equipment-legacy"];
export const FORMULA_TYPES = ["consumable", "weapon", "equipment", "armor", "shield", "backpack", "treasure", "ammo", "kit"];

const slugOf = (s) => String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\(remastered\)/g, "").replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const packOf = (uuid) => { const m = /^Compendium\.([^.]+\.[^.]+)\./.exec(String(uuid ?? "")); return m ? m[1] : "world"; };
const rank = (uuid) => { const i = FORMULA_PACK_ORDER.indexOf(packOf(uuid)); return i < 0 ? FORMULA_PACK_ORDER.length : i; };

/** Resolve one formula entry against the compendium index; keeps the matched item's own type. */
export function resolveFormula(entry, index) {
  for (const [via, name] of itemNameCandidates(entry.name)) {
    const slug = slugOf(name);
    const seen = new Set();
    const rows = (index ?? []).filter((r) => FORMULA_TYPES.includes(r.type) && (r.slug === slug || slugOf(r.name) === slug) && !seen.has(r.uuid) && seen.add(r.uuid));
    if (!rows.length) continue;
    const best = Math.min(...rows.map((r) => rank(r.uuid)));
    let top = rows.filter((r) => rank(r.uuid) === best);
    if (top.length > 1 && entry.level != null) { const l = top.filter((r) => r.level === entry.level); if (l.length) top = l; }
    if (top.length === 1) return { ...entry, match: top[0], via: `formula:${via}` };
    return { ...entry, match: null, via: "ambiguous", candidates: top.map((r) => r.uuid) };
  }
  return { ...entry, match: null, via: "miss" };
}

/** Existing formulas first, then new ones; deduped by UUID; always {uuid} objects. */
export function mergeFormulas(existing = [], uuids = []) {
  const seen = new Set();
  const out = [];
  for (const f of [...(existing ?? []), ...(uuids ?? [])]) {
    const u = typeof f === "string" ? f : f?.uuid;
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({ uuid: u });
  }
  return out;
}

/** WG's EXTRA_ITEM_IDS variable: items WG grants itself (e.g. Versatile Vial) that PF2e also grants. */
export function extraItemIds(exp) {
  const v = exp?.content?.raw_data_dump?.variables?.EXTRA_ITEM_IDS?.value;
  return new Set((Array.isArray(v) ? v : []).map(String));
}

/** Map child inventory id -> parent inventory id from WG's nested character.inventory.items tree. */
export function containerParents(exp) {
  const parents = new Map();
  const walk = (items, parent, depth) => {
    if (depth > 10) return;
    for (const inv of items ?? []) {
      if (!inv?.id) continue;
      if (parent) parents.set(inv.id, parent);
      walk(inv.container_contents, inv.id, depth + 1);
    }
  };
  walk(exp?.character?.inventory?.items, null, 0);
  return parents;
}

/** Give container items an _id and point their children at it. Returns warnings for unplaced children. */
export function assignContainers(entries, randomID) {
  const byInv = new Map(entries.filter((e) => e.kind === "equipment" && e.data && e.wgInvId).map((e) => [e.wgInvId, e]));
  const warnings = [];
  for (const e of byInv.values()) {
    if (!e.parentInvId) continue;
    const parent = byInv.get(e.parentInvId);
    if (parent?.data?.type !== "backpack") { warnings.push(`${e.name}: container not imported as a PF2e container; placed loose`); continue; }
    parent.data._id ??= randomID();
    e.data.system = { ...(e.data.system ?? {}), containerId: parent.data._id };
  }
  return warnings;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Formulas section for the import report and the dry-run review. */
export function formulasHtml(entries, plan = {}) {
  const f = (entries ?? []).filter((e) => e.kind === "formula");
  const extras = plan.grantedExtras ?? [];
  if (!f.length && !extras.length) return "";
  const ok = f.filter((e) => e.match);
  const bad = f.filter((e) => !e.match);
  const li = (e) => `<li>${esc(e.name)}${e.match ? ` &rarr; ${esc(e.match.name)} <span class="notes">(${esc(packOf(e.match.uuid))})</span>` : ` &mdash; <b>${e.via === "ambiguous" ? "ambiguous" : "no compendium match"}</b>`}</li>`;
  return `<h4>Formulas</h4><p>${ok.length}/${f.length} formulas added to the formula book.</p>`
    + (f.length ? `<ul>${[...ok, ...bad].map(li).join("")}</ul>` : "")
    + (extras.length ? `<p class="notes">Not imported as items (PF2e grants them itself): ${extras.map(esc).join(", ")}.</p>` : "")
    + (f.length ? `<p class="notes">Daily preparation (advanced alchemy, versatile vials) is left to PF2e's crafting tab.</p>` : "");
}
