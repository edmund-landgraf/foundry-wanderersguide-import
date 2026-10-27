// Campaign art (WG campaign.meta_data.image_url, the banner on the WG campaign page).
// Everything here is optional and non-destructive: documents this module created are found again by
// flag (wgCampaignId + host) and updated in place; nothing else in the world is modified, except that
// imported PCs with no folder can be filed into the campaign's actor folder.
import { MODULE_ID } from "./constants.js";
import { resolveImageUrl } from "./mapping.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mine = (doc, campaignId, host) => doc.getFlag?.(MODULE_ID, "wgCampaignId") === campaignId && doc.getFlag?.(MODULE_ID, "host") === host;
const flags = (campaignId, host) => ({ [MODULE_ID]: { wgCampaignId: campaignId, host } });

/** Resolved art URL for a campaign summary from api.js, or null. */
export function campaignArtUrl(campaign, host) {
  return campaign?.imageUrl ? resolveImageUrl(campaign.imageUrl, host) : null;
}

function imageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function upsertJournal(campaign, src, host) {
  const name = campaign.name || `Campaign #${campaign.id}`;
  const existing = game.journal.find((j) => mine(j, campaign.id, host));
  if (existing) {
    const page = existing.pages.find((pg) => pg.type === "image" && pg.getFlag(MODULE_ID, "art"));
    if (page) {
      if (page.src === src) return { doc: existing, action: "unchanged" };
      await page.update({ src });
      return { doc: existing, action: "updated" };
    }
    await existing.createEmbeddedDocuments("JournalEntryPage", [{ name, type: "image", src, flags: { [MODULE_ID]: { art: true } } }]);
    return { doc: existing, action: "updated" };
  }
  const doc = await JournalEntry.create({
    name, flags: flags(campaign.id, host),
    pages: [
      { name, type: "image", src, image: { caption: `Wanderer's Guide campaign art: ${name}` }, flags: { [MODULE_ID]: { art: true } } },
      { name: "About", type: "text", text: { content: `<p>Imported from Wanderer's Guide campaign #${campaign.id} (${esc(name)}).</p>` } },
    ],
  });
  return { doc, action: "created" };
}

async function upsertScene(campaign, src, host) {
  const name = campaign.name || `Campaign #${campaign.id}`;
  const existing = game.scenes.find((s) => mine(s, campaign.id, host));
  if (existing) {
    const lvl = existing.levels?.contents?.[0];
    const cur = lvl ? lvl.background?.src : existing.background?.src;
    if (cur === src) return { doc: existing, action: "unchanged" };
    if (lvl) await lvl.update({ "background.src": src }); else await existing.update({ "background.src": src });
    return { doc: existing, action: "updated" };
  }
  const size = (await imageSize(src)) ?? { width: 4000, height: 3000 };
  const data = { name, width: size.width, height: size.height, padding: 0, navigation: false, active: false, flags: flags(campaign.id, host) };
  // Foundry v14 keeps backgrounds on scene levels; older versions on scene.background.
  if (Scene.schema.fields.levels) {
    const id = foundry.utils.randomID();
    Object.assign(data, { levels: [{ _id: id, name, background: { src } }], initialLevel: id });
  } else data.background = { src };
  // Never activated: creating the scene does not move anyone off the current one.
  return { doc: await Scene.create(data), action: "created" };
}

async function fileActors(campaign, host, actors) {
  const name = campaign.name || `Campaign #${campaign.id}`;
  let folder = game.folders.find((f) => f.type === "Actor" && mine(f, campaign.id, host));
  let action = "unchanged";
  if (!folder) { folder = await Folder.create({ name, type: "Actor", flags: flags(campaign.id, host) }); action = "created"; }
  // Only PCs that are not already in some folder: never move something the GM filed by hand.
  const loose = actors.filter((a) => a && !a.folder);
  if (loose.length) await Actor.updateDocuments(loose.map((a) => ({ _id: a.id, folder: folder.id })));
  return { doc: folder, action, moved: loose.length };
}

/** Apply the chosen options { journal, scene, folder } and whisper a summary. actors = the PCs just imported. */
export async function applyCampaignArt(campaign, host, opts, actors = []) {
  const src = campaignArtUrl(campaign, host);
  const lines = [];
  if ((opts.journal || opts.scene) && !src) lines.push("This campaign has no art in Wanderer's Guide (campaign settings, image URL).");
  try {
    if (opts.journal && src) { const r = await upsertJournal(campaign, src, host); lines.push(`Journal "${esc(r.doc.name)}": ${r.action}.`); }
    if (opts.scene && src) { const r = await upsertScene(campaign, src, host); lines.push(`Scene "${esc(r.doc.name)}" (not activated): ${r.action}.`); }
    if (opts.folder) { const r = await fileActors(campaign, host, actors); lines.push(`Actor folder "${esc(r.doc.name)}": ${r.action}, ${r.moved} PC(s) filed.`); }
  } catch (e) {
    console.error(`${MODULE_ID} | campaign art`, e);
    lines.push(`Failed: ${esc(e.message)}`);
  }
  if (lines.length) {
    await ChatMessage.create({ whisper: [game.user.id], content: `<h3>WG campaign: ${esc(campaign.name)}</h3>${src ? `<img src="${esc(src)}" style="max-height:80px;border:0">` : ""}<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>` });
  }
  return lines;
}