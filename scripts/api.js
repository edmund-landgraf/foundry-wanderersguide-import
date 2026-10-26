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
    if (!res.ok) {
      const msg = json?.data?.message ?? json?.message ?? `HTTP ${res.status}`;
      const label = { 401: "API key rejected", 403: "Character not granted to this API client", 429: "Rate limited" }[res.status];
      throw new WgApiError(res.status, label ? `${label} (${res.status}): ${msg}` : msg);
    }
    return json;
  }
}

/** Lightweight list (PLAN 4A.1 v1): find-character {} as the key owner, trimmed to summary fields. */
export async function listCharacters(opts) {
  const json = await callFunction({ ...opts, fn: "find-character", body: {} });
  return summarizeCharacters(json?.data ?? []);
}

export function summarizeCharacters(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    ancestry: c.details?.ancestry?.name ?? "",
    class: c.details?.class?.name ?? "",
    campaignId: c.campaign_id ?? null,
    granted: (c.details?.api_clients?.client_access?.length ?? 0) > 0,
  }));
}

export async function exportCharacter(opts, id) {
  const json = await callFunction({ ...opts, fn: "wgui-export-character", body: { id: Number(id), format: "json" } });
  if (!json || json.version !== 4 || !json.character) throw new WgApiError(0, "Export was not a JSON v4 character.");
  return json;
}
