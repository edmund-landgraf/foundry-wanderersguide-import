import { MODULE_ID } from "./constants.js";
import { applyCampaignArt, campaignArtUrl } from "./campaign.js";
import { listCharacters, listCampaigns, getCampaign, campaignLabel, exportCharacter, parseLocalExport, resolveFunctionsUrl } from "./api.js";
import { importCharacter, previewImport, diffHtml, reviewHtml } from "./importer.js";
import { loadMatchCatalog } from "./match-catalog.js";
import { FALLBACK_IMG, resolveImageUrl } from "./mapping.js";

/** Monotonic campaign loads. A slower response for an earlier selection is ignored. */
export function campaignRequestToken() {
  let latest = 0;
  return {
    start(id) { latest += 1; return { id: String(id), token: latest }; },
    isCurrent(req, selectedId) { return !!req && req.token === latest && String(selectedId ?? "") === req.id; },
  };
}

function opts() {
  return { baseUrl: resolveFunctionsUrl(game.settings.get(MODULE_ID, "wgServer"), game.settings.get(MODULE_ID, "functionsUrl")), apiKey: game.settings.get(MODULE_ID, "apiKey") };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const portraitThumb = (src, name, { size = 36 } = {}) => {
  const label = esc(name);
  return `<img class="wgi-portrait-thumb" src="${esc(src)}" alt="${label}" title="${label}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:cover;border:1px solid #0006;border-radius:50%;vertical-align:middle;display:block">`;
};

function charTable(rows, host, { checked = false, tab, names }) {
  const inWorld = (id) => game.actors.some((a) => a.getFlag(MODULE_ID, "wgId") === id && a.getFlag(MODULE_ID, "host") === host);
  const tr = (r) => {
    const ok = r.granted !== false;
    const action = !ok ? "not granted" : inWorld(r.id) ? "Update" : "Insert";
    const portrait = resolveImageUrl(r.imageUrl, host) || FALLBACK_IMG;
    return `<tr${ok ? "" : ' style="opacity:.5"'}><td><input type="checkbox" name="wgi" value="${r.id}" ${ok ? "" : "disabled"} ${ok && checked ? "checked" : ""}></td><td class="wgi-portrait">${portraitThumb(portrait, r.name)}</td><td>${esc(r.name)}${r.player ? ` <span class="notes">(${esc(r.player)})</span>` : ""}</td><td>${esc(r.level)}</td><td>${esc(r.ancestry)}</td><td>${esc(r.class)}</td><td>${esc(campaignLabel(r.campaignId, names))}</td><td>${r.id}</td><td class="wgi-action">${action}</td></tr>`;
  };
  return `<table class="wgi-table" data-tab="${tab}"><thead><tr><th></th><th aria-label="Portrait"></th><th>Name</th><th>Lvl</th><th>Ancestry</th><th>Class</th><th>Campaign</th><th>WG id</th><th>Action</th></tr></thead><tbody>${rows.map(tr).join("") || '<tr><td colspan="9">No characters.</td></tr>'}</tbody></table>`;
}

// Review step (AMBA_REUSE_PLAN 5): the full plan is shown before anything is written; Cancel changes nothing.
async function confirmPlan(p) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return true;
  return !!(await DialogV2.confirm({
    window: { title: `Apply Wanderer's Guide import: ${p.plan.name}?` },
    position: { width: 620 },
    content: `<div class="wgi-review" style="max-height:560px;overflow:auto">${reviewHtml(p)}</div>`,
    yes: { label: "Apply", default: true }, no: { label: "Cancel" },
    rejectClose: false,
  }));
}

async function runImport(ids, host, { dryRun = false, parity = false, review = true } = {}) {
  if (dryRun) { await runPreview(ids, host); return []; }
  const actors = [];
  // Test hook: CONFIG.wgiTest = { failAfter: n } injects a failure after n created items.
  const failAfter = CONFIG.wgiTest?.failAfter ?? null;
  for (const id of ids) {
    // One character at a time (PLAN 4.2).
    try {
      ui.notifications.info(`Wanderer's Guide: importing ${id}...`);
      const exp = await exportCharacter(opts(), id);
      const res = await importCharacter(exp, { host, matchCatalog: await loadMatchCatalog(), parity, confirm: review ? confirmPlan : null, failAfter });
      if (res.cancelled) {
        ui.notifications.info(`Wanderer's Guide: import of ${res.plan.name} cancelled; nothing changed.`);
        await ChatMessage.create({ whisper: [game.user.id], content: `<h3>WG import cancelled: ${esc(res.plan.name)}</h3><p>Nothing was written.</p>` }).catch(() => {});
        continue;
      }
      ui.notifications.info(`Imported ${res.actor.name}.`);
      actors.push(res.actor);
    } catch (e) {
      ui.notifications.error(`Wanderer's Guide ${id}: ${e.message}`);
      // Toasts vanish; leave a whispered card so a failed import is visible afterwards (and scripted runs can see it).
      console.error(`${MODULE_ID} | import ${id} failed`, e);
      const rb = e.rollback;
      const rbText = !rb ? "Nothing was written (failed during planning)."
        : rb.restored ? "All changes were rolled back; the actor is as it was before the import."
        : `Restore failed (${esc(rb.restoreError ?? "")}); ${rb.backup ? `a backup actor "(WG backup)" (${esc(rb.backup)}) holds the pre-import state.` : `no backup could be created (${esc(rb.backupError ?? "")}).`}`;
      await ChatMessage.create({ whisper: [game.user.id], content: `<h3>WG import failed: WG id ${esc(id)}</h3><p>${esc(e.message)}</p><p>${rbText}</p>` }).catch(() => {});
    }
  }
  return actors;
}

// Dry run (PLAN 8): fetch each export, diff it against the world, write nothing. Shown in a dialog and whispered to chat.
async function runPreviewExport(exp, host) {
  const { review } = await previewImport(exp, { host, matchCatalog: await loadMatchCatalog() });
  const content = `<p><em>Preview only. Nothing was imported or changed.</em></p>${review}`;
  await ChatMessage.create({ whisper: [game.user.id], content });
}

async function runPreview(ids, host) {
  const parts = [];
  for (const id of ids) {
    try {
      const exp = await exportCharacter(opts(), id);
      const { review } = await previewImport(exp, { host, matchCatalog: await loadMatchCatalog() });
      parts.push(review);
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
  review: root?.querySelector?.('input[name="wgi-review"]')?.checked ?? true,
  art: {
    journal: !!root?.querySelector?.('input[name="wgi-art-journal"]')?.checked,
    scene: !!root?.querySelector?.('input[name="wgi-art-scene"]')?.checked,
    folder: !!root?.querySelector?.('input[name="wgi-art-folder"]')?.checked,
  },
});

const artThumb = (src, focusY, { w = 160, h = 60 } = {}) => src
  ? `<img class="wgi-campaign-thumb" src="${esc(src)}" alt="" style="width:${w}px;height:${h}px;object-fit:cover;object-position:50% ${Number.isFinite(focusY) ? focusY : 50}%;border:1px solid #0006;border-radius:3px;vertical-align:middle">`
  : `<span class="wgi-campaign-thumb wgi-no-art" style="display:inline-block;width:${w}px;height:${h}px;line-height:${h}px;text-align:center;border:1px dashed #0006;border-radius:3px;font-size:11px;opacity:.7;vertical-align:middle">no art in WG</span>`;

/** Re-import the WG character already linked on this actor. An unlinked sheet uses the sidebar dialog. */
export async function importLinkedCharacter(wgId) {
  if (wgId == null || wgId === "") return openImportDialog();
  return runImport([wgId], opts().baseUrl, { review: true });
}

export function sheetImportTarget(actor, user) {
  if (!actor || actor.type !== "character") return null;
  if (typeof actor.canUserModify === "function" && !actor.canUserModify(user, "update")) return null;
  const wgId = actor.getFlag?.(MODULE_ID, "wgId") ?? actor.flags?.[MODULE_ID]?.wgId ?? null;
  return { wgId };
}

/** One warning, or the handoff sentence. Never claims a Wanderer's Guide write. */
export function exportHandoffMessage(status, actorName) {
  const name = actorName ? `${actorName}: ` : "";
  if (status?.status === "connected" && status.ownsLease) {
    return `${name}open Import from Foundry in Wanderer's Guide and select the actor there.`;
  }
  if (status?.status === "invalid") return status.reason || "The Foundry read relay settings are not valid.";
  if (status?.status === "waiting") return "This browser tab is waiting to own the Foundry read relay.";
  if (status?.status === "disconnected") return "The Foundry read relay is not connected. Check the relay URL and connection code.";
  return status?.reason || "Set a Foundry → WGUI connection code in Wanderer's Guide Import settings.";
}

/** Application V1 header buttons. Import, then Export, immediately before Close. */
export function addSheetHeaderButtons(app, buttons, { user, importLabel = "Import from Wanderer's Guide", exportLabel = "Export to Wanderer's Guide", onImport = () => {}, onExport = () => {} } = {}) {
  if (!Array.isArray(buttons)) return false;
  const actor = app?.actor ?? app?.document;
  if (!sheetImportTarget(actor, user)) return false;
  if (buttons.some((button) => button.class === "wgi-import" || button.class === "wgi-export")) return false;
  const entries = [
    { class: "wgi-import", icon: "fas fa-file-import", label: importLabel, onclick: onImport },
    { class: "wgi-export", icon: "fas fa-file-export", label: exportLabel, onclick: onExport },
  ];
  const closeAt = buttons.findIndex((button) => button.class === "close");
  if (closeAt >= 0) buttons.splice(closeAt, 0, ...entries);
  else buttons.push(...entries);
  return true;
}

async function importParsedExport(exp, host, { parity = false, review = true } = {}) {
  const res = await importCharacter(exp, { host, matchCatalog: await loadMatchCatalog(), parity, confirm: review ? confirmPlan : null, failAfter: CONFIG.wgiTest?.failAfter ?? null });
  if (res.cancelled) {
    ui.notifications.info(`Wanderer's Guide: import of ${res.plan.name} cancelled; nothing changed.`);
    return null;
  }
  ui.notifications.info(`Imported ${res.actor.name}.`);
  return res.actor;
}

export async function openImportDialog() {
  let rows = [];
  let listError = "";
  try {
    rows = await listCharacters(opts());
  } catch (e) {
    listError = e.message;
    ui.notifications.error(`Wanderer's Guide: ${e.message}`);
  }
  // Campaign names are a nice-to-have; a failure here should not block the import list.
  const names = new Map();
  try { for (const c of await listCampaigns(opts())) names.set(c.id, c.name); } catch (e) { console.warn(`${MODULE_ID} | campaigns: ${e.message}`); }
  const host = opts().baseUrl;
  const body = `<nav class="wgi-tabs tabs" style="display:flex;gap:.5rem;margin-bottom:.5rem">
  <a class="wgi-tab active" data-wgi-tab="account">Import PCs from one account</a>
  <a class="wgi-tab" data-wgi-tab="campaign">Import PCs from one campaign</a></nav>
<section class="wgi-pane" data-wgi-pane="account">${listError ? `<p>${esc(listError)}</p>` : ""}${charTable(rows, host, { tab: "account", names })}
<p class="notes">Characters granted to this API key. A JSON v4 file below can be imported when the list is unavailable.</p></section>
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
  <label style="display:block"><input type="checkbox" name="wgi-parity"> Check parity against the export after importing</label>
  <label style="display:block"><input type="checkbox" name="wgi-review" checked> Review each plan before anything is written (Cancel changes nothing)</label>
  <label style="display:block">JSON v4 file <input type="file" name="wgi-file" accept="application/json,.json"></label>
  <p class="notes">Optional. The file must be the same JSON v4 export the API returns. Older .guidechar files are not read.</p></fieldset>`;

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
    const campaignLoads = campaignRequestToken();
    sel.addEventListener("change", async () => {
      out.innerHTML = "";
      art.innerHTML = "";
      currentCampaign = null;
      if (!sel.value) return;
      const requested = campaignLoads.start(sel.value);
      out.innerHTML = "<p>Loading...</p>";
      try {
        const res = await getCampaign(opts(), requested.id);
        if (!campaignLoads.isCurrent(requested, sel.value)) return;
        currentCampaign = res.campaign;
        art.innerHTML = `${artThumb(campaignArtUrl(res.campaign, host), res.campaign?.imageFocusY, { w: 400, h: 90 })}`;
        out.innerHTML = charTable(res.characters, host, { checked: true, tab: "campaign", names });
        art.querySelector("img")?.addEventListener("load", refit);
        refit();
      }
      catch (e) {
        if (!campaignLoads.isCurrent(requested, sel.value)) return;
        out.innerHTML = `<p>${esc(e.message)}</p>`;
      }
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
          const file = root.querySelector('input[name="wgi-file"]')?.files?.[0];
          if (file) {
            try {
              const exp = parseLocalExport(await file.text());
              if (f.dryRun) await runPreviewExport(exp, host);
              else await importParsedExport(exp, host, f);
            } catch (e) {
              ui.notifications.error(`Wanderer's Guide file: ${e.message}`);
            }
          }
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
