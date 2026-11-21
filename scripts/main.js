import { MODULE_ID, DEFAULT_FUNCTIONS_URL } from "./constants.js";
import { openImportDialog } from "./dialog.js";
import { DEFAULT_RELAY_URL, runFoundryReadRelay, validateReadConfig } from "./foundry-read-relay.js";

let foundryReadController = null;

function startFoundryReadRelay() {
  foundryReadController?.abort();
  foundryReadController = null;
  if (!game.user?.isGM || !game.world?.id) return;
  const code = game.settings.get(MODULE_ID, "readRelayCode");
  if (!String(code ?? "").trim()) return; // Explicit opt-in: disabled until a code is set.
  const config = {
    code,
    relayUrl: game.settings.get(MODULE_ID, "readRelayUrl"),
    worldId: game.world.id,
    origin: globalThis.location?.origin ?? "",
  };
  try {
    validateReadConfig(config);
  } catch (error) {
    ui.notifications?.warn("WGUI Foundry read relay: " + error.message);
    return;
  }
  const controller = new AbortController();
  foundryReadController = controller;
  void runFoundryReadRelay({
    gameRef: game,
    config,
    signal: controller.signal,
    onState: (state) => {
      if (state === "connected") console.info(MODULE_ID + " | read relay connected");
      // Do not log fetch errors: their text may include credentials.
    },
  }).catch(() => {
    if (!controller.signal.aborted) ui.notifications?.warn("WGUI Foundry read relay stopped. Check relay settings.");
  });
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "readRelayCode", {
    name: "Foundry → WGUI connection code",
    hint: "GM only. 16–128 character shared secret. The WGUI Import from Foundry dialog uses this code. Stored in this browser only.",
    scope: "client", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "readRelayUrl", {
    name: "Foundry → WGUI relay URL",
    hint: "Local relay defaults to http://127.0.0.1:8787. Use an HTTPS origin for a remote relay.",
    scope: "client", config: true, type: String, default: DEFAULT_RELAY_URL,
  });
  game.settings.register(MODULE_ID, "apiKey", {
    name: "WGI.Settings.ApiKey.Name", hint: "WGI.Settings.ApiKey.Hint",
    scope: "client", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "authUrl", {
    // Hidden since wgui-ext: the server scopes by API key, so client_id filtering is redundant. Kept so saved values survive.
    name: "WGI.Settings.AuthUrl.Name", hint: "WGI.Settings.AuthUrl.Hint",
    scope: "client", config: false, type: String, default: "",
  });
  // Legacy 0.1.0 bare client id; hidden, migrated into authUrl on ready.
  game.settings.register(MODULE_ID, "clientId", { scope: "client", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "wgServer", {
    name: "WGI.Settings.WgServer.Name", hint: "WGI.Settings.WgServer.Hint",
    scope: "client", config: true, type: String, default: "production",
    choices: { production: "WGI.Settings.WgServer.Production", custom: "WGI.Settings.WgServer.Custom" },
  });
  // Custom server URL (key kept from 0.1.0 so existing values keep working); used only when wgServer = custom.
  game.settings.register(MODULE_ID, "functionsUrl", {
    name: "WGI.Settings.FunctionsUrl.Name", hint: "WGI.Settings.FunctionsUrl.Hint",
    scope: "client", config: true, type: String, default: DEFAULT_FUNCTIONS_URL,
  });
});

Hooks.on("renderSettingsConfig", (_app, html) => {
  const root = html[0] ?? html;
  const input = root.querySelector(`input[name="${MODULE_ID}.apiKey"]`);
  if (input) input.type = "password";
  const readCodeInput = root.querySelector('input[name="' + MODULE_ID + '.readRelayCode"]');
  if (readCodeInput) {
    readCodeInput.type = "password";
    readCodeInput.autocomplete = "off";
  }
});

Hooks.on("renderActorDirectory", (_app, html) => {
  const root = html[0] ?? html;
  if (root.querySelector(".wgi-import")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wgi-import";
  btn.innerHTML = `<i class="fas fa-file-import"></i> ${game.i18n.localize("WGI.Button")}`;
  btn.addEventListener("click", () => openImportDialog());
  (root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root).append(btn);
});

Hooks.once("ready", async () => {
  const legacy = (game.settings.get(MODULE_ID, "clientId") ?? "").trim();
  if (legacy && !(game.settings.get(MODULE_ID, "authUrl") ?? "").trim()) {
    await game.settings.set(MODULE_ID, "authUrl", legacy);
    await game.settings.set(MODULE_ID, "clientId", "");
  }
  // 0.1.0 users who saved a functions URL keep it: map them to Custom.
  const store = game.settings.storage.get("client");
  if (store?.getItem(`${MODULE_ID}.functionsUrl`) != null && store?.getItem(`${MODULE_ID}.wgServer`) == null) {
    await game.settings.set(MODULE_ID, "wgServer", "custom");
  }
  console.log(`${MODULE_ID} | ready (server: ${game.settings.get(MODULE_ID, "wgServer")})`);
  startFoundryReadRelay();
});

// Client-scoped settings can be edited without restarting the Foundry world.
Hooks.on("closeSettingsConfig", () => startFoundryReadRelay());
