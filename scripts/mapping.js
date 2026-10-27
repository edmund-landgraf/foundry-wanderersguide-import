// Pure mapping: WG JSON v4 export -> import plan. No Foundry globals here, so it is unit-testable in Node.

export function sluggify(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\((remastered|legacy)\)/gi, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const SKIP_ITEMS = new Set(["fist"]);

const ATTR_KEYS = { STR: "str", DEX: "dex", CON: "con", INT: "int", WIS: "wis", CHA: "cha" };

function attrMod(v) {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") return Number(v.value ?? 0);
  return 0;
}

export function buildPlan(exp) {
  const ch = exp.character ?? {};
  const ct = exp.content ?? {};
  const ff = ct.feats_features ?? {};
  const entries = [];
  const add = (kind, packType, name, extra = {}) => {
    if (!name) return;
    entries.push({ kind, packType, name, slug: sluggify(name), ...extra });
  };

  add("ancestry", "ancestry", ch.details?.ancestry?.name, { wgContentId: ch.details?.ancestry?.id });
  for (const h of ff.heritages ?? []) add("heritage", "heritage", h.name, { wgContentId: h.id });
  add("background", "background", ch.details?.background?.name, { wgContentId: ch.details?.background?.id });
  add("class", "class", ch.details?.class?.name, { wgContentId: ch.details?.class?.id });
  for (const group of ["ancestryFeats", "classFeats", "generalAndSkillFeats", "otherFeats"]) {
    for (const f of ff[group] ?? []) add("feat", "feat", f.name, { wgContentId: f.id, level: f.level ?? null });
  }
  const seenSpells = new Set();
  for (const s of [...(ct.spells?.all ?? []), ...(ct.focus_spells ?? [])]) {
    const key = `${s.id}:${s.rank}`;
    if (seenSpells.has(key)) continue;
    seenSpells.add(key);
    add("spell", "spell", s.name, { wgContentId: s.id, rank: s.rank, castingSource: s.casting_source });
  }
  for (const s of ct.innate_spells ?? []) add("spell", "spell", s.spell?.name, { wgContentId: s.spell?.id, rank: s.rank, innate: true });
  for (const inv of ct.inventory_flat ?? []) {
    const it = inv.item ?? inv;
    if (SKIP_ITEMS.has(sluggify(it.name))) continue; // built-in strikes, not items
    add("equipment", "equipment", it.name, { wgContentId: it.id, quantity: inv.quantity ?? it.meta_data?.quantity ?? 1, equipped: !!inv.is_equipped });
  }

  const attributes = {};
  for (const [k, v] of Object.entries(ct.attributes ?? {})) {
    const short = ATTR_KEYS[k.replace(/^ATTRIBUTE_/, "")];
    if (short) attributes[short] = attrMod(v);
  }

  return {
    wgId: ch.id,
    name: ch.name ?? "Unnamed",
    level: Number(ch.level ?? 1),
    maxHp: typeof ct.max_hp === "number" ? ct.max_hp : null,
    imageUrl: ch.details?.image_url || ch.details?.info?.image_url || null,
    languages: (ct.languages ?? []).map((l) => sluggify(l)),
    attributes,
    entries,
  };
}

/** Match entries against a compendium index: slug first, then name, then name+level. */
export function matchEntries(entries, index) {
  const bySlug = new Map();
  const byName = new Map();
  for (const row of index) {
    const k = `${row.type}:`;
    if (row.slug && !bySlug.has(k + row.slug)) bySlug.set(k + row.slug, row);
    const n = k + String(row.name).toLowerCase();
    (byName.get(n) ?? byName.set(n, []).get(n)).push(row);
  }
  const typesFor = (pt) => (pt === "equipment" ? ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "kit"] : [pt]);
  return entries.map((e) => {
    for (const t of typesFor(e.packType)) {
      const hit = bySlug.get(`${t}:${e.slug}`);
      if (hit) return { ...e, match: hit, via: "slug" };
    }
    for (const t of typesFor(e.packType)) {
      const list = byName.get(`${t}:${e.name.toLowerCase()}`);
      if (list?.length) {
        const lvl = e.level != null ? list.find((r) => r.level === e.level) : null;
        return { ...e, match: lvl ?? list[0], via: lvl ? "name+level" : "name" };
      }
    }
    return { ...e, match: null, via: "miss" };
  });
}

export function missReport(matched) {
  return matched.filter((m) => !m.match).map((m) => `${m.kind}: ${m.name}`);
}

export const FALLBACK_IMG = "icons/svg/mystery-man.svg";
/**
 * WG portrait URL -> something Foundry can load directly. Absolute http(s)/data URLs pass through
 * (WG public storage serves Access-Control-Allow-Origin: *, so tokens/WebGL can use it without
 * downloading). Relative storage paths resolve against the functions host (Supabase/Kong origin).
 */
export function resolveImageUrl(raw, functionsUrl) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (/^(https?:|data:)/i.test(v)) return v;
  let origin;
  try { origin = new URL(functionsUrl).origin; } catch { return null; }
  if (v.startsWith("/")) return origin + v;
  if (v.startsWith("storage/")) return `${origin}/${v}`;
  return `${origin}/storage/v1/object/public/${v.replace(/^\/+/, "")}`;
}