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

// Only copy PF2e rules selections. Other flags can carry module secrets or GM data.
function onlyRulesSelections(flags) {
  const selections = flags?.pf2e?.rulesSelections;
  if (!selections || typeof selections !== "object" || Array.isArray(selections)) return {};
  return { pf2e: { rulesSelections: cleanValue(selections) } };
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
  return cleaned;
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
export async function runFoundryReadRelay({
  gameRef, config, fetchImpl = fetch, signal, onState = () => {},
  backoffMs = 2000,
}) {
  if (!gameRef?.user?.isGM) return;
  const settings = validateReadConfig(config);
  let session = null;
  let lastState = "";
  const state = (value) => {
    if (lastState !== value) { lastState = value; onState(value); }
  };
  while (!signal?.aborted && gameRef.user?.isGM) {
    try {
      if (!session) {
        const result = await post(fetchImpl, settings.relayUrl, "/foundry-relay/v1/connect", {
          code: settings.code, worldId: settings.worldId, origin: settings.origin,
        }, null, signal);
        if (typeof result.session !== "string" || result.session.length < 16 ||
            result.worldId !== settings.worldId) throw new Error("Invalid WGUI relay session.");
        session = result.session;
        state("connected");
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
      // A large actor cannot fit the relay's 1.5MB request limit.
      if (JSON.stringify(reply).length > 1400000) {
        reply.ok = false;
        delete reply.actor;
        delete reply.characters;
        reply.status = 502;
      }
      await post(fetchImpl, settings.relayUrl, "/foundry-relay/v1/respond", reply, session, signal);
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") break;
      // Do not log errors/requests: a failed fetch may contain a secret URL
      // or a bearer session token in an environment-specific error string.
      session = null;
      state("disconnected");
      await delay(backoffMs, signal);
    }
  }
}
