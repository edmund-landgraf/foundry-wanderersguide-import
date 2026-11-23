import test from "node:test";
import assert from "node:assert/strict";
import { selectCampaignArtLevel } from "../scripts/campaign.js";
import { addSheetHeaderButtons, campaignRequestToken, exportHandoffMessage, sheetImportTarget } from "../scripts/dialog.js";
import { readFileSync } from "node:fs";

test("campaign art updates the tagged or initial level, not whichever level is first", () => {
  const scene = {
    initialLevel: "imported",
    levels: {
      contents: [
        { id: "gm", background: { src: "gm.png" }, flags: {} },
        { id: "imported", background: { src: "old.png" }, flags: { "foundry-wanderersguide-import": { art: true } } },
      ],
    },
  };
  assert.equal(selectCampaignArtLevel(scene).id, "imported");
  const legacy = {
    initialLevel: "imported",
    levels: { contents: [{ id: "gm" }, { id: "imported" }] },
  };
  assert.equal(selectCampaignArtLevel(legacy).id, "imported");
  const ambiguous = { levels: { contents: [{ id: "a" }, { id: "b" }] } };
  assert.equal(selectCampaignArtLevel(ambiguous), null);
});

test("a slower campaign response cannot replace the campaign the user selected later", async () => {
  const gate = campaignRequestToken();
  const first = gate.start("A");
  const second = gate.start("B");
  let shown = null;
  const apply = async (req, delay, payload) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (gate.isCurrent(req, "B")) shown = payload;
  };
  await Promise.all([apply(first, 30, "A"), apply(second, 5, "B")]);
  assert.equal(shown, "B");
  assert.equal(gate.isCurrent(first, "B"), false);
});

test("the sheet button is only for a character the user can update", () => {
  const user = { id: "u" };
  const npc = { type: "npc", canUserModify: () => true };
  assert.equal(sheetImportTarget(npc, user), null);
  const locked = { type: "character", canUserModify: () => false, flags: {} };
  assert.equal(sheetImportTarget(locked, user), null);
  const linked = { type: "character", canUserModify: () => true, flags: { "foundry-wanderersguide-import": { wgId: 42 } } };
  assert.deepEqual(sheetImportTarget(linked, user), { wgId: 42 });
  const app = { actor: linked, user };
  const buttons = [{ class: "configure" }, { class: "close" }];
  assert.equal(addSheetHeaderButtons(app, buttons, { user, importLabel: "Import", exportLabel: "Export" }), true);
  assert.deepEqual(buttons.map((button) => button.class), ["configure", "wgi-import", "wgi-export", "close"]);
  assert.equal(addSheetHeaderButtons(app, buttons, { user }), false);
  assert.equal(addSheetHeaderButtons({ actor: npc }, [{ class: "close" }], { user }), false);
  const handoff = exportHandoffMessage({ status: "connected", ownsLease: true }, "Yutrexxvb");
  assert.match(handoff, /Import from Foundry/);
  assert.equal(/updated|exported/i.test(handoff), false);
  assert.match(exportHandoffMessage({ status: "disabled", reason: "Set a code." }), /Set a code/);
});

test("release packaging keeps the match catalog and not the private database", () => {
  const script = readFileSync(new URL("../tools/release-module.ps1", import.meta.url), "utf8");
  assert.match(script, /data\/match-catalog\.json/);
  assert.match(script, /schemaVersion/);
  assert.doesNotMatch(script, /data\/\*\.sqlite|wgi_rules/);
});
