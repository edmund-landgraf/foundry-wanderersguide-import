import { PROD_FUNCTIONS_URL, DEFAULT_FUNCTIONS_URL } from "./constants.js";
import { needsTraitCatalog } from "./custom-items.js";
// WG edge-function client. API key is the only auth (see docs/PLAN.md section 2).
// The key is never logged or included in error messages.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_RETRY_MS = 60_000;

/** Delay before a 429 retry. X-RateLimit-Reset is a delay in seconds, or a Unix epoch when the value is an absolute timestamp. Retry-After is delta-seconds or an HTTP date. */
export function retryDelayMs(headers, attempt = 0, now = Date.now()) {
  const clamp = (ms) => Math.min(MAX_RETRY_MS, Math.max(0, Number.isFinite(ms) ? ms : 0));
  const retryAfter = headers?.get?.("retry-after");
  if (retryAfter != null && String(retryAfter).trim()) {
    const raw = String(retryAfter).trim();
    if (/^\d+(\.\d+)?$/.test(raw)) return clamp(Number(raw) * 1000);
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return clamp(date - now);
  }
  const resetRaw = headers?.get?.("x-ratelimit-reset");
  const reset = Number(resetRaw);
  if (Number.isFinite(reset) && reset > 0) {
    if (reset > 1_000_000_000) return clamp(reset * 1000 - now);
    return clamp(reset * 1000);
  }
  return clamp((2 ** attempt) * 2000);
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Remote custom WG endpoints must be HTTPS. HTTP is limited to loopback. */
export function assertSecureFunctionsUrl(url) {
  let parsed;
  try { parsed = new URL(String(url ?? "").trim()); }
  catch { throw new WgApiError(0, "Custom Wanderer's Guide URL is not valid."); }
  const loopback = LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback)) return String(url).trim().replace(/\/+$/, "");
  throw new WgApiError(0, "A remote Wanderer's Guide server must use HTTPS. HTTP is only allowed for localhost.");
}

export class WgApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function callFunction({ baseUrl, apiKey, fn, body, fetchImpl = globalThis.fetch, maxRetries = 3, now = Date.now }) {
  if (!apiKey || apiKey.trim().length !== 36) throw new WgApiError(0, "Set a 36-character Wanderer's Guide API key in module settings.");
  assertSecureFunctionsUrl(baseUrl);
  const url = `${baseUrl.replace(/\/$/, "")}/${fn}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (res.status === 429 && attempt < maxRetries) {
      await sleep(retryDelayMs(res.headers, attempt, now()));
      continue;
    }
    const { json, raw } = await readResponse(res);
    if (!res.ok || json?.status === "fail" || json?.status === "error") {
      throw new WgApiError(res.status, friendlyError(res.status, json, { fn, raw, apiKey }));
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      throw new WgApiError(res.status, `${fn}: Wanderer's Guide returned an empty or non-JSON response.`);
    }
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
/** Strip API keys, bearer tokens, and UUID-shaped secrets from untrusted server text. */
export function redactSecrets(text, apiKey = "") {
  let s = String(text ?? "");
  const key = String(apiKey ?? "").trim();
  if (key) s = s.split(key).join("[redacted]");
  s = s.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]");
  s = s.replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, "[redacted]");
  return s.replace(/\s+/g, " ").trim();
}

async function readResponse(res) {
  if (typeof res?.text === "function") {
    let raw = "";
    try { raw = await res.text(); } catch { raw = ""; }
    if (!raw) return { json: null, raw: "" };
    try { return { json: JSON.parse(raw), raw }; } catch { return { json: null, raw }; }
  }
  try { return { json: typeof res?.json === "function" ? await res.json() : null, raw: "" }; }
  catch { return { json: null, raw: "" }; }
}

export function friendlyError(status, json, { fn = "", raw = "", apiKey = "" } = {}) {
  const code = json?.data?.code;
  if (code && ERROR_TEXT[code]) return fn ? `${fn}: ${ERROR_TEXT[code]}` : ERROR_TEXT[code];
  const fallback = raw ? redactSecrets(raw, apiKey).slice(0, 160) : `HTTP ${status}`;
  const msg = json?.data?.message ?? json?.message ?? fallback;
  const label = { 401: "API key rejected", 403: "Not allowed for this API key", 404: "Function not found on this WG server (is wgui-ext deployed?)", 429: "Rate limited" }[status];
  // Upstream error text is untrusted. Do not allow a UUID-shaped API key or token to
  // leak into notifications, chat cards, or console errors.
  const safe = redactSecrets(msg, apiKey);
  const core = label ? `${label} (${status}): ${safe}` : safe;
  return fn ? `${fn}: ${core}` : core;
}

/** Characters the API key can read (server scopes by key, so every row is importable). */
export async function listCharacters(opts) {
  const json = await callFunction({ ...opts, fn: "wgui-ext-list-key-characters", body: {} });
  if (!Array.isArray(json.data)) throw new WgApiError(0, "wgui-ext-list-key-characters: response did not include a character list.");
  return summarizeCharacters(json.data);
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
    player: c.player ?? null,
  }));
}

/** wgui-ext campaign row -> {id, name, imageUrl, imageFocusY, characterIds, owned}. imageUrl = WG campaign art (meta_data.image_url). */
export function summarizeCampaign(c) {
  if (!c) return null;
  return { id: c.id, name: c.name, imageUrl: c.image_url ?? null, imageFocusY: c.image_focus_y ?? null, characterIds: c.character_ids ?? [], owned: c.owned === true };
}

/** Campaigns visible to the key (see summarizeCampaign). owned = the key's user is the GM. */
export async function listCampaigns(opts) {
  const json = await callFunction({ ...opts, fn: "wgui-ext-find-key-campaigns", body: {} });
  if (!Array.isArray(json.data?.campaigns)) throw new WgApiError(0, "wgui-ext-find-key-campaigns: response did not include a campaign list.");
  return json.data.campaigns.map(summarizeCampaign);
}

/** One campaign and its characters. For the GM this is every PC that joined the campaign (with `player`). */
export async function getCampaign(opts, campaignId) {
  const json = await callFunction({ ...opts, fn: "wgui-ext-find-key-campaigns", body: { campaign_id: Number(campaignId) } });
  if (!json.data || typeof json.data !== "object" || !json.data.campaign) throw new WgApiError(0, "wgui-ext-find-key-campaigns: response did not include that campaign.");
  if (!Array.isArray(json.data.characters)) throw new WgApiError(0, "wgui-ext-find-key-campaigns: response did not include a character list.");
  return { campaign: summarizeCampaign(json.data.campaign), characters: summarizeCharacters(json.data.characters) };
}

/** Campaign name for a row, falling back to "Campaign #id" only when the name is unknown. */
export function campaignLabel(campaignId, names) {
  if (campaignId == null) return "";
  return names?.get?.(campaignId) ?? names?.[campaignId] ?? `Campaign #${campaignId}`;
}
// Slim export (wgui-export-character-slim): the same v4 file without the all_spells / all_traits
// catalog the importer never reads, about 0.12 MB instead of 4 MB. A WG server without it answers
// 404 or a 5xx worker error, so fall back to the full export. Auth failures (401/403/429) do not fall back.
export const SLIM_EXPORT_FN = "wgui-export-character-slim";
export const FULL_EXPORT_FN = "wgui-export-character";
/** Same gate the API uses. A local file is not planned unless it is JSON v4. */
export function parseLocalExport(text) {
  let json;
  try { json = JSON.parse(String(text ?? "")); }
  catch { throw new WgApiError(0, unsupportedExportMessage(null)); }
  if (!json || json.version !== 4 || !json.character) throw new WgApiError(0, unsupportedExportMessage(json));
  return json;
}

export function unsupportedExportMessage(json) {
  const version = json && typeof json === "object" && "version" in json && json.version != null && json.version !== "" ? json.version : "missing";
  return `Export was not a JSON v4 character (version ${version}).`;
}

export async function exportCharacter(opts, id) {
  const body = { id: Number(id), format: "json" };
  let json;
  let slimError = null;
  try {
    json = await callFunction({ ...opts, fn: SLIM_EXPORT_FN, body });
  } catch (e) {
    if (!(e instanceof WgApiError) || !(e.status === 404 || e.status >= 500)) throw e;
    slimError = e;
    try {
      json = await callFunction({ ...opts, fn: FULL_EXPORT_FN, body });
    } catch (full) {
      if (full instanceof WgApiError) {
        full.message = `${full.message} (slim export ${SLIM_EXPORT_FN} also failed: HTTP ${slimError.status})`;
      }
      throw full;
    }
  }
  if (!json || json.version !== 4 || !json.character) throw new WgApiError(0, unsupportedExportMessage(json));
  // Custom items and official selections (e.g. ancestry trait ids) reference catalog rows by id;
  // the slim file drops official all_traits / all_spells names. Fetch the full file only then,
  // so those names are never guessed.
  if (json.slim && needsTraitCatalog(json)) {
    try { const full = await callFunction({ ...opts, fn: FULL_EXPORT_FN, body }); if (full?.version === 4 && full.character) return full; } catch { /* keep the slim file; traits are reported unresolved */ }
  }
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
  return assertSecureFunctionsUrl((String(customUrl ?? "").trim() || DEFAULT_FUNCTIONS_URL).replace(/\/+$/, ""));
}
