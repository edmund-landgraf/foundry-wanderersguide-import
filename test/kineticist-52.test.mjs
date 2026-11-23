import test from "node:test";
import assert from "node:assert/strict";
import { matchChoice, wgChoiceHints } from "../scripts/mapping.js";
import {
  choiceContext,
  uniqueChoice,
  exactSlugGrant,
  coverFeatureGaps,
  watchPrompts,
} from "../scripts/importer.js";

// Sanitized from the PC 99 WG v4 export (Ashka Cinderfall): Kinetic Gate
// selections and the nested Single Gate -> Element -> Fire Impulse tree.
// No private character fields.

const GATE_ID = 21797;
const SINGLE = "f7010cd6-7380-4cea-9ea3-53aa1096b4f2";
const ELEMENT_OP = "3c3128e0-3412-4cf6-866c-0d61a5691d03";
const FIRE = "3c05f194-bf46-4352-abaa-2f0a6f21b59d";
const IMPULSE_ONE_OP = "002bde5d-00a0-4496-91aa-d2e6ca13c992";
const IMPULSE_TWO_OP = "33b9a1f9-2275-4ef1-8af2-130236fa7893";
const GATE_SEL = "0c9adda9-f73f-4cbf-977f-5f0fa02aa2f9";

const GATE_OPTIONS = ["Air Gate", "Earth Gate", "Fire Gate", "Metal Gate", "Water Gate", "Wood Gate"];
const FIRE_UUID = "Compendium.pf2e.classfeatures.Item.PfeDtJBJdUun0THS";
const FLYING_UUID = "Compendium.pf2e.feats-srd.Item.FlyingFlame";
const COLUMN_UUID = "Compendium.pf2e.feats-srd.Item.ScorchingColumn";

function pc99() {
  return {
    version: 4,
    character: {
      id: 99,
      name: "Ashka Cinderfall",
      details: { class: { id: 38, name: "Kineticist" } },
      operation_data: {
        selections: {
          [`class-feature-${GATE_ID}_${GATE_SEL}`]: SINGLE,
          [`class-feature-${GATE_ID}_${GATE_SEL}_${SINGLE}_${ELEMENT_OP}`]: FIRE,
          [`class-feature-${GATE_ID}_${GATE_SEL}_${SINGLE}_${ELEMENT_OP}_${FIRE}_${IMPULSE_ONE_OP}`]: 21430,
          [`class-feature-${GATE_ID}_${GATE_SEL}_${SINGLE}_${ELEMENT_OP}_${FIRE}_${IMPULSE_TWO_OP}`]: 21497,
        },
      },
    },
    content: {
      feats_features: {
        classFeatures: [{
          id: GATE_ID,
          name: "Kinetic Gate",
          type: "class-feature",
          operations: [{
            id: GATE_SEL,
            type: "select",
            data: {
              title: "Kinetic Gate",
              optionsPredefined: [
                {
                  id: SINGLE,
                  title: "Single Gate",
                  type: "CUSTOM",
                  operations: [{
                    id: ELEMENT_OP,
                    type: "select",
                    data: {
                      title: "Element",
                      optionsPredefined: [
                        { id: "air", title: "Air", type: "CUSTOM", operations: [] },
                        {
                          id: FIRE,
                          title: "Fire",
                          type: "CUSTOM",
                          operations: [
                            { id: IMPULSE_ONE_OP, type: "select", data: { title: "Fire Impulse Feat", optionsPredefined: [] } },
                            { id: IMPULSE_TWO_OP, type: "select", data: { title: "Fire Impulse Feat", optionsPredefined: [] } },
                            { id: "give-element", type: "giveAbilityBlock", data: { type: "feat", abilityBlockId: 23148 } },
                            { id: "give-junction", type: "giveAbilityBlock", data: { type: "feat", abilityBlockId: 23141 } },
                          ],
                        },
                      ],
                    },
                  }],
                },
                { id: "dual", title: "Dual Gate", type: "CUSTOM", operations: [] },
              ],
            },
          }],
        }],
        classFeats: [
          { id: 21758, name: "Base Kinesis" },
          { id: 21430, name: "Flying Flame" },
          { id: 21497, name: "Scorching Column" },
          { id: 23148, name: "Kinetic Element (Fire)" },
        ],
        otherFeats: [{ id: 23141, name: "Impulse Junction (Fire)" }],
      },
    },
  };
}

test("#52 WG hints include Single Gate, Fire, and both fire impulses", () => {
  const hints = wgChoiceHints(pc99());
  assert.deepEqual(hints.get("kinetic-gate"), ["Single Gate", "Fire", "Flying Flame", "Scorching Column"]);
  assert.deepEqual(hints.byId.get(String(GATE_ID)), ["Single Gate", "Fire", "Flying Flame", "Scorching Column"]);
});

test("#52 hint Fire uniquely matches the Fire Gate label, not Air Gate", () => {
  assert.equal(matchChoice(GATE_OPTIONS, ["Fire"]), 2);
  assert.equal(uniqueChoice(GATE_OPTIONS, ["Fire"]), 2);
  assert.equal(uniqueChoice(GATE_OPTIONS, ["Air"]), 0);
  assert.equal(matchChoice(GATE_OPTIONS, ["Single Gate"]), -1);
  const ctx = choiceContext(pc99(), {}, [], null);
  assert.equal(ctx.pick("Kinetic Gate", GATE_OPTIONS), 2);
});

test("#52 Base Kinesis feat+action grant pair covers the WG feat; two feats stay ambiguous", () => {
  const entry = { kind: "feat", name: "Base Kinesis", slug: "base-kinesis", match: { uuid: "Compendium.pf2e.feats-srd.Item.JX9RKSlI9jSqkXa0", type: "feat" } };
  const action = { item: { id: "act", type: "action", name: "Base Kinesis", system: { slug: "base-kinesis" }, _stats: { compendiumSource: "Compendium.pf2e.actionspf2e.Item.nTBrvt2b9wngyr0i" } }, parent: { name: "Kineticist" } };
  const feat = { item: { id: "feat", type: "feat", name: "Base Kinesis", system: { slug: "base-kinesis" }, _stats: { compendiumSource: "Compendium.pf2e.feats-srd.Item.JX9RKSlI9jSqkXa0" } }, parent: { name: "Kineticist" } };
  assert.equal(exactSlugGrant(entry, [action]).item.id, "act");
  assert.equal(exactSlugGrant(entry, [feat, action]).item.id, "feat");
  assert.equal(exactSlugGrant(entry, [action, { item: { id: "act2", type: "action", name: "Base Kinesis", system: { slug: "base-kinesis" } }, parent: { name: "Other" } }]), null);
});

test("#52 Kinetic Element (Fire) and Impulse Junction (Fire) are covered by Fire Gate, not homebrew", () => {
  const entries = [
    { name: "Kinetic Element (Fire)", slug: "kinetic-element-fire", kind: "feat" },
    { name: "Impulse Junction (Fire)", slug: "impulse-junction-fire", kind: "feat" },
    { name: "Weapon Infusion", slug: "weapon-infusion", kind: "feat", match: { uuid: "U:weapon" } },
  ];
  const index = [{ name: "Fire Gate", type: "feat", uuid: FIRE_UUID }];
  coverFeatureGaps(entries, null, index);
  assert.equal(entries[0].coveredBy, "Fire Gate");
  assert.equal(entries[1].coveredBy, "Fire Gate");
  assert.equal(entries[2].coveredBy, undefined);
});

async function runPrompt(ctx, app, ms = 500) {
  const prevFoundry = globalThis.foundry, prevUi = globalThis.ui;
  globalThis.foundry = { applications: { instances: new Map([["a", app]]) } };
  globalThis.ui = { notifications: { warn: () => {} } };
  const notes = [];
  const stop = watchPrompts(ctx, notes);
  try { await new Promise((r) => setTimeout(r, ms)); }
  finally { stop(); globalThis.foundry = prevFoundry; globalThis.ui = prevUi; }
  return notes;
}

test("#52 the element prompt is answered Fire Gate, not left for PF2e to default to Air", async () => {
  const ctx = choiceContext(pc99(), {}, [], null);
  const app = {
    rendered: true,
    title: "Select an Element",
    item: { name: "Kinetic Gate" },
    choices: GATE_OPTIONS.map((label, i) => ({ label, value: `Compendium.pf2e.classfeatures.Item.${label.replace(/ /g, "")}` })),
    close() { this.closed = true; },
  };
  // Point the Fire Gate choice at the real uuid used in resolvedChoices assertions.
  app.choices[2].value = FIRE_UUID;
  const notes = await runPrompt(ctx, app, 400);
  assert.equal(app.selection?.label, "Fire Gate");
  assert.equal(app.selection?.value, FIRE_UUID);
  assert.equal(app.closed, true);
  assert.match(notes.join("\n"), /Fire Gate \(prompt answered from WG selection\)/);
  assert.deepEqual([...(ctx.resolvedChoices.get("fire") ?? [])], [FIRE_UUID]);
});

test("#52 a briefly empty element prompt is not closed before Fire Gate options appear", async () => {
  const ctx = choiceContext(pc99(), {}, [], null);
  const app = {
    rendered: true,
    title: "Select an Element",
    item: { name: "Kinetic Gate" },
    choices: [],
    close() { this.closed = true; },
  };
  const prevFoundry = globalThis.foundry, prevUi = globalThis.ui;
  globalThis.foundry = { applications: { instances: new Map([["a", app]]) } };
  globalThis.ui = { notifications: { warn: () => {} } };
  const notes = [];
  const stop = watchPrompts(ctx, notes);
  try {
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(app.closed, undefined, "must not close the empty filter ChoiceSet on the first tick");
    app.choices = GATE_OPTIONS.map((label) => ({ label, value: label }));
    app.choices[2].value = FIRE_UUID;
    await new Promise((r) => setTimeout(r, 400));
  } finally {
    stop();
    globalThis.foundry = prevFoundry;
    globalThis.ui = prevUi;
  }
  assert.equal(app.selection?.label, "Fire Gate");
  assert.equal(app.closed, true);
});

test("#52 impulse prompts consume Flying Flame then Scorching Column from Kinetic Gate hints", async () => {
  const ctx = choiceContext(pc99(), {}, [], null);
  const mk = (id) => ({
    rendered: true,
    title: "Select an Impulse",
    item: { name: "Fire Gate", flags: { pf2e: { grantedBy: { id: "kg" } } } },
    choices: [
      { label: "Flying Flame", value: FLYING_UUID },
      { label: "Scorching Column", value: COLUMN_UUID },
      { label: "Blazing Impetus", value: "Compendium.pf2e.feats-srd.Item.Other" },
    ],
    close() { this.closed = true; },
  });
  // Hints live on Kinetic Gate; Fire Gate is the granted child.
  const actor = { items: [
    { id: "kg", name: "Kinetic Gate", flags: { pf2e: { itemGrants: { g: { id: "fg" } } } } },
    { id: "fg", name: "Fire Gate", flags: { pf2e: { grantedBy: { id: "kg" } } } },
  ] };
  ctx.actor = actor;
  const first = mk("1");
  first.item = actor.items[1];
  const notes1 = await runPrompt(ctx, first, 400);
  assert.equal(first.selection?.label, "Flying Flame");
  const second = mk("2");
  second.item = actor.items[1];
  const notes2 = await runPrompt(ctx, second, 400);
  assert.equal(second.selection?.label, "Scorching Column");
  assert.match(notes1.join("\n") + notes2.join("\n"), /Flying Flame/);
  assert.match(notes2.join("\n"), /Scorching Column/);
});

test("#52 impulse prompts are answered from Kinetic Gate even when ctx.actor is unset (fresh import)", async () => {
  const ctx = choiceContext(pc99(), {}, [], null);
  assert.equal(ctx.actor, null);
  const mk = () => ({
    rendered: true,
    title: "Select an Impulse",
    item: { name: "Fire Gate", flags: { pf2e: { grantedBy: { id: "kg" } } } },
    choices: [
      { label: "Burning Jet", value: "Compendium.pf2e.feats-srd.Item.Jet" },
      { label: "Flying Flame", value: FLYING_UUID },
      { label: "Scorching Column", value: COLUMN_UUID },
      { label: "Eternal Torch", value: "Compendium.pf2e.feats-srd.Item.Torch" },
    ],
    close() { this.closed = true; },
  });
  const first = mk();
  const notes1 = await runPrompt(ctx, first, 400);
  assert.equal(first.selection?.label, "Flying Flame", "must not leave the impulse for the user when hints are on Kinetic Gate");
  const second = mk();
  const notes2 = await runPrompt(ctx, second, 400);
  assert.equal(second.selection?.label, "Scorching Column");
  assert.match(notes1.join("\n") + notes2.join("\n"), /Flying Flame/);
  assert.match(notes2.join("\n"), /Scorching Column/);
});
