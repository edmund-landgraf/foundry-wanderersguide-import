import { MODULE_ID, DEFAULT_FUNCTIONS_URL } from "./constants.js";
import { addSheetHeaderButtons, exportHandoffMessage, importLinkedCharacter, openImportDialog } from "./dialog.js";
import { DEFAULT_RELAY_URL, createRelayLease, generateFoundryConnectionCode, getFoundryReadRelayStatus, runFoundryReadRelay, setFoundryReadRelayStatus, validateReadConfig } from "./foundry-read-relay.js";
import { assertSecureFunctionsUrl } from "./api.js";

let foundryReadController = null;

function startFoundryReadRelay() {
  foundryReadController?.abort();
  foundryReadController = null;
  if (!game.user?.isGM || !game.world?.id) {
    setFoundryReadRelayStatus({ type: "disabled", reason: "The Foundry read relay is GM-only." });
    return;
  }
  const code = game.settings.get(MODULE_ID, "readRelayCode");
  if (!String(code ?? "").trim()) {
    setFoundryReadRelayStatus({ type: "disabled", reason: "Set a Foundry → WGUI connection code in Wanderer's Guide Import settings." });
    return;
  }
  const config = {
    code,
    relayUrl: game.settings.get(MODULE_ID, "readRelayUrl"),
    worldId: game.world.id,
    origin: globalThis.location?.origin ?? "",
  };
  try {
    validateReadConfig(config);
  } catch (error) {
    setFoundryReadRelayStatus({ type: "invalid", reason: error.message });
    ui.notifications?.warn("WGUI Foundry read relay: " + error.message);
    return;
  }
  setFoundryReadRelayStatus({ type: "waiting" });
  const controller = new AbortController();
  foundryReadController = controller;
  const ownerId = globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random()}`;
  const lease = globalThis.localStorage ? createRelayLease({
    storage: globalThis.localStorage,
    key: `${MODULE_ID}.readRelayLeader`,
    ownerId,
  }) : null;
  void runFoundryReadRelay({
    gameRef: game,
    config,
    signal: controller.signal,
    lease,
    onState: (state) => {
      if (state === "connected") setFoundryReadRelayStatus({ type: "connected", ownsLease: true, session: true });
      else if (state === "waiting") setFoundryReadRelayStatus({ type: "waiting" });
      else if (state === "disconnected") setFoundryReadRelayStatus({ type: "disconnected" });
    },
  }).catch(() => {
    if (!controller.signal.aborted) {
      setFoundryReadRelayStatus({ type: "disconnected" });
      ui.notifications?.warn("WGUI Foundry read relay stopped. Check relay settings.");
    }
  });
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "readRelayCode", {
    name: "WGI.Settings.ReadRelayCode.Name", hint: "WGI.Settings.ReadRelayCode.Hint",
    scope: "client", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "readRelayUrl", {
    name: "WGI.Settings.ReadRelayUrl.Name", hint: "WGI.Settings.ReadRelayUrl.Hint",
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
    onChange: (value) => {
      if (game.settings.get(MODULE_ID, "wgServer") !== "custom") return;
      try { assertSecureFunctionsUrl(value); }
      catch (error) { ui.notifications?.error(error.message); }
    },
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
    const row = readCodeInput.closest(".form-group");
    if (row && !row.querySelector(".wgi-generate-relay-code")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wgi-generate-relay-code";
      btn.textContent = game.i18n.localize("WGI.Settings.ReadRelayGenerate");
      btn.addEventListener("click", async () => {
        const next = generateFoundryConnectionCode();
        readCodeInput.value = next;
        readCodeInput.type = "text";
        await game.settings.set(MODULE_ID, "readRelayCode", next);
        startFoundryReadRelay();
      });
      row.append(btn);
    }
  }
});

function onExportClick(actor) {
  const status = getFoundryReadRelayStatus();
  const message = exportHandoffMessage(status, actor?.name);
  if (status.status === "connected" && status.ownsLease) ui.notifications?.info(message);
  else ui.notifications?.warn(message);
}

function onHeaderButtons(app, buttons) {
  const actor = app?.actor ?? app?.document;
  addSheetHeaderButtons(app, buttons, {
    user: game.user,
    importLabel: game.i18n.localize("WGI.Button"),
    exportLabel: game.i18n.localize("WGI.ExportButton"),
    onImport: () => { void importLinkedCharacter(actor?.getFlag?.(MODULE_ID, "wgId") ?? actor?.flags?.[MODULE_ID]?.wgId); },
    onExport: () => onExportClick(actor),
  });
}

// V13+ name, and the V12 name for the same Application V1 buttons. Not Application V2.
for (const hook of ["getApplicationV1HeaderButtons", "getApplicationHeaderButtons"]) {
  Hooks.on(hook, onHeaderButtons);
}

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
