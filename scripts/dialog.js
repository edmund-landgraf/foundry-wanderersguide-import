import { MODULE_ID } from "./constants.js";
import { listCharacters, exportCharacter, parseClientId, resolveFunctionsUrl } from "./api.js";
import { importCharacter } from "./importer.js";

function opts() {
  return { baseUrl: resolveFunctionsUrl(game.settings.get(MODULE_ID, "wgServer"), game.settings.get(MODULE_ID, "functionsUrl")), apiKey: game.settings.get(MODULE_ID, "apiKey"), clientId: parseClientId(game.settings.get(MODULE_ID, "authUrl")) };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function openImportDialog() {
  let rows;
  try {
    rows = await listCharacters(opts());
  } catch (e) {
    ui.notifications.error(`Wanderer's Guide: ${e.message}`);
    return;
  }
  const host = opts().baseUrl;
  const inWorld = (id) => game.actors.some((a) => a.getFlag(MODULE_ID, "wgId") === id && a.getFlag(MODULE_ID, "host") === host);
  const body = `<table class="wgi-table"><thead><tr><th></th><th>Name</th><th>Lvl</th><th>Ancestry</th><th>Class</th><th>WG id</th><th></th></tr></thead><tbody>${
    rows.map((r) => `<tr${r.granted ? "" : ' style="opacity:.5"'}><td><input type="checkbox" name="wgi" value="${r.id}" ${r.granted ? "" : "disabled"}></td><td>${esc(r.name)}</td><td>${esc(r.level)}</td><td>${esc(r.ancestry)}</td><td>${esc(r.class)}</td><td>${r.id}</td><td>${r.granted ? (inWorld(r.id) ? "in world" : "") : "not granted"}</td></tr>`).join("") || '<tr><td colspan="7">No characters.</td></tr>'
  }</tbody></table><p class="notes">Greyed rows have not granted this API client in Wanderer's Guide.</p>`;

  const onImport = async (root) => {
    const ids = [...root.querySelectorAll('input[name="wgi"]:checked')].map((i) => Number(i.value));
    for (const id of ids) {
      // One character at a time (PLAN 4.2).
      try {
        ui.notifications.info(`Wanderer's Guide: importing ${id}...`);
        const exp = await exportCharacter(opts(), id);
        const { actor, misses } = await importCharacter(exp, { host });
        ui.notifications.info(`Imported ${actor.name} (${misses.length} misses).`);
      } catch (e) {
        ui.notifications.error(`Wanderer's Guide ${id}: ${e.message}`);
      }
    }
  };

  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    await DialogV2.wait({
      window: { title: "Import from Wanderer's Guide" },
      position: { width: 640 },
      content: body,
      buttons: [
        { action: "import", label: "Import selected", default: true, callback: (_ev, button) => onImport(button.form ?? button.closest(".application")) },
        { action: "cancel", label: "Cancel" },
      ],
      rejectClose: false,
    });
    return;
  }
  new Dialog({
    title: "Import from Wanderer's Guide",
    content: body,
    buttons: {
      import: { label: "Import selected", callback: (html) => onImport(html[0] ?? html) },
      cancel: { label: "Cancel" },
    },
    default: "import",
  }, { width: 640 }).render(true);
}
