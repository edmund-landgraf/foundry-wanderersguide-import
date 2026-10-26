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
    if (res.status === 429 && attempt < maxRetries) {
      const reset = Number(res.headers?.get?.("x-ratelimit-reset") ?? res.headers?.get?.("retry-after"));
      await sleep((Number.isFinite(reset) && reset > 0 ? reset : 2 ** attempt * 2) * 1000);
      continue;
    }
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok || json?.status === "fail" || json?.status === "error") throw new WgApiError(res.status, friendlyError(res.status, json));
    return json;
  }
}

// wgui-ext error codes -> user-facing text. Never includes the key.
const ERROR_TEXT = {
  AUTH_REQUIRED: "No API key was sent. Paste your Wanderer's Guide API key in module settings.",
  INVALID_API_KEY: "Wanderer's Guide rejected the API key. Copy it again from Account > API Clients.",
  CAMPAIGN_FORBIDDEN: "This API key has no access to that campaign.",
  CAMPAIGN_ID_INVALID: "Invalid campaign id.",
};
export function friendlyError(status, json) {
  const code = json?.data?.code;
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code];
  const msg = json?.data?.message ?? json?.message ?? `HTTP ${status}`;
  const label = { 401: "API key rejected", 403: "Not allowed for this API key", 404: "Function not found on this WG server (is wgui-ext deployed?)", 429: "Rate limited" }[status];
  return label ? `${label} (${status}): ${msg}` : msg;
}

/** Characters the API key can read (server scopes by key, so every row is importable). */
export async function listCharacters(opts) {
  const json = await callFunction({ ...opts, fn: "wgui-ext-list-key-characters", body: {} });
  return summarizeCharacters(json?.data ?? []);
}

export function summarizeCharacters(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    ancestry: typeof c.ancestry === "string" ? c.ancestry : c.ancestry?.name ?? c.details?.ancestry?.name ?? "",
    class: typeof c.class === "string" ? c.class : c.class?.name ?? c.details?.class?.name ?? "",
    campaignId: c.campaign_id ?? null,
    imageUrl: c.image_url ?? "",
    updatedAt: c.updated_at ?? "",
  }));
}

/** Campaigns visible to the key: [{id, name, characterIds}]. */
export async function listCampaigns(opts) {
  const json = await callFunction({ ...opts, fn: "wgui-ext-find-key-campaigns", body: {} });
  return (json?.data?.campaigns ?? []).map((c) => ({ id: c.id, name: c.name, characterIds: c.character_ids ?? [] }));
}

/** One campaign and its characters. */
export async function getCampaign(opts, campaignId) {
  const json = await callFunction({ ...opts, fn: "wgui-ext-find-key-campaigns", body: { campaign_id: Number(campaignId) } });
  return { campaign: json?.data?.campaign ?? null, characters: summarizeCharacters(json?.data?.characters ?? []) };
}

/** Campaign name for a row, falling back to "Campaign #id" only when the name is unknown. */
export function campaignLabel(campaignId, names) {
  if (campaignId == null) return "";
  return names?.get?.(campaignId) ?? names?.[campaignId] ?? `Campaign #${campaignId}`;
}
export async function exportCharacter(opts, id) {
  const json = await callFunction({ ...opts, fn: "wgui-export-character", body: { id: Number(id), format: "json" } });
  if (!json || json.version !== 4 || !json.character) throw new WgApiError(0, "Export was not a JSON v4 character.");
  return json;
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