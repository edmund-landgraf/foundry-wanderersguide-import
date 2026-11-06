const MOD = "blue-fvtt";
const ROOT = `modules/${MOD}/assets`;
// Final art wins automatically if present; otherwise the SVG placeholder is used.
const DEFAULTS = {
  background: [`${ROOT}/water-sky-bg.webp`, `${ROOT}/water-sky-bg-placeholder.svg`],
  pauseIcon: [`${ROOT}/d20-blue.webp`, `${ROOT}/d20-blue-placeholder.svg`]
};

function probe(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = foundry.utils.getRoute(src); });
}
async function resolveImage(key) {
  const chosen = game.settings.get(MOD, key);
  const list = chosen ? [chosen, ...DEFAULTS[key]] : DEFAULTS[key];
  for (const src of list) if (await probe(src)) return src;
  return null;
}

let pauseSrc = null;

async function applyBackground() {
  const src = await resolveImage("background");
  if (src) document.body.style.setProperty("--background-url", `url('${foundry.utils.getRoute(src)}')`);
}
function applySheetTheme() {
  document.body.classList.toggle("blue-fvtt-sheets", game.settings.get(MOD, "sheetTheme"));
}
function applyPause(html) {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? document.getElementById("pause");
  const img = root?.querySelector("img");
  if (img && pauseSrc) img.src = foundry.utils.getRoute(pauseSrc);
}

Hooks.once("init", () => {
  document.body.classList.add("blue-fvtt");
  const reg = (key, name, hint, extra) => game.settings.register(MOD, key, { name, hint, scope: "world", config: true, ...extra });
  reg("background", "Background image", "Shown behind the UI when no scene is active. Blank = assets/water-sky-bg.webp (or placeholder).",
    { type: String, default: "", filePicker: "image", onChange: applyBackground });
  reg("pauseIcon", "Pause icon (d20)", "Spinning image on GAME PAUSED. Blank = assets/d20-blue.webp (or placeholder).",
    { type: String, default: "", filePicker: "image", onChange: async () => { pauseSrc = await resolveImage("pauseIcon"); ui.pause?.render(); } });
  reg("sheetTheme", "Dark blue PF2e sheets", "Recolor the crimson PF2e character sheet dark blue.",
    { type: Boolean, default: true, onChange: applySheetTheme });
});

Hooks.once("setup", async () => {
  applySheetTheme();
  await applyBackground();
  pauseSrc = await resolveImage("pauseIcon");
});

Hooks.on("renderGamePause", (app, html) => applyPause(html));

Hooks.once("ready", () => { applyPause(); ui.pause?.render(); });
// Default scene: if the world has no scenes, a GM client creates and activates a water and sky scene.
Hooks.once("ready", async () => {
  if (!game.user.isGM || game.scenes.size > 0) return;
  const src = (await resolveImage("background")) ?? `${ROOT}/water-sky-bg.webp`;
  const scene = await Scene.create({
    name: "Blue FVTT",
    width: 1672, height: 941, padding: 0,
    background: { src },
    grid: { type: 0 },
    tokenVision: false
  });
  // v14 stores scene backgrounds on levels; set it there too.
  const lvl = scene?.levels?.contents?.[0] ?? scene?.levels?.[0];
  if (lvl && !lvl.background?.src) await lvl.update({ "background.src": src });
  await scene?.activate();
});