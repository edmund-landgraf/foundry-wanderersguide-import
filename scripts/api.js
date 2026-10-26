import { PROD_FUNCTIONS_URL, DEFAULT_FUNCTIONS_URL } from "./constants.js";
// WG edge-function client. API key is the only auth (see docs/PLAN.md section 2).
// The key is never logged or included in error messages.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class WgApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function callFunction({ baseUrl, apiKey, fn, body, fetchImpl = globalThis.fetch, maxRetries = 3 }) {
  if (!apiKey || apiKey.trim().length !== 36) throw new WgApiError(0, "Set a 36-character Wanderer's Guide API key in module settings.");
  const url = `${baseUrl.replace(/\/$/, "")}/${fn}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    // Edge runtime cold starts can return 5xx (e.g. "InvalidWorkerCreation"); retry those briefly too.
    if (res.status >= 500 && attempt < maxRetries) { await sleep(500 * 2 ** attempt); continue; }
    if (res.status === 429 && attempt < maxRetries) {
      const reset = Number(res.headers?.get?.("x-ratelimit-reset") ?? res.headers?.get?.("retry-after"));
      await sleep((Number.isFinite(reset) && reset > 0 ? reset : 2 ** attempt * 2) * 1000);
      continue;
    }
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const msg = json?.data?.message ?? json?.message ?? `HTTP ${res.status}`;
      const label = { 401: "API key rejected", 403: "Character not granted to this API client", 429: "Rate limited" }[res.status];
      throw new WgApiError(res.status, label ? `${label} (${res.status}): ${msg}` : msg);
    }
    return json;
  }
}

/**
 * Resolve which API client the key belongs to. get-user (as the key owner) returns the owner's
 * public_user row incl. api.clients; we match the client whose api_key equals ours. The key is
 * only compared locally, never logged. Falls back to the configured client id (Auth URL).
 */
const clientCache = new Map();
export async function resolveClient(opts) {
  const ck = `${opts.baseUrl}|${opts.apiKey}`;
  if (clientCache.has(ck)) return clientCache.get(ck);
  try {
    const json = await callFunction({ ...opts, fn: "get-user", body: {} });
    const u = Array.isArray(json?.data) ? json.data[0] : json?.data;
    const c = (u?.api?.clients ?? []).find((x) => x?.api_key === opts.apiKey.trim());
    if (c?.id && u?.id != null) { const r = { clientId: String(c.id), publicUserId: String(u.id), userId: u.user_id ?? null, source: "key" }; clientCache.set(ck, r); return r; }
  } catch { /* fall through to setting */ }
  if (opts.clientId) return { clientId: opts.clientId, publicUserId: opts.publicUserId || null, userId: null, source: "setting" };
  return null;
}

/** List (PLAN 4A.1 v1): find-character {} as the key owner, filtered to characters granted to THIS client only. */
export async function listCharacters(opts) {
  const client = await resolveClient(opts);
  if (!client) throw new WgApiError(0, "Could not determine the API client for this key. Paste the Auth URL from Wanderer's Guide into module settings.");
  const json = await callFunction({ ...opts, fn: "find-character", body: {} });
  return summarizeCharacters(json?.data ?? [], client);
}

/** Only characters owned by the key's user (when known) with a grant for exactly this client (and owner, when known) are returned. */
export function summarizeCharacters(rows, client) {
  const { clientId, publicUserId, userId } = typeof client === "string" ? { clientId: client, publicUserId: null, userId: null } : (client ?? {});
  if (!clientId) return [];
  const granted = (c) => (c.details?.api_clients?.client_access ?? []).some((g) => g?.clientId === clientId && (publicUserId == null || String(g.publicUserId) === publicUserId));
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).filter((c) => userId == null || c.user_id === userId).filter(granted).map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    ancestry: c.details?.ancestry?.name ?? "",
    class: c.details?.class?.name ?? "",
    campaignId: c.campaign_id ?? null,
    granted: true,
  }));
}
/**
 * Campaigns available to the key: WG API keys may only call character endpoints (find-campaign
 * returns 403 for keys), so campaigns are derived from the campaign_id of characters granted to
 * this key. Names are fetched best-effort from find-campaign and fall back to "Campaign #id".
 */
export async function listCampaigns(opts) {
  const chars = await listCharacters(opts);
  const ids = [...new Set(chars.map((c) => c.campaignId).filter((id) => id != null))];
  let named = [];
  if (ids.length) { try { named = (await callFunction({ ...opts, fn: "find-campaign", body: { id: ids }, maxRetries: 0 }))?.data ?? []; } catch { /* keys: 403 */ } }
  return ids.map((id) => ({ id, name: named.find((c) => c.id === id)?.name ?? `Campaign #${id}`, owned: false }));
}
/** PCs in a campaign. Export still needs each PC granted to this client, so ungranted PCs are flagged. */
export async function listCampaignCharacters(opts, campaignId) {
  const client = await resolveClient(opts);
  const rows = (await callFunction({ ...opts, fn: "find-character", body: { campaign_id: Number(campaignId) } }))?.data ?? [];
  const ok = new Set(summarizeCharacters(rows, { ...(client ?? {}), userId: null }).map((r) => r.id));
  return rows.map((c) => ({ id: c.id, name: c.name, level: c.level, ancestry: c.details?.ancestry?.name ?? "", class: c.details?.class?.name ?? "", granted: ok.has(c.id) }));
}

export async function exportCharacter(opts, id) {
  const json = await callFunction({ ...opts, fn: "wgui-export-character", body: { id: Number(id), format: "json" } });
  if (!json || json.version !== 4 || !json.character) throw new WgApiError(0, "Export was not a JSON v4 character.");
  return json;
}

export function parsePublicUserId(value) {
  const m = String(value ?? "").match(/[?&]user_id=([^&#\s]+)/);
  return m ? decodeURIComponent(m[1]).trim() : "";
}
// Accepts the WG "Auth URL" (…/oauth/access?user_id=..&client_id=XXXXXXXX&character_id=..) or a bare 8-char id.
export function parseClientId(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^[A-Za-z0-9]{8}$/.test(v)) return v;
  try { return (new URL(v).searchParams.get("client_id") ?? "").trim(); }
  catch { const m = v.match(/[?&]client_id=([^&#\s]+)/); return m ? decodeURIComponent(m[1]).trim() : ""; }
}
// WG server choice: "production" uses the fixed prod URL; "custom" uses the write-in URL.
export function resolveFunctionsUrl(server, customUrl) {
  if (server !== "custom") return PROD_FUNCTIONS_URL;
  return (String(customUrl ?? "").trim() || DEFAULT_FUNCTIONS_URL).replace(/\/+$/, "");
}