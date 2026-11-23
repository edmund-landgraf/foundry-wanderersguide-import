import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODULE_ID } from "../scripts/constants.js";
import { buildPlan, matchEntries, wgChoiceHints, selectedKeyAttribute, selectedKeyAttributeAnswers, diffPlan, parityCheck } from "../scripts/mapping.js";
import {
  applyKeyAbilityData,
  reconcileClassKeyAbility,
  legalKeyOptions,
  ruleDependsOnActor,
  prefillChoices,
  choiceContext,
  resolveChoiceSet,
  emptyChoicePrompt,
  inactiveChoicePrompt,
  domainPromptWithoutDeity,
} from "../scripts/importer.js";

// PF2e 8.6.1 Psychic: the class item itself has an empty keyAbility list.
// Emotional Acceptance (Subconscious Mind) contributes subfeatures.keyOptions: ["cha"].
// The Distant Grasp dedicationCantrip ChoiceSet is only for Psychic Dedication.
const DEDICATION_CANTRIP = {
  adjustName: false,
  choices: "flags.system.psychic.dedication.psiCantrips",
  flag: "dedicationCantrip",
  key: "ChoiceSet",
  predicate: ["feat:psychic-dedication"],
  prompt: "PF2E.SpecificRule.Prompt.PsiCantrip",
  rollOption: "selected-psi-cantrip",
};
const CONSCIOUS_MIND = {
  adjustName: false,
  choices: { filter: ["item:tag:psychic-conscious-mind"] },
  flag: "consciousMind",
  key: "ChoiceSet",
  prompt: "PF2E.SpecificRule.Prompt.ConsciousMind",
};
const SUBCONSCIOUS_MIND = {
  adjustName: false,
  choices: { filter: ["item:tag:psychic-subconscious-mind"] },
  flag: "subconsciousMind",
  key: "ChoiceSet",
  prompt: "PF2E.SpecificRule.Prompt.SubconsciousMind",
};

const distantUuid = "Compendium.pf2e.classfeatures.Item.The Distant Grasp";
const emotionUuid = "Compendium.pf2e.classfeatures.Item.Emotional Acceptance";

const feature = (id, name, op, options) => ({ id, name, type: "class-feature", operations: [{ id: op, type: "select", data: { optionsPredefined: options } }] });
const emotionOption = { id: "4002", title: "Emotional Acceptance", operations: [{ type: "setValue", data: { variable: "CLASS_DC", value: { value: "T", attribute: "ATTRIBUTE_CHA" } } }] };

function psychicExport({ useClassDc = true } = {}) {
  const conscious = feature(4010, "Conscious Mind", "cm-op", [{ id: "4001", title: "The Distant Grasp" }]);
  const subconscious = feature(4011, "Subconscious Mind", "sm-op", [emotionOption]);
  return {
    character: {
      id: 100,
      name: "Mirelle Quietvoice",
      level: 1,
      details: { class: { id: 30, name: "Psychic" }, ancestry: { id: 1, name: "Halfling" }, background: { id: 2, name: "Scholar" } },
      operation_data: { selections: { "class-feature-4010_cm-op": "4001", "class-feature-4011_sm-op": "4002" } },
    },
    content: {
      max_hp: 13,
      attributes: { ATTRIBUTE_STR: { value: -1 }, ATTRIBUTE_DEX: { value: 2 }, ATTRIBUTE_CON: { value: 1 }, ATTRIBUTE_INT: { value: 0 }, ATTRIBUTE_WIS: { value: 3 }, ATTRIBUTE_CHA: { value: 4 } },
      feats_features: {
        classFeatures: [conscious, subconscious, { id: 4001, name: "The Distant Grasp", type: "class-feature" }, { id: 4002, name: "Emotional Acceptance", type: "class-feature" }],
        ancestryFeats: [{ id: 9, name: "Halfling Luck", level: 1 }],
        generalAndSkillFeats: [{ id: 8, name: "Assurance (Occultism)", level: 1 }],
      },
      spells: { all: [
        { id: 11, name: "Telekinetic Hand (Psi)", rank: 0, casting_source: "OCCULT" },
        { id: 12, name: "Telekinetic Projectile (Psi)", rank: 0, casting_source: "OCCULT" },
        { id: 13, name: "Telekinetic Rend", rank: 0, casting_source: "OCCULT" },
        { id: 14, name: "Daze", rank: 0, casting_source: "OCCULT" },
        { id: 15, name: "Force Barrage", rank: 1, casting_source: "OCCULT" },
      ] },
      ...(useClassDc ? { raw_data_dump: { variables: { CLASS_DC: { value: { attribute: "ATTRIBUTE_CHA" } }, FOCUS_POINT_BONUS: { value: 1 } } } } : {}),
      focus_spells: [{ id: 13, name: "Telekinetic Rend", rank: 0 }],
    },
  };
}

const catalog = JSON.parse(readFileSync(new URL("./fixtures/match-catalog.min.json", import.meta.url)));

function psychicActor({ selected = null, keyOptions = [], includeMind = true } = {}) {
  const cls = {
    id: "psychic",
    type: "class",
    flags: { [MODULE_ID]: { kind: "class" } },
    system: { keyAbility: { value: [], selected } },
  };
  const mind = {
    id: "emotion",
    type: "feat",
    name: "Emotional Acceptance",
    system: { category: "classfeature", level: { value: 1 }, subfeatures: { keyOptions: ["cha"] }, traits: { value: ["psychic"] } },
  };
  const writes = [];
  const actor = {
    items: includeMind ? [cls, mind] : [cls],
    system: { build: { attributes: { keyOptions } } },
    async updateEmbeddedDocuments(type, updates) {
      writes.push(updates);
      cls.system.keyAbility.selected = updates[0]["system.keyAbility.selected"];
    },
  };
  return { cls, mind, actor, writes };
}

test("53: Psychic class item with an empty keyAbility list still receives Cha", () => {
  const data = { system: { keyAbility: { value: [], selected: null } } };
  applyKeyAbilityData({ kind: "class", keyAbility: "cha" }, data);
  assert.deepEqual(data.system.keyAbility, { value: [], selected: "cha" });
});

test("53: reconcile sets Cha from Emotional Acceptance even after Class prepare wipes keyOptions", async () => {
  // PF2e Class.prepareActorData assigns keyOptions = class.keyAbility.value ([] for Psychic).
  const { cls, actor, writes } = psychicActor({ selected: null, keyOptions: [] });
  assert.deepEqual(legalKeyOptions(actor).sort(), ["cha"]);
  assert.equal(await reconcileClassKeyAbility(actor, "cha"), true);
  assert.equal(cls.system.keyAbility.selected, "cha");
  assert.equal(writes.length, 1);
  assert.equal(await reconcileClassKeyAbility(actor, "cha"), true, "identical re-import is a no-op");
  assert.equal(writes.length, 1);
  assert.deepEqual(cls.system.keyAbility.value, []);
});

test("53: Psychic rejects a key attribute Emotional Acceptance does not offer", async () => {
  const { cls, actor, writes } = psychicActor({ selected: null, keyOptions: [] });
  assert.equal(await reconcileClassKeyAbility(actor, "int"), false);
  assert.equal(cls.system.keyAbility.selected, null);
  assert.equal(writes.length, 0);
  const noMind = psychicActor({ selected: null, keyOptions: [], includeMind: false });
  assert.deepEqual(legalKeyOptions(noMind.actor), []);
  assert.equal(await reconcileClassKeyAbility(noMind.actor, "cha"), false);
});

test("53: buildPlan reads Psychic Cha from CLASS_DC and from Emotional Acceptance", () => {
  const withDump = buildPlan(psychicExport());
  assert.equal(withDump.keyAbility, "cha");
  assert.equal(withDump.focusMax, 2);
  assert.equal(withDump.entries.find((e) => e.kind === "class")?.name, "Psychic");

  const fromMind = psychicExport({ useClassDc: false });
  assert.equal(selectedKeyAttribute(fromMind), "ATTRIBUTE_CHA");
  assert.equal(buildPlan(fromMind).keyAbility, "cha");
  const answers = selectedKeyAttributeAnswers(fromMind);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].attribute, "ATTRIBUTE_CHA");
});

test("53: Distant Grasp dedicationCantrip is actor-dependent; Conscious Mind is prefillable", () => {
  assert.equal(ruleDependsOnActor(DEDICATION_CANTRIP), true);
  assert.equal(ruleDependsOnActor(CONSCIOUS_MIND), false);
  assert.equal(ruleDependsOnActor(SUBCONSCIOUS_MIND), false);
});

test("53: prefill does not record Distant Grasp dedicationCantrip as unresolved", async () => {
  const data = { name: "The Distant Grasp", system: { rules: [structuredClone(DEDICATION_CANTRIP)] } };
  const ctx = choiceContext(psychicExport(), {}, [], null);
  const notes = [];
  await prefillChoices(data, ctx, notes, "The Distant Grasp", 4001);
  assert.equal(data.system.rules[0].selection, undefined);
  assert.equal(ctx.unresolved.some((u) => u.flag === "dedicationCantrip" || /dedicationCantrip/i.test(u.reason ?? "")), false);
  assert.equal(notes.length, 0);
});

test("53: Conscious Mind and Subconscious Mind prefill The Distant Grasp and Emotional Acceptance", async () => {
  const index = [
    { type: "feat", name: "The Distant Grasp", uuid: distantUuid },
    { type: "feat", name: "Emotional Acceptance", uuid: emotionUuid },
  ];
  const docs = {
    [distantUuid]: { type: "feat", system: { traits: { otherTags: ["psychic-conscious-mind"], value: ["psychic"] } } },
    [emotionUuid]: { type: "feat", system: { traits: { otherTags: ["psychic-subconscious-mind"], value: ["psychic"] } } },
  };
  const original = globalThis.fromUuid;
  globalThis.fromUuid = async (uuid) => docs[uuid] ?? null;
  try {
    const exp = psychicExport();
    const hints = wgChoiceHints(exp);
    assert.deepEqual(hints.get("conscious-mind"), ["The Distant Grasp"]);
    assert.deepEqual(hints.get("subconscious-mind"), ["Emotional Acceptance"]);

    const ctx = choiceContext(exp, {}, index, null);
    const conscious = await resolveChoiceSet(CONSCIOUS_MIND, "Conscious Mind", ctx, { ownerWgId: 4010 });
    assert.equal(conscious.value, distantUuid);
    const subconscious = await resolveChoiceSet(SUBCONSCIOUS_MIND, "Subconscious Mind", ctx, { ownerWgId: 4011 });
    assert.equal(subconscious.value, emotionUuid);

    const previousFoundry = globalThis.foundry;
    globalThis.foundry = { utils: { setProperty(obj, path, value) {
      const parts = path.split(".");
      let cur = obj;
      for (const part of parts.slice(0, -1)) cur = (cur[part] ??= {});
      cur[parts.at(-1)] = value;
    } } };
    try {
      const mindData = { name: "Conscious Mind", system: { rules: [structuredClone(CONSCIOUS_MIND), { key: "GrantItem", uuid: "{item|flags.system.rulesSelections.consciousMind}" }] } };
      const notes = [];
      await prefillChoices(mindData, choiceContext(exp, {}, index, null), notes, "Conscious Mind", 4010);
      assert.equal(mindData.system.rules[0].selection, distantUuid);
      assert.equal(notes.some((n) => /The Distant Grasp/.test(n)), true);
    } finally {
      globalThis.foundry = previousFoundry;
    }
  } finally {
    globalThis.fromUuid = original;
  }
});

test("53: an empty Distant Grasp dedicationCantrip prompt is inactive, not unresolved", () => {
  const app = {
    title: "Select a Psi Cantrip",
    choices: [],
    item: { name: "The Distant Grasp", system: { rules: [structuredClone(DEDICATION_CANTRIP)] } },
  };
  assert.equal(emptyChoicePrompt(app), true);
  assert.equal(inactiveChoicePrompt(app), true);
  assert.equal(domainPromptWithoutDeity(app), false);
  assert.equal(inactiveChoicePrompt({ title: "Cultural Adaptability", choices: [], item: { name: "Cultural Adaptability", system: { rules: [] } } }), false);
  assert.equal(inactiveChoicePrompt({ title: "Psi Cantrip", choices: [{ label: "Telekinetic Hand" }], item: { system: { rules: [DEDICATION_CANTRIP] } } }), false);
});

test("53: psi cantrips alias to the remaster cantrips and are not left unmatched", () => {
  const plan = buildPlan(psychicExport());
  const names = plan.entries.filter((e) => e.kind === "spell").map((e) => e.name);
  assert.ok(names.includes("Telekinetic Hand (Psi)"));
  assert.ok(names.includes("Telekinetic Projectile (Psi)"));
  assert.ok(names.includes("Telekinetic Rend"));
  const index = [
    { type: "spell", slug: "telekinetic-hand", name: "Telekinetic Hand", uuid: "U:telekinetic-hand" },
    { type: "spell", slug: "telekinetic-projectile", name: "Telekinetic Projectile", uuid: "U:telekinetic-projectile" },
    { type: "spell", slug: "telekinetic-rend", name: "Telekinetic Rend", uuid: "U:telekinetic-rend" },
    { type: "spell", slug: "daze", name: "Daze", uuid: "U:daze" },
    { type: "spell", slug: "force-barrage", name: "Force Barrage", uuid: "U:force-barrage" },
  ];
  const matched = matchEntries(plan.entries.filter((e) => e.kind === "spell"), index, { catalog });
  const byName = Object.fromEntries(matched.map((e) => [e.name, e]));
  assert.equal(byName["Telekinetic Hand (Psi)"].via, "catalog-alias");
  assert.equal(byName["Telekinetic Hand (Psi)"].match.uuid, "U:telekinetic-hand");
  assert.equal(byName["Telekinetic Projectile (Psi)"].via, "catalog-alias");
  assert.equal(byName["Telekinetic Projectile (Psi)"].match.uuid, "U:telekinetic-projectile");
  assert.equal(byName["Telekinetic Rend"].via, "slug");
  assert.equal(byName["Telekinetic Rend"].match.uuid, "U:telekinetic-rend");
});

test("53: re-import keeps the Psychic class Cha selection", async () => {
  const plan = buildPlan(psychicExport());
  assert.equal(plan.keyAbility, "cha");
  const { cls, actor, writes } = psychicActor({ selected: "cha", keyOptions: [] });
  // Actor already imported once: class selected is cha, Emotional Acceptance is present.
  assert.equal(await reconcileClassKeyAbility(actor, plan.keyAbility), true);
  assert.equal(writes.length, 0);
  assert.equal(cls.system.keyAbility.selected, "cha");

  // Conscious / Subconscious minds are granted by the class, not planned as WG feat entries.
  const classEntry = { kind: "class", name: "Psychic", slug: "psychic", ours: true };
  const classPlan = { ...plan, entries: [classEntry] };
  const actorState = {
    name: plan.name,
    level: plan.level,
    hpMax: plan.maxHp,
    attributes: plan.attributes,
    languages: plan.languages,
    items: [{ type: "class", name: "Psychic", slug: "psychic", ours: true, kind: "class" }],
  };
  const d = diffPlan(classPlan, actorState);
  assert.deepEqual([d.add, d.remove], [[], []]);
  assert.equal(parityCheck(classPlan, actorState).ok, true);
});
