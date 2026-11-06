# Blue FVTT

Swaps Foundry's default red look for blue: watercolor water-and-sky background, blue d20 pause icon, optional dark-blue PF2e sheets.

## Drop in your final art
Put files in `D:\FoundryVTT\Data\modules\blue-fvtt\assets\` with these exact names (they win automatically over the placeholders):
- `water-sky-bg.webp` - background (1920x1080 or larger, landscape)
- `d20-blue.webp` - pause icon (square, ~256x256, transparent background; it spins)

Any other name/format: set it in Game Settings > Configure Settings > Blue FVTT (file picker). Then press F5.

## What it overrides
- `--background-url` CSS var on `<body>` (core default `ui/backgrounds/setup.webp`, used by `#main-background` when no scene is active).
- `#pause img` src (core default `ui/pause.svg`, from `GamePause._prepareContext`) via the `renderGamePause` hook; blue band + caption via CSS.
- `body.blue-fvtt-sheets` class (setting) enables the dark-blue PF2e sheet CSS (same rules as sheet-theme-dark-blue; disable that module to avoid doubling up).

## Limits
The Setup / Join (login) screens render before any module loads, so a module cannot change them.
- Per world: Setup > edit world > "Background Image" sets the Join screen background.
- Setup screen itself: only by editing core files (`resources/app/public/ui/backgrounds/setup.webp`), which updates overwrite.