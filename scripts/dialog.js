import { MODULE_ID } from "./constants.js";
import { applyCampaignArt, campaignArtUrl } from "./campaign.js";
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
    return `<tr${ok ? "" : ' style="opacity:.5"'}><td><input type="checkbox" name="wgi" value="${r.id}" ${ok ? "" : "disabled"} ${ok && checked ? "checked" : ""}></td><td>${esc(r.name)}${r.player ? ` <span class="notes">(${esc(r.player)})</span>` : ""}</td><td>${esc(r.level)}</td><td>${esc(r.ancestry)}</td><td>${esc(r.class)}</td><td>${esc(campaignLabel(r.campaignId, names))}</td><td>${r.id}</td><td class="wgi-action">${action}</td></tr>`;
  };
  return `<table class="wgi-table" data-tab="${tab}"><thead><tr><th></th><th>Name</th><th>Lvl</th><th>Ancestry</th><th>Class</th><th>Campaign</th><th>WG id</th><th>Action</th></tr></thead><tbody>${rows.map(tr).join("") || '<tr><td colspan="8">No characters.</td></tr>'}</tbody></table>`;
}

async function runImport(ids, host, { dryRun = false, parity = false } = {}) {
  if (dryRun) { await runPreview(ids, host); return []; }
  const actors = [];
  for (const id of ids) {
    // One character at a time (PLAN 4.2).
    try {
      ui.notifications.info(`Wanderer's Guide: importing ${id}...`);
      const exp = await exportCharacter(opts(), id);
      const { actor, misses } = await importCharacter(exp, { host, parity });
      ui.notifications.info(`Imported ${actor.name} (${misses.length} misses).`);
      actors.push(actor);
    } catch (e) {
      ui.notifications.error(`Wanderer's Guide ${id}: ${e.message}`);
      // Toasts vanish; leave a whispered card so a failed import is visible afterwards (and scripted runs can see it).
      console.error(`${MODULE_ID} | import ${id} failed`, e);
      await ChatMessage.create({ whisper: [game.user.id], content: `<h3>WG import failed: WG id ${esc(id)}</h3><p>${esc(e.message)}</p>` }).catch(() => {});
    }
  }
  return actors;
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
  art: {
    journal: !!root?.querySelector?.('input[name="wgi-art-journal"]')?.checked,
    scene: !!root?.querySelector?.('input[name="wgi-art-scene"]')?.checked,
    folder: !!root?.querySelector?.('input[name="wgi-art-folder"]')?.checked,
  },
});

const artThumb = (src, focusY, { w = 160, h = 60 } = {}) => src
  ? `<img class="wgi-campaign-thumb" src="${esc(src)}" alt="" style="width:${w}px;height:${h}px;object-fit:cover;object-position:50% ${Number.isFinite(focusY) ? focusY : 50}%;border:1px solid #0006;border-radius:3px;vertical-align:middle">`
  : `<span class="wgi-campaign-thumb wgi-no-art" style="display:inline-block;width:${w}px;height:${h}px;line-height:${h}px;text-align:center;border:1px dashed #0006;border-radius:3px;font-size:11px;opacity:.7;vertical-align:middle">no art in WG</span>`;

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
  <div class="wgi-campaign-cards" style="display:flex;flex-wrap:wrap;gap:.5rem;margin:.4rem 0"></div>
  <div class="wgi-campaign-art" style="margin:.4rem 0"></div>
  <div class="wgi-campaign-chars" style="max-height:280px;overflow-y:auto"></div>
  <fieldset class="wgi-art-options"><legend>Campaign art (optional, nothing existing is overwritten)</legend>
    <label style="display:block"><input type="checkbox" name="wgi-art-journal"> Create/update a journal entry with the campaign art</label>
    <label style="display:block"><input type="checkbox" name="wgi-art-scene"> Create/update a scene with the art as background (not activated)</label>
    <label style="display:block"><input type="checkbox" name="wgi-art-folder"> File imported PCs that have no folder into an actor folder named after the campaign</label></fieldset>
  <p class="notes">If you are the campaign's GM (your WG account owns it), every PC that joined it with the join key is listed. Otherwise only characters granted to this API key appear.</p></section>
<fieldset class="wgi-options" style="margin-top:.5rem"><legend>Optional</legend>
  <label style="display:block"><input type="checkbox" name="wgi-dryrun"> Preview changes only (dry-run diff, nothing is written)</label>
  <label style="display:block"><input type="checkbox" name="wgi-parity"> Check parity against the export after importing</label></fieldset>`;

  let currentCampaign = null;
  const onRender = (root, app) => {
    if (!root || root.dataset.wgiWired) return;
    root.dataset.wgiWired = "1";
    // Keep the Import button reachable when the campaign pane (art, table, options) is taller than the screen.
    const wc = root.querySelector(".window-content");
    if (wc) Object.assign(wc.style, { maxHeight: "85vh", overflowY: "auto" });
    // The pane grows after the window was centered; pull it back on screen.
    const refit = () => requestAnimationFrame(() => {
      const h = root.offsetHeight, top = root.getBoundingClientRect().top;
      if (top + h > window.innerHeight - 10) { const t = Math.max(10, (window.innerHeight - h) / 2); if (app?.setPosition) app.setPosition({ top: t }); else root.style.top = `${t}px`; }
    });
    const show = (name) => {
      root.querySelectorAll(".wgi-tab").forEach((a) => a.classList.toggle("active", a.dataset.wgiTab === name));
      root.querySelectorAll(".wgi-pane").forEach((s) => { s.style.display = s.dataset.wgiPane === name ? "" : "none"; });
    };
    root.querySelectorAll(".wgi-tab").forEach((a) => a.addEventListener("click", () => show(a.dataset.wgiTab)));
    const sel = root.querySelector('select[name="wgi-campaign"]');
    const out = root.querySelector(".wgi-campaign-chars");
    const cards = root.querySelector(".wgi-campaign-cards");
    const art = root.querySelector(".wgi-campaign-art");
    listCampaigns(opts()).then((cs) => {
      sel.innerHTML = `<option value="">Select a campaign...</option>${cs.map((c) => `<option value="${c.id}">${esc(c.name)}${c.owned ? " (GM)" : ""}</option>`).join("")}`;
      cards.innerHTML = cs.map((c) => `<a class="wgi-campaign-card" data-campaign-id="${c.id}" title="${esc(c.name)}" style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;font-size:11px;max-width:120px">${artThumb(campaignArtUrl(c, host), c.imageFocusY, { w: 120, h: 45 })}<span>${esc(c.name)}${c.owned ? " (GM)" : ""}</span></a>`).join("");
      refit();
      cards.querySelectorAll(".wgi-campaign-card").forEach((a) => a.addEventListener("click", () => { sel.value = a.dataset.campaignId; sel.dispatchEvent(new Event("change")); }));
    }).catch((e) => { sel.innerHTML = `<option value="">${esc(e.message)}</option>`; });
    sel.addEventListener("change", async () => {
      out.innerHTML = "";
      art.innerHTML = "";
      currentCampaign = null;
      if (!sel.value) return;
      out.innerHTML = "<p>Loading...</p>";
      try {
        const res = await getCampaign(opts(), sel.value);
        currentCampaign = res.campaign;
        art.innerHTML = `${artThumb(campaignArtUrl(res.campaign, host), res.campaign?.imageFocusY, { w: 400, h: 90 })}`;
        out.innerHTML = charTable(res.characters, host, { checked: true, tab: "campaign", names });
        art.querySelector("img")?.addEventListener("load", refit);
        refit();
      }
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
      render: (_ev, dialog) => onRender(dialog.element ?? _ev?.target?.element, dialog),
      buttons: [
        { action: "import", label: "Import selected", default: true, callback: async (_ev, button) => {
          const root = button.form ?? button.closest(".application");
          const f = flagsFrom(root);
          const pane = [...root.querySelectorAll(".wgi-pane")].find((s) => s.style.display !== "none");
          const actors = await runImport(selected(root), host, f);
          // Campaign art only on a real import from the campaign tab.
          if (!f.dryRun && pane?.dataset.wgiPane === "campaign" && currentCampaign && (f.art.journal || f.art.scene || f.art.folder)) await applyCampaignArt(currentCampaign, host, f.art, actors);
        } },
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
