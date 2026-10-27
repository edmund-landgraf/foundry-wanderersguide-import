// Golden snapshots of the pure import pipeline for the eight sanitized test PCs (AMBA_REUSE_PLAN gate 1).
// Regenerate deliberately with `npm run golden:update` and review the diff before committing.
import { readFileSync } from "node:fs";
import { buildPlan, matchEntries, missReport, wgChoiceHints, spellcastingPlan, diffPlan, parityCheck } from "../../scripts/mapping.js";
import { diffHtml, parityHtml } from "../../scripts/importer.js";

export const PCS = [63, 64, 66, 71, 72, 74, 76, 78];
const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/pcs/${name}`, import.meta.url)));

export function goldenFor(id) {
  const exp = fixture(`${id}.json`);
  const { index, actor } = fixture(`${id}.foundry.json`);
  const plan = buildPlan(exp);
  const matched = matchEntries(plan.entries, index);
  const misses = missReport(matched);
  const insert = diffPlan(plan, null);
  const update = diffPlan(plan, actor);
  const parity = parityCheck(plan, actor);
  return {
    plan,
    match: matched.map((m) => `${m.kind}: ${m.name} -> ${m.match ? m.match.uuid : "MISS"} (${m.via})`),
    misses,
    choiceHints: Object.fromEntries(wgChoiceHints(exp)),
    spellcasting: spellcastingPlan(exp),
    preview: { insert, update, html: diffHtml(plan, update, misses) },
    parity: { ok: parity.ok, passed: parity.passed, failed: parity.failed, html: parityHtml(plan.name, parity) },
  };
}

export const goldenUrl = (id) => new URL(`./${id}.json`, import.meta.url);