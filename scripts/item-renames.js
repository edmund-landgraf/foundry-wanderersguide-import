// WG item name -> PF2e compendium name normalization.
// The approach (an explicit rename table plus a "Greater X" <-> "X (Greater)" grade swap,
// tried in order before giving up) is adapted from Pathmuncher by Jack Holloway
// (https://github.com/MrPrimate/pathmuncher), MIT License, Copyright (c) 2023 Jack Holloway.
// See THIRD_PARTY_NOTICES.md for the full license text.

export const GRADE_WORDS = ["Minor", "Lesser", "Moderate", "Standard", "Greater", "Major", "True"];

// Legacy (pre-remaster) names WG still serves -> current PF2e names. Keep this list to renames
// verified against the PF2e system; unknown names fall through to the grade swap and then miss.
export const WG_ITEM_RENAMES = {
  "Tanglefoot Bag": "Glue Bomb",
  "Alchemist's Tools": "Alchemist's Toolkit",
  "Healer's Tools": "Healer's Toolkit",
  "Thieves' Tools": "Thieves' Toolkit",
  "Repair Kit": "Repair Toolkit",
};

const GRADES = GRADE_WORDS.join("|");
const PREFIX = new RegExp(`^(${GRADES}) (.+)$`);
const SUFFIX = new RegExp(`^(.+) \\((${GRADES})\\)$`);

const renameBase = (name) => {
  const m = SUFFIX.exec(name);
  if (m && WG_ITEM_RENAMES[m[1]]) return `${WG_ITEM_RENAMES[m[1]]} (${m[2]})`;
  return WG_ITEM_RENAMES[name] ?? null;
};

/** Ordered [via, name] candidates: exact, rename table, grade swap (both directions), rename of the swap. */
export function itemNameCandidates(name) {
  const n = String(name ?? "").trim();
  const out = [];
  const push = (via, v) => { if (v && !out.some(([, x]) => x === v)) out.push([via, v]); };
  push("exact", n);
  push("rename", renameBase(n));
  const p = PREFIX.exec(n);
  const s = SUFFIX.exec(n);
  const swapped = p ? `${p[2]} (${p[1]})` : s ? `${s[2]} ${s[1]}` : null;
  push("grade-swap", swapped);
  if (swapped) push("grade-swap+rename", renameBase(swapped));
  return out;
}
