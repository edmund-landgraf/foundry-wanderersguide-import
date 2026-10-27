import { MODULE_ID } from "./constants.js";
import { listCharacters, listCampaigns, getCampaign, campaignLabel, exportCharacter, resolveFunctionsUrl } from "./api.js";
import { importCharacter, previewImport, diffHtml } from "./importer.js";

function opts() {
  return { baseUrl: resolveFunctionsUrl(game.settings.get(MODULE_ID, "wgServer"), game.settings.get(MODULE_ID, "functionsUrl")), apiKey: game.settings.get(MODULE_ID, "apiKey") };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function charTable(rows, host, { checked = false, tab, names }) {
  const inWorld = (id) => game.actors.some((a) => a.getFlag(MODULE_ID, "wgId") === id && a.getFlag(MODULE_ID, "host") === host);
  const tr = (r) => {
    const ok = r.granted !== false;
    const action = !ok ? "not granted" : inWorld(r.id) ? "Update" : "Insert";
    return `<tr${ok ? "" : ' style="opacity:.5"'}><td><input type="checkbox" name="wgi" value="${r.id}" ${ok ? "" : "disabled"} ${ok && checked ? "checked" : ""}></td><td>${esc(r.name)}</td><td>${esc(r.level)}</td><td>${esc(r.ancestry)}</td><td>${esc(r.class)}</td><td>${esc(campaignLabel(r.campaignId, names))}</td><td>${r.id}</td><td class="wgi-action">${action}</td></tr>`;
  };
  return `<table class="wgi-table" data-tab="${tab}"><thead><tr><th></th><th>Name</th><th>Lvl</th><th>Ancestry</th><th>Class</th><th>Campaign</th><th>WG id</th><th>Action</th></tr></thead><tbody>${rows.map(tr).join("") || '<tr><td colspan="8">No characters.</td></tr>'}</tbody></table>`;
}

async function runImport(ids, host, { dryRun = false, parity = false } = {}) {
  if (dryRun) return runPreview(ids, host);
  for (const id of ids) {
    // One character at a time (PLAN 4.2).
    try {
      ui.notifications.info(`Wanderer's Guide: importing ${id}...`);
      const exp = await exportCharacter(opts(), id);
      const { actor, misses } = await importCharacter(exp, { host, parity });
      ui.notifications.info(`Imported ${actor.name} (${misses.length} misses).`);
    } catch (e) {
      ui.notifications.error(`Wanderer's Guide ${id}: ${e.message}`);
    }
  }
}

// Dry run (PLAN 8): fetch each export, diff it against the world, write nothing. Shown in a dialog and whispered to chat.
async function runPreview(ids, host) {
  const parts = [];
  for (const id of ids) {
    try {
      const exp = await exportCharacter(opts(), id);
      const { plan, diff, misses } = await previewImport(exp, { host });
      parts.push(diffHtml(plan, diff, misses));
    } catch (e) {
      parts.push(`<h3>WG ${id}</h3><p>${esc(e.message)}</p>`);
    }
  }
  const content = `<p><em>Preview only. Nothing was imported or changed.</em></p>${parts.join("<hr>")}`;
  await ChatMessage.create({ whisper: [game.user.id], content });
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) DialogV2.prompt({ window: { title: "Wanderer's Guide preview" }, position: { width: 600 }, content: `<div class="wgi-preview" style="max-height:600px;overflow:auto">${content}</div>`, rejectClose: false });
}

const flagsFrom = (root) => ({
  dryRun: !!root?.querySelector?.('input[name="wgi-dryrun"]')?.checked,
  parity: !!root?.querySelector?.('input[name="wgi-parity"]')?.checked,
});

export async function openImportDialog() {
  let rows;
  try {
    rows = await listCharacters(opts());
  } catch (e) {
    ui.notifications.error(`Wanderer's Guide: ${e.message}`);
    return;
  }
  // Campaign names are a nice-to-have; a failure here should not block the import list.
  const names = new Map();
  try { for (const c of await listCampaigns(opts())) names.set(c.id, c.name); } catch (e) { console.warn(`${MODULE_ID} | campaigns: ${e.message}`); }
  const host = opts().baseUrl;
  const body = `<nav class="wgi-tabs tabs" style="display:flex;gap:.5rem;margin-bottom:.5rem">
  <a class="wgi-tab active" data-wgi-tab="account">Import PCs from one account</a>
  <a class="wgi-tab" data-wgi-tab="campaign">Import PCs from one campaign</a></nav>
<section class="wgi-pane" data-wgi-pane="account">${charTable(rows, host, { tab: "account", names })}
<p class="notes">Characters granted to this API key.</p></section>
<section class="wgi-pane" data-wgi-pane="campaign" style="display:none">
  <label>Campaign <select name="wgi-campaign"><option value="">Loading campaigns...</option></select></label>
  <div class="wgi-campaign-chars"></div>
  <p class="notes">Characters in other players' accounts can only be imported if they granted this API key.</p></section>
<fieldset class="wgi-options" style="margin-top:.5rem"><legend>Optional</legend>
  <label style="display:block"><input type="checkbox" name="wgi-dryrun"> Preview changes only (dry-run diff, nothing is written)</label>
  <label style="display:block"><input type="checkbox" name="wgi-parity"> Check parity against the export after importing</label></fieldset>`;

  const onRender = (root) => {
    if (!root || root.dataset.wgiWired) return;
    root.dataset.wgiWired = "1";
    const show = (name) => {
      root.querySelectorAll(".wgi-tab").forEach((a) => a.classList.toggle("active", a.dataset.wgiTab === name));
      root.querySelectorAll(".wgi-pane").forEach((s) => { s.style.display = s.dataset.wgiPane === name ? "" : "none"; });
    };
    root.querySelectorAll(".wgi-tab").forEach((a) => a.addEventListener("click", () => show(a.dataset.wgiTab)));
    const sel = root.querySelector('select[name="wgi-campaign"]');
    const out = root.querySelector(".wgi-campaign-chars");
    listCampaigns(opts()).then((cs) => {
      sel.innerHTML = `<option value="">Select a campaign...</option>${cs.map((c) => `<option value="${c.id}">${esc(c.name)}${c.owned ? " (GM)" : ""}</option>`).join("")}`;
    }).catch((e) => { sel.innerHTML = `<option value="">${esc(e.message)}</option>`; });
    sel.addEventListener("change", async () => {
      out.innerHTML = "";
      if (!sel.value) return;
      out.innerHTML = "<p>Loading...</p>";
      try { out.innerHTML = charTable((await getCampaign(opts(), sel.value)).characters, host, { checked: true, tab: "campaign", names }); }
      catch (e) { out.innerHTML = `<p>${esc(e.message)}</p>`; }
    });
  };

  const selected = (root) => {
    const pane = [...root.querySelectorAll(".wgi-pane")].find((s) => s.style.display !== "none") ?? root;
    return [...pane.querySelectorAll('input[name="wgi"]:checked')].map((i) => Number(i.value));
  };

  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    await DialogV2.wait({
      window: { title: "Import from Wanderer's Guide" },
      position: { width: 700 },
      content: body,
      render: (_ev, dialog) => onRender(dialog.element ?? _ev?.target?.element),
      buttons: [
        { action: "import", label: "Import selected", default: true, callback: (_ev, button) => { const root = button.form ?? button.closest(".application"); return runImport(selected(root), host, flagsFrom(root)); } },
        { action: "cancel", label: "Cancel" },
      ],
      rejectClose: false,
    });
    return;
  }
  new Dialog({
    title: "Import from Wanderer's Guide",
    content: body,
    render: (html) => onRender(html[0]?.closest?.(".app") ?? html[0]),
    buttons: {
      import: { label: "Import selected", callback: (html) => runImport(selected(html[0] ?? html), host, flagsFrom(html[0] ?? html)) },
      cancel: { label: "Cancel" },
    },
    default: "import",
  }, { width: 700 }).render(true);
}
