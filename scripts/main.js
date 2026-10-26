import { MODULE_ID, DEFAULT_FUNCTIONS_URL } from "./constants.js";
import { openImportDialog } from "./dialog.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "apiKey", {
    name: "WGI.Settings.ApiKey.Name", hint: "WGI.Settings.ApiKey.Hint",
    scope: "client", config: true, type: String, default: "",
  });
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

Hooks.once("ready", () => console.log(`${MODULE_ID} | ready`));
