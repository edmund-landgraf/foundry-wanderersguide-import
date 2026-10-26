import { MODULE_ID, DEFAULT_FUNCTIONS_URL } from "./constants.js";
import { openImportDialog } from "./dialog.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "apiKey", {
    name: "WGI.Settings.ApiKey.Name", hint: "WGI.Settings.ApiKey.Hint",
    scope: "client", config: true, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "authUrl", {
    name: "WGI.Settings.AuthUrl.Name", hint: "WGI.Settings.AuthUrl.Hint",
    scope: "client", config: true, type: String, default: "",
  });
  // Legacy 0.1.0 bare client id; hidden, migrated into authUrl on ready.
  game.settings.register(MODULE_ID, "clientId", { scope: "client", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "functionsUrl", {
    name: "WGI.Settings.FunctionsUrl.Name", hint: "WGI.Settings.FunctionsUrl.Hint",
    scope: "client", config: true, type: String, default: DEFAULT_FUNCTIONS_URL,
  });
});

Hooks.on("renderSettingsConfig", (_app, html) => {
  const root = html[0] ?? html;
  const input = root.querySelector(`input[name="${MODULE_ID}.apiKey"]`);
  if (input) input.type = "password";
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
  console.log(`${MODULE_ID} | ready`);
});
