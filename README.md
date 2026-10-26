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
3. In Foundry → Configure Settings → Wanderer's Guide Import, click Copy next to **Key** in Wanderer's Guide (Account > API Clients) and paste it into **API Key**. It is a **client** setting (stored only in this browser) and is never logged.
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

## Wanderer's Guide functions used

The module calls the key-scoped `wgui-ext` functions (POST `<base>/functions/v1/<name>`, `Authorization: Bearer <API key>`):

- `wgui-ext-list-key-characters`: the character list. The server returns only characters the key can read, so no client-id filtering is done in Foundry (the old **Auth URL** setting is hidden and unused).
- `wgui-ext-find-key-campaigns`: campaign names for the Campaign column.
- `wgui-export-character`: the JSON v4 export used for the import.

Errors such as `INVALID_API_KEY`, `CAMPAIGN_FORBIDDEN` and `CAMPAIGN_ID_INVALID` are shown as plain notifications. These functions must be deployed on the selected WG server.