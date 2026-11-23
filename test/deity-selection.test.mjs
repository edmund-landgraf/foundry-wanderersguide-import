import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLY_KIND_ORDER,
  isDeityItemChoiceSet,
  deitySelectionFlag,
  deityItemOnActor,
  resolvedDeityUuid,
  reconcileDeitySelection,
} from "../scripts/importer.js";

// Issue #143 / PC 103: the standalone Desna item is created before the class,
// PF2e grants Deity (Cleric) with {not:"deity"}, the prompt never opens, and
// prefillChoices is never called on that granted item, so sel.deity stays null.

const DESNA = "Compendium.pf2e.deities.Item.JgqH3BhuEuA4Zyqs";
const SARENRAE = "Compendium.pf2e.deities.Item.Sarenrae";

const deityRule = {
  key: "ChoiceSet",
  flag: "deity",
  prompt: "PF2E.SpecificRule.Prompt.Deity",
  predicate: [{ not: "deity" }],
  choices: { itemType: "deity", filter: [{ or: ["item:category:deity", "item:category:pantheon"] }] },
  selection: null,
};
const sanctRule = {
  key: "ChoiceSet",
  slug: "sanctification",
  prompt: "PF2E.SpecificRule.Prompt.Sanctification",
  predicate: [{ nor: ["sanctification:holy", "sanctification:unholy"] }],
  choices: [{ label: "Holy", value: "holy" }, { label: "Unholy", value: "unholy" }],
  selection: "holy",
};

function clericActor({ deitySel = null, source = DESNA, includeDeityItem = true, name = "Desna" } = {}) {
  const feat = {
    id: "deity-cleric",
    name: "Deity (Cleric)",
    type: "feat",
    flags: { pf2e: { rulesSelections: { deity: deitySel, sanctification: "holy" } } },
    system: { rules: [deityRule, sanctRule] },
  };
  const desnaItem = {
    id: "desna-item",
    name,
    type: "deity",
    _stats: { compendiumSource: source },
    flags: { core: { sourceId: source } },
  };
  const writes = [];
  const items = includeDeityItem ? [feat, desnaItem] : [feat];
  const actor = {
    items,
    async updateEmbeddedDocuments(_type, updates) {
      writes.push(updates);
      for (const update of updates) {
        if (update._id === feat.id && update["flags.pf2e.rulesSelections.deity"] !== undefined) {
          feat.flags.pf2e.rulesSelections.deity = update["flags.pf2e.rulesSelections.deity"];
        }
      }
    },
  };
  return { feat, actor, writes, desnaItem };
}

const index = [
  { type: "deity", name: "Desna", uuid: DESNA },
  { type: "deity", name: "Sarenrae", uuid: SARENRAE },
];

test("Deity (Cleric) ChoiceSet is the deity document picker, not sanctification", () => {
  assert.equal(isDeityItemChoiceSet(deityRule), true);
  assert.equal(isDeityItemChoiceSet(sanctRule), false);
  const { feat } = clericActor();
  assert.equal(deitySelectionFlag(feat), "deity");
});

test("#143 reconcile sets Deity (Cleric) deity to the imported Desna UUID without adding a second deity", async () => {
  const { feat, actor, writes } = clericActor({ deitySel: null });
  assert.equal(feat.flags.pf2e.rulesSelections.deity, null);
  assert.equal(deityItemOnActor(actor, "Desna").id, "desna-item");
  assert.equal(resolvedDeityUuid(actor, "Desna", index), DESNA);
  assert.equal(await reconcileDeitySelection(actor, "Desna", index), true);
  assert.equal(feat.flags.pf2e.rulesSelections.deity, DESNA);
  assert.equal(feat.flags.pf2e.rulesSelections.sanctification, "holy");
  assert.equal(actor.items.filter((i) => i.type === "deity").length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0]["flags.pf2e.rulesSelections.deity"], DESNA);
});

test("#143 falls back to the pack index when the actor deity has no compendium source", async () => {
  const { feat, actor } = clericActor({ deitySel: null, source: null });
  actor.items[1]._stats = {};
  actor.items[1].flags = {};
  assert.equal(resolvedDeityUuid(actor, "Desna", index), DESNA);
  assert.equal(await reconcileDeitySelection(actor, "Desna", index), true);
  assert.equal(feat.flags.pf2e.rulesSelections.deity, DESNA);
});

test("#143 is a no-op when the flag is already Desna, and does not overwrite another deity", async () => {
  const already = clericActor({ deitySel: DESNA });
  assert.equal(await reconcileDeitySelection(already.actor, "Desna", index), false);
  assert.equal(already.writes.length, 0);
  const other = clericActor({ deitySel: SARENRAE });
  assert.equal(await reconcileDeitySelection(other.actor, "Desna", index), false);
  assert.equal(other.feat.flags.pf2e.rulesSelections.deity, SARENRAE);
  assert.equal(other.writes.length, 0);
});

test("#143 is a no-op without beliefs, a matching deity, or a deity ChoiceSet", async () => {
  const { actor, feat, writes } = clericActor({ deitySel: null });
  assert.equal(await reconcileDeitySelection(actor, "", index), false);
  assert.equal(feat.flags.pf2e.rulesSelections.deity, null);
  const noDeity = clericActor({ deitySel: null, includeDeityItem: false });
  assert.equal(await reconcileDeitySelection(noDeity.actor, "Desna", []), false);
  assert.equal(noDeity.feat.flags.pf2e.rulesSelections.deity, null);
  const noFeat = clericActor({ deitySel: null });
  noFeat.actor.items = noFeat.actor.items.filter((i) => i.type === "deity");
  assert.equal(await reconcileDeitySelection(noFeat.actor, "Desna", index), false);
  assert.equal(writes.length, 0);
  assert.equal(noDeity.writes.length, 0);
  assert.equal(noFeat.writes.length, 0);
});

test("#143 creates the standalone deity after the class so the ChoiceSet can run", () => {
  const classAt = APPLY_KIND_ORDER.indexOf("class");
  const deityAt = APPLY_KIND_ORDER.indexOf("deity");
  const equipmentAt = APPLY_KIND_ORDER.indexOf("equipment");
  assert.ok(classAt >= 0 && deityAt > classAt, "deity must follow class");
  assert.ok(equipmentAt >= 0 && equipmentAt < classAt, "equipment still precedes class for ikons");
});
