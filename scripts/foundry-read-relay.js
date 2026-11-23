// GM-only, read-only character source for the WGUI Foundry import relay.
// This does not modify the existing Wanderer's Guide -> Foundry importer.

export const DEFAULT_RELAY_URL = "http://127.0.0.1:8787";
const ACTOR_ID = /^[A-Za-z0-9]{1,32}$/;
const WORLD_ID = /^[A-Za-z0-9]{1,32}$/; // Current WGUI relay contract.
const REQUEST_ID = /^[0-9a-f]{16}$/;
const OMIT_KEYS = new Set([
  "biography", "notes", "gmnotes", "privatenotes", "secretnotes",
  "hiddennotes", "secrets", "secret", "description",
]);

// Do not allow a configured relay to transmit a GM's actor data over plain
// HTTP to a remote machine. Loopback HTTP and remote HTTPS are supported.
export function validateRelayUrl(raw) {
  let url;
  try { url = new URL(String(raw || "").trim()); }
  catch { throw new Error("Enter a valid WGUI relay URL."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash ||
      (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Relay must be an HTTPS origin or a loopback HTTP origin, without a path.");
  }
  return url.origin;
}

export function validateReadConfig({ code, worldId, origin, relayUrl }) {
  const secret = String(code ?? "").trim();
  if (secret.length < 16 || secret.length > 128) {
    throw new Error("Set a connection code of 16 to 128 characters in Wanderer's Guide Import settings.");
  }
  if (!WORLD_ID.test(String(worldId ?? ""))) {
    throw new Error("This world ID is not supported by the current WGUI relay (letters and digits only).");
  }
  let address;
  try { address = new URL(origin); }
  catch { throw new Error("Open a Foundry world in the browser first."); }
  if (!["http:", "https:"].includes(address.protocol) ||
      address.pathname !== "/" || address.search || address.hash ||
      address.username || address.password) {
    throw new Error("Foundry world origin must be an HTTP(S) origin.");
  }
  return { code: secret, worldId, origin: address.origin, relayUrl: validateRelayUrl(relayUrl) };
}

export const LINK_FLAG = "foundry-wanderersguide-import";
const ACTOR_LINK_KEYS = ["wgId", "host"];
const ITEM_LINK_KEYS = ["wgItemId", "wgInvId"];

/** Origin comparison for the Wanderer's Guide functions host. Not a world id. */
export function sameFunctionsHost(left, right) {
  const origin = (value) => {
    const text = String(value ?? "").trim().replace(/\/+$/, "");
    if (!text) return null;
    try { return new URL(text).origin; }
    catch { return null; }
  };
  const a = origin(left);
  const b = origin(right);
  return !!a && a === b;
}

/** Present linkage keys only. Missing keys are omitted, never null. */
export function linkageFields(flags, keys) {
  const raw = flags?.[LINK_FLAG];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const key of keys) {
    if (raw[key] == null || raw[key] === "") continue;
    out[key] = raw[key];
  }
  return Object.keys(out).length ? out : null;
}

// Only copy PF2e rules selections. Other flags can carry module secrets or GM data.
function onlyRulesSelections(flags) {
  const selections = flags?.pf2e?.rulesSelections;
  if (!selections || typeof selections !== "object" || Array.isArray(selections)) return {};
  return { pf2e: { rulesSelections: cleanValue(selections) } };
}

function withLinkage(flags, keys) {
  const next = onlyRulesSelections(flags);
  const link = linkageFields(flags, keys);
  if (link) next[LINK_FLAG] = link;
  return next;
}

function cleanValue(value) {
  if (Array.isArray(value)) return value.map(cleanValue);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.replace(/[\s_-]/g, "").toLowerCase();
    if (OMIT_KEYS.has(normalized)) continue;
    if (key === "flags") {
      result.flags = onlyRulesSelections(entry);
    } else {
      result[key] = cleanValue(entry);
    }
  }
  return result;
}

export function listFoundryCharacters(gameRef) {
  if (!gameRef?.user?.isGM) return [];
  return (gameRef.actors?.contents ?? [])
    .filter((actor) => actor.type === "character" && ACTOR_ID.test(String(actor.id ?? "")))
    .map((actor) => {
      const embedded = actor.items?.contents ?? [];
      const itemName = (kind) => embedded.find((item) => item.type === kind)?.name ?? null;
      const rawLevel = actor.system?.details?.level?.value;
      const folderId = ACTOR_ID.test(String(actor.folder?.id ?? "")) ? String(actor.folder.id) : null;
      return {
        id: actor.id,
        name: String(actor.name ?? ""),
        level: typeof rawLevel === "number" && Number.isFinite(rawLevel) ? rawLevel : null,
        ancestry: itemName("ancestry"),
        className: itemName("class"),
        ...(folderId ? { folderId, folderName: typeof actor.folder?.name === "string" ? actor.folder.name : "" } : {}),
      };
    });
}

export function readFoundryCharacter(gameRef, actorId) {
  if (!gameRef?.user?.isGM || !ACTOR_ID.test(String(actorId ?? ""))) return null;
  const actor = gameRef.actors?.get?.(actorId);
  if (!actor || actor.type !== "character" || typeof actor.toObject !== "function") return null;
  const source = actor.toObject();
  if (!source || typeof source !== "object") return null;
  // The relay separately scrubs biography and flags, but they must not leave
  // the GM's Foundry browser in the first place.
  const cleaned = cleanValue(source);
  cleaned._id = actor.id;
  cleaned.type = "character";
  cleaned.flags = withLinkage(source.flags, ACTOR_LINK_KEYS);
  if (Array.isArray(cleaned.items) && Array.isArray(source.items)) {
    cleaned.items.forEach((item, index) => {
      if (item && typeof item === "object") item.flags = withLinkage(source.items[index]?.flags, ITEM_LINK_KEYS);
    });
  }
  return cleaned;
}

export function initialRelayStatus() {
  return { status: "disabled", ownsLease: false, reason: "" };
}

let relayStatus = initialRelayStatus();

export function getFoundryReadRelayStatus() {
  return { ...relayStatus };
}

/** connected requires this tab's lease and an established session. */
export function reduceRelayStatus(current, event) {
  const base = current ?? initialRelayStatus();
  if (event?.type === "disabled") return { status: "disabled", ownsLease: false, reason: event.reason ?? "" };
  if (event?.type === "invalid") return { status: "invalid", ownsLease: false, reason: event.reason ?? "" };
  if (event?.type === "waiting") return { status: "waiting", ownsLease: false, reason: "" };
  if (event?.type === "disconnected") return { status: "disconnected", ownsLease: false, reason: event.reason ?? "" };
  if (event?.type === "connected" && event.ownsLease && event.session) {
    return { status: "connected", ownsLease: true, reason: "" };
  }
  return { ...base };
}

export function setFoundryReadRelayStatus(event) {
  relayStatus = reduceRelayStatus(relayStatus, event);
  return getFoundryReadRelayStatus();
}

export function resetFoundryReadRelayStatus() {
  relayStatus = initialRelayStatus();
}

async function post(fetchImpl, base, path, body, session, signal) {
  const response = await fetchImpl(base + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(session ? { "X-WGI-Relay-Session": session } : {}),
    },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    const err = new Error("WGUI relay request failed.");
    err.status = response.status;
    throw err;
  }
  return response.json();
}

function delay(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); signal?.removeEventListener?.("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener?.("abort", done, { once: true });
  });
}

// This loop is outbound only: a GM browser connects, waits for commands, and
// returns a single character list or source. Never opens an HTTP route in Foundry.
export function jsonUtf8ByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** One browser owner for the relay. A second GM tab waits instead of replacing the session. */
export function createRelayLease({ storage, key, ownerId, ttlMs = 15000, now = () => Date.now() }) {
  const read = () => {
    try { return JSON.parse(storage.getItem(key) || "null"); }
    catch { return null; }
  };
  return {
    tryAcquire() {
      const cur = read();
      if (cur && cur.ownerId !== ownerId && Number(cur.expiresAt) > now()) return false;
      storage.setItem(key, JSON.stringify({ ownerId, expiresAt: now() + ttlMs }));
      return read()?.ownerId === ownerId;
    },
    release() {
      if (read()?.ownerId === ownerId) storage.removeItem(key);
    },
  };
}

export async function runFoundryReadRelay({
  gameRef, config, fetchImpl = fetch, signal, onState = () => {},
  backoffMs = 2000, lease = null, leaseWaitMs = 250,
}) {
  if (!gameRef?.user?.isGM) return;
  const settings = validateReadConfig(config);
  let session = null;
  let lastState = "";
  const state = (value) => {
    if (lastState !== value) { lastState = value; onState(value); }
  };
  if (lease) {
    if (!lease.tryAcquire()) state("waiting");
    while (!signal?.aborted && !lease.tryAcquire()) await delay(leaseWaitMs, signal);
    if (signal?.aborted) return;
  }
  while (!signal?.aborted && gameRef.user?.isGM) {
    try {
      if (!session) {
        const result = await post(fetchImpl, settings.relayUrl, "/foundry-relay/v1/connect", {
          code: settings.code, worldId: settings.worldId, origin: settings.origin,
        }, null, signal);
        if (typeof result.session !== "string" || result.session.length < 16 ||
            result.worldId !== settings.worldId) throw new Error("Invalid WGUI relay session.");
        session = result.session;
        if (!lease || lease.tryAcquire()) state("connected");
      }
      const job = await post(fetchImpl, settings.relayUrl, "/foundry-relay/v1/wait", {}, session, signal);
      if (signal?.aborted) break;
      if (job.type === "idle") continue;
      if (job.type === "bye") { session = null; continue; }
      if ((job.type !== "list" && job.type !== "actor") ||
          typeof job.requestId !== "string" || !REQUEST_ID.test(job.requestId)) {
        throw new Error("Invalid WGUI relay job.");
      }
      const reply = { requestId: job.requestId, worldId: settings.worldId };
      if (job.type === "list") {
        reply.ok = true;
        reply.characters = listFoundryCharacters(gameRef);
      } else {
        const actor = readFoundryCharacter(gameRef, job.actorId);
        reply.ok = !!actor;
        if (actor) reply.actor = actor;
        else reply.status = 403;
      }
      // A large actor cannot fit the relay's 1.5MB request limit. Count UTF-8 bytes, not UTF-16 code units.
      if (jsonUtf8ByteLength(reply) > 1400000) {
        reply.ok = false;
        delete reply.actor;
        delete reply.characters;
        reply.status = 502;
      }
      await post(fetchImpl, settings.relayUrl, "/foundry-relay/v1/respond", reply, session, signal);
      if (lease && !lease.tryAcquire()) { session = null; state("waiting"); await delay(leaseWaitMs, signal); }
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") break;
      // Do not log errors/requests: a failed fetch may contain a secret URL
      // or a bearer session token in an environment-specific error string.
      session = null;
      state("disconnected");
      await delay(backoffMs, signal);
    }
  }
  lease?.release();
}
