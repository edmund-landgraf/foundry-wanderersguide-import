# Wanderer's Guide Import (Foundry VTT, PF2e)

Imports Pathfinder 2e characters from Wanderer's Guide (WGUI) into the current Foundry world. MVP; see [docs/PLAN.md](docs/PLAN.md).

## Install

Foundry → Add-on Modules → Install Module → Manifest URL:

```
https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/module.json
```

For development, link the repo into `<Foundry Data>/modules/foundry-wanderersguide-import` (Windows: `mklink /J`).

Requires Foundry v12–v13 and the `pf2e` system. Enable the module in your world.

## API key setup (only auth mode)

1. In Wanderer's Guide, open account settings and create an API client. Copy its key.
2. On each character you want to import, grant that API client access.
3. In Foundry → Configure Settings → Wanderer's Guide Import, click Copy next to **Key** in Wanderer's Guide (Account > API Clients) and paste it into **API Key**. Optionally click Copy next to **Auth URL** and paste the whole URL into **Auth URL**, so the list marks only characters granted to that client (a bare 8-character client id also works). It is a **client** setting (stored only in this browser) and is never logged.
4. Pick **WG server**:
   - **Production** (default): `https://amba.wandersguide.site/functions/v1`
   - **Custom**: enter **Custom server URL** (local dev default `http://127.0.0.1:8000/functions/v1`). A URL saved by 0.1.0 is kept and switched to Custom.

## Use

Actors sidebar → **Import from Wanderer's Guide** → tick characters → **Import selected**. Characters without a grant are greyed out. Each import whispers a miss report to you. Re-importing the same WG character updates the same actor (flags `wgId` + host).

## What works / what's stubbed

Works: character list, one-at-a-time JSON v4 export with 429 backoff, actor create/update by flags, compendium match (slug → name → name+level) for ancestry, heritage, background, class, feats, spells, equipment; unmatched items become world items in a "Wanderer's Guide Homebrew" folder; level, languages, attributes, HP forced from WG.

Stubbed (TODOs reference PLAN milestones): ChoiceSet pre-answers, runes/materials, spellcasting entries, dry-run diff, parity check.

## Tests

```
npm test
```
