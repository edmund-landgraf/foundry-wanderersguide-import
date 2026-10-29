import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan } from "../scripts/mapping.js";
import { structuralReason, STRUCTURAL_PREFIX } from "../scripts/structural.js";

const pc = () => JSON.parse(readFileSync(new URL("./fixtures/pcs/63.json", import.meta.url)));

test("structuralReason: known rows only, kind-scoped", () => {
  assert.match(structuralReason("equipment", "fist"), new RegExp(`^${STRUCTURAL_PREFIX}`));
  assert.match(structuralReason("feat", "skill-feat"), /placeholder/);
  assert.equal(structuralReason("feat", "fist"), null);
  assert.equal(structuralReason("feat", "power-attack"), null);
});

test("buildPlan reports fist and level-slot placeholders as structural, not entries", () => {
  const exp = pc();
  const ff = (exp.content.feats_features ??= {});
  (ff.generalAndSkillFeats ??= []).push({ id: 999001, name: "Skill Feat", level: 2 });
  const plan = buildPlan(exp);
  const names = plan.structural.map((s) => `${s.kind}:${s.name}`);
  assert.ok(names.includes("equipment:Fist"));
  assert.ok(names.includes("feat:Skill Feat"));
  assert.ok(plan.structural.every((s) => s.status === "structural" && s.sourcePath && s.reason.startsWith(STRUCTURAL_PREFIX)));
  assert.ok(!plan.entries.some((e) => /^(fist|skill feat)$/i.test(e.name)));
});
