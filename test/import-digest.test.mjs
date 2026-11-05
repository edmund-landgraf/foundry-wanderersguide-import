import test from "node:test";
import assert from "node:assert/strict";
import { buildImportDigest, digestHtml, mergeDigestNotes } from "../scripts/importer.js";

test("import digest sorts results into four buckets", () => {
  const digest = buildImportDigest({
    matched: [
      { kind: "feat", name: "Toughness", match: { uuid: "Compendium.x" } },
      { kind: "feat", name: "Divine Font", coveredBy: "Divine Font" },
      { kind: "formula", name: "Elixir of Life", match: { uuid: "Compendium.y" } },
      { kind: "formula", name: "Homemade Tonic" },
      { kind: "feat", name: "Mystery Feat", unresolved: "no unambiguous PF2e compendium match" },
    ],
    notes: ["choice Shield Block: Shield (pre-filled from WG selection)", "HP: PF2e computed 20, WG 24; adjustment +4"],
    warnings: ["Satchel: container not imported as a PF2e container; placed loose"],
    ctx: { unresolved: [{ owner: "Domain Initiate", flag: "domains", reason: "no explicit WG answer matching exactly one legal option; PF2e will ask" }] },
    coverage: { rows: [{ status: "dropped", path: "pets" }, { status: "leftover-preserved", path: "notes" }] },
  }, {
    parity: { ok: false, failed: [{ check: "max HP", wg: 24, foundry: 20 }] },
    duplicates: [{ key: "feat:toughness", expectedGrantPair: true }, { key: "feat:alertness", expectedGrantPair: false }],
  });

  assert.match(digest.perfect.join(" "), /1 compendium entries/);
  assert.match(digest.perfect.join(" "), /1 choices filled/);
  assert.match(digest.perfect.join(" "), /Divine Font/);
  assert.match(digest.perfect.join(" "), /1 formulas/);
  assert.match(digest.check.join(" "), /adjustment \+4/);
  assert.match(digest.check.join(" "), /Satchel/);
  assert.match(digest.check.join(" "), /feat:alertness/);
  assert.match(digest.check.join(" "), /max HP/);
  assert.match(digest.check.join(" "), /1 source values were stored/);
  assert.equal(digest.check.some((line) => line.includes("toughness")), false);
  assert.match(digest.todo.join(" "), /Homemade Tonic/);
  assert.match(digest.todo.join(" "), /Finish 1 choice/);
  assert.match(digest.unresolved.join(" "), /Domain Initiate/);
  assert.match(digest.unresolved.join(" "), /Mystery Feat/);
  assert.match(digest.unresolved.join(" "), /1 source paths were dropped/);
});

test("digest note replaces only its own block", () => {
  const html = digestHtml({ perfect: ["All set."], check: ["Look at HP."], todo: ["No follow-up actions."], unresolved: ["Nothing left unresolved."] });
  const first = mergeDigestNotes("<p>Player backstory.</p>", html);
  assert.match(first, /Player backstory/);
  assert.match(first, /Went perfectly/);
  assert.match(first, /All set\./);
  const second = mergeDigestNotes(first, digestHtml({ perfect: ["Reimported."], check: ["Nothing flagged for review."], todo: ["No follow-up actions."], unresolved: ["Nothing left unresolved."] }));
  assert.match(second, /Player backstory/);
  assert.match(second, /Reimported\./);
  assert.equal(second.includes("All set."), false);
  assert.equal((second.match(/<!-- wgi-import-digest -->/g) ?? []).length, 1);
});
