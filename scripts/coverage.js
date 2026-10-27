// Coverage ledger (AMBA_REUSE_PLAN section 6). Every source path in a WG v4 export gets exactly one
// status, built from what the plan and the apply step actually did with it (not from a static list
// of keys we believe we handle):
//   mapped              written to the actor (field, created item, homebrew item)
//   included            represented by something else on the actor (PF2e grant, forced attributes, a feat entry)
//   unresolved          a choice or match that needs the user (never guessed)
//   leftover-preserved  not interpreted, but copied verbatim into the actor flag `wgLeftovers`
//   dropped             not imported, with the reason
// Pure: no Foundry globals. Class support is experimental for every class (docs/CLASS_COVERAGE.md).

export const CLASS_SUPPORT_NOTE = "Class support: experimental for every class. No class is verified against WG (see docs/CLASS_COVERAGE.md).";

const DERIVED = new Set(["ac", "proficiencies", "senses", "speeds", "weapons", "total_bulk", "size", "resist_weaks", "shield_item", "armor_item", "character_traits", "spell_raw_data", "spells"]);
const LIBRARY = new Set(["_README", "all_traits", "all_sources", "all_spells", "raw_data_dump"]);
const META = new Set(["created_at", "updated_at", "user_id"]);
const EXPANDED_CONTENT = ["focus_spells", "innate_spells", "inventory_flat"];

/**
 * @param exp     the WG v4 export
 * @param plan    buildPlan(exp); entries carry sourcePath and (after apply) outcome/grantedBy/unresolved
 * @param opts.applied        true after apply (outcomes are facts), false for a preview (planned)
 * @param opts.grantedSlugs   slugs of items PF2e granted on the actor (for WG class/physical features)
 * @param opts.choiceUsed     Set of selection keys whose answer the import used
 */
export function auditImportCoverage(exp, plan, { applied = false, grantedSlugs = new Set(), choiceUsed = new Set(), slug = (s) => s } = {}) {
  const rows = [];
  const add = (path, status, reason) => rows.push({ path, status, reason });
  const ch = exp?.character ?? {};
  const ct = exp?.content ?? {};
  const byPath = new Map(plan.entries.map((e) => [e.sourcePath, e]));
  const planIds = new Set(plan.entries.map((e) => String(e.wgContentId)));
  const tense = applied ? "" : " (planned)";
  const entryRow = (path, e) => {
    if (e.unresolved) return add(path, "unresolved", e.unresolved);
    if (applied && e.outcome === "granted") return add(path, "included", `granted by PF2e via ${e.grantedBy}`);
    if (applied && !e.outcome) return add(path, "dropped", e.error ? `item could not be built: ${e.error}` : "not created");
    if (e.match) return add(path, "mapped", `${e.kind} -> ${e.match.uuid}${tense}`);
    return add(path, "mapped", `${e.kind} -> homebrew world item (no compendium match)${tense}`);
  };

  // character.*
  for (const [k, v] of Object.entries(ch)) {
    const path = `character.${k}`;
    if (k === "id") add(path, "mapped", "actor flag wgId");
    else if (k === "name") add(path, "mapped", "actor name");
    else if (k === "level") add(path, "mapped", "system.details.level");
    else if (k === "hero_points") add(path, "mapped", "hero points (first import only; Foundry value kept on re-import)");
    else if (META.has(k)) add(path, "dropped", "export metadata");
    else if (k === "details") {
      for (const dk of Object.keys(v ?? {})) {
        const dp = `${path}.${dk}`;
        if (dk === "ancestry" || dk === "background" || dk === "class") { const e = byPath.get(dp); e ? entryRow(dp, e) : add(dp, "dropped", "no name in export"); }
        else if (dk === "image_url" || (dk === "info" && v.info?.image_url)) add(dp, "mapped", "actor and token image");
        else if (dk === "api_clients") add(dp, "dropped", "WG access grants, not character data");
        else add(dp, "leftover-preserved", "kept in flags.wgLeftovers");
      }
    } else if (k === "inventory") {
      for (const ik of Object.keys(v ?? {})) {
        const ip = `${path}.${ik}`;
        if (ik === "coins") add(ip, "mapped", "currency (first import only; Foundry value kept on re-import)");
        else if (ik === "items") add(ip, "included", "imported from content.inventory_flat");
        else add(ip, "leftover-preserved", "kept in flags.wgLeftovers");
      }
    } else if (k === "operation_data") {
      for (const ok of Object.keys(v ?? {})) {
        if (ok !== "selections") { add(`${path}.${ok}`, "leftover-preserved", "kept in flags.wgLeftovers"); continue; }
        for (const [sk, sv] of Object.entries(v.selections ?? {})) {
          const sp = `${path}.selections.${sk}`;
          const val = String(sv);
          if (choiceUsed.has(sk)) add(sp, "mapped", "answered a PF2e ChoiceSet");
          else if (planIds.has(val)) add(sp, "included", `chose WG item ${val}, imported as its own entry`);
          else if (val.startsWith("ATTRIBUTE_")) add(sp, "included", "attribute boosts: final modifiers forced from content.attributes");
          else if (val.startsWith("SKILL_")) add(sp, "dropped", "skill training selection: skills are not imported (PF2e derives them from its own choices)");
          else add(sp, "unresolved", "WG select answer with no PF2e target; review manually");
        }
      }
    } else add(path, "leftover-preserved", "kept in flags.wgLeftovers");
  }

  // content.*
  for (const [k, v] of Object.entries(ct)) {
    const path = `content.${k}`;
    if (LIBRARY.has(k)) add(path, "dropped", "library reference data, not character state");
    else if (k === "max_hp") add(path, "mapped", "max HP (HP adjustment effect carries any difference)");
    else if (k === "attributes") add(path, "mapped", "attribute modifiers (manual)");
    else if (k === "languages") add(path, "mapped", "languages (unknown slugs to the free-text field)");
    else if (k === "spell_sources" || k === "spell_slots") add(path, "mapped", "spellcasting entries");
    else if (k === "feats_features") {
      for (const [g, list] of Object.entries(v ?? {})) {
        (list ?? []).forEach((f, i) => {
          const fp = `${path}.${g}[${i}]`;
          const e = byPath.get(fp);
          if (e) entryRow(fp, e);
          else if (grantedSlugs.has(slug(f?.name))) add(fp, "included", "granted by PF2e from the class/ancestry");
          else if (/ Feat$/.test(f?.name ?? "")) add(fp, "included", "feat slot; the chosen feat is its own entry");
          else add(fp, applied ? "leftover-preserved" : "leftover-preserved", "WG feature with no PF2e item on the actor; kept in flags.wgLeftovers");
        });
      }
    } else if (k === "spells" && Array.isArray(v?.all)) {
      v.all.forEach((s, i) => { const fp = `${path}.all[${i}]`; const e = byPath.get(fp); e ? entryRow(fp, e) : add(fp, "dropped", "duplicate of another spell entry (same id and rank)"); });
      for (const sk of Object.keys(v).filter((x) => x !== "all")) add(`${path}.${sk}`, "dropped", "derived spell view; PF2e recomputes");
    } else if (EXPANDED_CONTENT.includes(k) && Array.isArray(v)) {
      v.forEach((x, i) => {
        const fp = `${path}[${i}]`;
        const e = byPath.get(fp);
        if (e) entryRow(fp, e);
        else if (k === "inventory_flat") add(fp, "dropped", "built-in strike (fist), not an item");
        else add(fp, "dropped", "duplicate of another spell entry (same id and rank)");
      });
    } else if (DERIVED.has(k)) add(path, "dropped", "derived by WG; PF2e recomputes it");
    else add(path, "leftover-preserved", "kept in flags.wgLeftovers");
  }
  if (!("version" in (exp ?? {}))) add("version", "dropped", "missing");
  else add("version", "mapped", "export format check (v4)");

  const counts = { mapped: 0, included: 0, unresolved: 0, "leftover-preserved": 0, dropped: 0 };
  for (const r of rows) counts[r.status]++;
  return { rows, counts, classSupport: CLASS_SUPPORT_NOTE };
}

/** Values of every leftover-preserved path, for flags.wgLeftovers. */
export function leftoverValues(exp, ledger) {
  const out = {};
  for (const r of ledger.rows) {
    if (r.status !== "leftover-preserved") continue;
    let v = exp;
    for (const part of r.path.replace(/\[(\d+)\]/g, ".$1").split(".")) v = v?.[part];
    out[r.path] = v ?? null;
  }
  return out;
}