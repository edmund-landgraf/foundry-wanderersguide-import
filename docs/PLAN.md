# Foundry Wanderer's Guide Import: Plan

Status: implemented experimental MVP. The repository is GitHub-backed; see the README for current supported behavior and known limitations. This plan remains the target-state roadmap rather than a claim that every PF2e parity field is complete.

For the implementation sequence that preserves AMBA's WG v4 decoding and selection methods, see [AMBA reuse plan](AMBA_REUSE_PLAN.md). That plan takes precedence over this document where this older roadmap proposes reimplementing WG parsing in the Foundry module.

## 1. Goal

A Foundry VTT module, run by a player or GM in the current world, that pulls a Pathfinder 2e character from Wanderer's Guide (`https://wgui.wandersguide.site`) and creates or updates a PF2e `character` actor:

- Class, ancestry, heritage, background, feats, spells and gear are linked to PF2e compendium items.
- Content that only exists in the export (homebrew) is created as world items.
- Importing the same WG character again updates the same actor instead of making a new one.

## 2. Authentication: WG API key only

The API key is the **only** auth mode. No OAuth, no Supabase/GoTrue login, no JWT handling in the module.

Why: the export function (`WanderersGuideUI/supabase/wgui-export/_wgui-export/connect-raw.ts:147-183`) accepts either a 36-char UUID API key or a JWT. The site's only OAuth (tactics-mcp `src/oauth.ts:15-41`) is locked to the Grokbot and ChatGPT clients, has no dynamic registration, and issues `wgui_...` tokens (`tactics-mcp/src/tokens.ts:80`) that the export function rejects (`connect-raw.ts:151-161`).

### 2.1 How the user sets it up

1. In Wanderer's Guide, the user opens account settings and creates an API client. WG stores it in `public_user.api.clients[]` with an `id` and an `api_key` (UUID).
2. On each character to be imported, the user grants that API client access. WG stores the grant in `character.details.api_clients.client_access[]` as `{ clientId, publicUserId }`.
3. In Foundry, the user pastes the key into the module setting (see 2.2).

Without step 2 the export returns 403 "You do not have access to this character" (`connect-raw.ts:94-110`). Reference for the grant shape and logic: AMBA `src/shared/wanderersGuideExport/apiClientGrant.ts` (reference only; the module does not write grants).

### 2.2 Storing the key in Foundry

- `game.settings.register(MODULE_ID, "apiKey", { scope: "client", config: true, type: String })`.
- **Client scope only**, never `world`. Client settings live in that browser's local storage and are not synced to the world or other users.
- The settings field is a password-type input. The key is never logged, never put in chat, flags, journal entries, or error messages. Errors show only "API key rejected (401)".
- A "Test connection" button calls the export for a character id the user enters and reports success or the status code.
- Optional setting `baseUrl` (client scope), default `https://wgui.wandersguide.site`. The functions URL is `${baseUrl}/functions/v1/wgui-export-character` (confirm the path in pre-build check P2).

### 2.3 Not supported

- **GM-direct export.** A GM can't export a player's PC with the GM's own key. The key route only works when the character carries a grant for that key's client (`connect-raw.ts:97-101`). The MCP tool's GM path (`tactics-mcp/src/supabase-reader.ts:1054-1062`) is server-side only. A GM who wants a player's PC needs the player to grant the GM's API client on that character, or the player runs the import.
- OAuth, JWT, username/password.

## 3. Pre-build checks (do before coding; do not run against prod as part of planning)

- **P1. Issuer concern.** `connect-raw.ts:37` signs the per-request user JWT with `iss: https://fdrjqcyjklatdrmjdnys.supabase.co/auth/v1` (upstream's project), using `SB_JWT_SECRET`/`JWT_SECRET`. Confirm that an API-key export against wgui.wandersguide.site returns 200 with JSON v4. If it fails with an auth error, the server fix is to derive `iss` from `SUPABASE_URL` (a server change, outside this module).
- **P2.** Confirm the public functions URL and whether an `apikey` (anon) header is required at the gateway when only an API key bearer is sent.
- **P3.** Confirm CORS from a real Foundry origin (e.g. `http://localhost:30000` and a hosted Forge/self-hosted origin) with a preflight.
- **P4.** Read the rate-limit numbers for the API-key bucket (`_shared/rate-limit.ts`, `bucketFor`).
- **P5.** Capture one real v4 export (from a test character) for fixtures; scrub personal notes before committing it.

## 4. Endpoint

```
POST {baseUrl}/functions/v1/wgui-export-character
Authorization: Bearer <WG API key>
Content-Type: application/json

{ "id": <number>, "format": "json" }
```

- `id` must be a number (`wgui-export-character/index.ts:101-103`), `format` must be `json` or `pdf` (104-106). The module only uses `json`.
- 200: the JSON v4 object built by `buildJsonV4Object` (`index.ts:118-123`; version constant `src/process/export/export-to-json.ts:5`). This is the same object the MCP `export_character` tool returns inside `{ format: "json", file }` (`supabase-reader.ts:1086-1088`).
- Errors use JSend: `{ status: "fail", data: { message, code? } }`. Map: 400 bad id/format, 401 invalid key, 403 no grant, 429 rate limit, 5xx server.
- The module validates the response (version 4, expected top-level keys) before touching any actor.

### 4.1 CORS

`_shared/cors.ts` sends `Access-Control-Allow-Origin: *` and allows `authorization, x-client-info, apikey, content-type`. OPTIONS is answered (`connect-raw.ts:142-144`) and all responses carry the headers. A browser `fetch` from the Foundry host is expected to work (verify in P3).

### 4.2 Rate limits and load

- Each call loads all content tables for the character's enabled sources (`index.ts:27-83`) and builds are serialized server-side (`index.ts:116`). Calls are slow.
- The module imports **one PC at a time**, never in parallel.
- On 429: read the rate-limit headers / "Try again in Ns" message, wait, retry up to 3 times with backoff, then stop and report.
- Show a progress notification per character.

## 4A. Import flow: pick from a list first

1. User clicks "Import from Wanderer's Guide". The module calls a **lightweight list** (below) and shows a table: checkbox, name, level, ancestry, class, WG id, and "already in world" (an actor with the same `wgId` + host exists).
2. Select all / one / several. Only granted characters are importable; others are hidden or greyed with "grant this API client in WG".
3. "Import selected" runs the full export (section 4) **one character at a time** for the checked rows only, then the dry-run diff (section 8) per character.

### 4A.1 Listing characters with an API key: finding

- There is **no list endpoint that returns "characters granted to this key"** today.
- `find-character` (`wanderers-guide/supabase/functions/find-character/index.ts:6-42`) uses `connect(..., { supportsCharacterAPI: true })`. With an API key and **no numeric `id`**, `handleApiRouting` (`_shared/helpers.ts:248-263`) skips the grant check and runs as the **key owner** (`publicUser.user_id`). The RLS-scoped query (`find-character/index.ts:23-27`, filters with undefined values are ignored) then returns every character the key owner can see: their own PCs plus PCs in campaigns they GM.
- So `POST find-character {}` with the key works as a list, but:
  - it returns **full character rows** (heavy: `details`, `operation_data`, inventory, notes), not names and ids;
  - it is **not filtered by grant**, so it lists characters the export will reject with 403 (`connect-raw.ts:94-110`);
  - the module doesn't know its own `apiClient.id`, so it can't filter grants itself reliably;
  - GM'd campaign PCs appear but are not exportable with this key.
- **v1 (no server change):** call `find-character {}` once, keep only `id, name, level, details.ancestry/class names, details.api_clients`, discard the rest in memory, and mark rows whose `details.api_clients.client_access` is empty as "not granted". Rows still may 403 on export; handle it per row.
- **Proposed minimal server addition (recommended):** a new edge function `list-api-characters` (or an option `{ summary: true }` on `find-character`) that, for an API-key caller only, uses the existing `handleApiRouting` client lookup and returns
  `[{ id, name, level, ancestry, class, campaign_id }]` for characters whose `details.api_clients.client_access` contains `{ clientId: apiClient.id, publicUserId: publicUser.id }`. Same CORS, same rate limit, read-only, no new auth path. Roughly 40 lines in the backend; it is a server change in `D:\repos\wanderers-guide`, outside this module.
## 5. Actor creation (PF2e)

- Create `Actor` of type `character` with name, level, portrait (if a URL is present and allowed), and the details the PF2e data model accepts (age, deity, languages, notes).
- Add ancestry, heritage, background and class items first, in that order, so PF2e builds the actor correctly; then feats by slot/level, then spells and spellcasting entries, then inventory.
- Attribute boosts, skill and lore proficiencies and HP are applied through the ABC items' selections (section 7), not by writing derived values.
- Everything runs in a staged plan (section 8) that is applied only after the user confirms.
- Values come from the WG export, not from PF2e's derivation (section 7).

## 6. Compendium matching

Order: **slug -> exact name -> name + level/type**. Search only the PF2e system packs plus any packs the user ticks in settings.

- Normalize names (case, punctuation, "(Remastered)" suffixes) and build `system.slug` with PF2e's sluggify rules.
- Keep a legacy/remaster alias table (e.g. renamed spells, ancestries and feats). Prefer remaster items unless the export's source is legacy-only.
- Ancestry vs versatile heritage, class archetype vs archetype dedication feat: match on item type as well as name.
- **Gear:** split composed names into base item + runes + material (reuse AMBA `composedItemName.ts` as reference). Set `system.runes` (potency, striking/resilient, property runes) and `system.material` on the base compendium item instead of looking for a "+1 Striking Longsword" item.
- **Spells:** match the base spell, then set the cast rank/heightening on the spellcasting entry slot. Focus spells go in a focus entry; innate spells in an innate entry; signature spells flagged on spontaneous entries; cantrips and rituals handled separately.
- Every unmatched entry goes into a **miss report** (journal entry or dialog, no secrets) listing WG name, type, and what happened (created as homebrew, skipped).

## 7. Choices: Wanderer's Guide is the source of truth

The module does **not** rely on Foundry ChoiceSet prompts or PF2e's own derivation to decide the build. It forces the actor into WG's shape.

### 7.1 Pattern (from AMBA)

AMBA's WG export does the same thing in the other direction: instead of letting WG's builder ask questions, it writes the result directly.
- `AdventureMakerByAct/src/shared/wanderersGuideExport/buildCharacter.ts:35-38,91,106,124,190` builds explicit `custom_operations` (`giveAbilityBlockOperation` for heritage and each feat) and sets `operation_data.selections` itself, so WG shows exactly what AMBA decided.
- `.../assignSheetFeatLevels.ts`, `classDefaultSkills.ts`, `contentResolver.ts`, `composedItemName.ts` resolve names and levels deterministically before writing.
- The `foundry/wg-parity-export` work (merged; e.g. `3d5d0c8` shared name+level scorer `wanderersGuideExport/encounterExport/scoreNameLevel`, `690efc9` pack indexing with level, `c220837` pack lookup) is the matching side we reuse.
- The Foundry module mirrors this: decide everything from the export, then write it.

### 7.2 Forcing the shape

- **Pre-answer every ChoiceSet**: before adding an item, read its `system.rules` ChoiceSets and set `flags.pf2e.rulesSelections.<flag>` from the export (boosts, skill trainings, deity, weapon group, feat picks). Items are created with selections already present, so PF2e does not prompt.
- **Suppress prompts**: create items with `{ render: false }` and pass PF2e's options to skip choice dialogs where available; any ChoiceSet still unresolved gets a forced value from the export or, if WG has none, is listed in the parity report (never left to a prompt mid-import).
- **GrantItem**: let the class/ancestry grant its features, then reconcile: remove granted items WG does not have, add WG features PF2e did not grant, and set selections on granted items.
- **Override derived values where needed**: attribute boosts set directly in `system.build.attributes` (manual mode if PF2e's boost flow can't express WG's), skill/lore/perception/save ranks set from WG proficiencies, max HP adjusted with a flagged HP modifier effect if PF2e's computed value differs, languages, senses, speeds, focus points and spell slots from WG.
- Every override is tagged `flags.wanderers-guide-import.forced = true` so re-imports can rewrite it and users can see what was forced.

### 7.3 Iterate to parity

After each import, a **parity check** compares the finished actor to the WG v4 export and reports differences:
- level, ancestry/heritage/background/class, attributes, HP, AC, perception, saves, skill ranks and modifiers, class DC, spell DC/attack, speeds, languages;
- feats by slot and level, class features, spells per entry and rank, focus points, inventory (with runes/materials), currency.

Output: a parity report (dialog + private journal entry) with match / mismatch / missing for each field. The import is "clean" when the report has no mismatches. Mismatches feed the next fix (alias table, override rule, mapping), same loop as AMBA's WG parity work. Parity results are also asserted in fixture tests (section 13).
## 8. Idempotent updates

- Actor flags: `flags.wanderers-guide-import.wgId` (number) and `flags.wanderers-guide-import.host` (base URL). A new import finds an actor by both.
- Item flags: `flags.wanderers-guide-import.wgContentId` (and content type). Updates match items by this flag, never by name.
- **Dry-run diff** first: show adds, updates and removals; the user confirms before anything is written.
- **Preserve Foundry-only state** by default: current HP/temp HP, conditions and effects, hero points, resources and spell slots used, actor ownership, token settings, and items without our flag. An "overwrite everything" option exists but is off by default.
- Removals only touch items carrying our flag.

## 9. Homebrew world items

- Content with no compendium match is created as a world item in a folder `Wanderer's Guide / <content source name>`.
- Each one carries `wgContentId`. Re-imports reuse or update it; no duplicates.
- Validate against the PF2e data model before creating; skip and report items that fail validation.

## 10. Ownership and privacy

- New actors: the importing user gets Owner; the GM keeps Owner; everyone else None by default.
- The export can include personal notes and details. Import notes into the actor's private notes only, never into a shared journal.
- The API key never leaves the client setting (see 2.2).

## 11. Versions

`module.json` pins compatibility:

```json
"compatibility": { "minimum": "12", "verified": "13" },
"relationships": { "systems": [ { "id": "pf2e", "compatibility": { "minimum": "6.0.0", "verified": "<tested PF2e version>" } } ] }
```

Exact verified versions are filled in from the test world. Slug/alias tables are tied to the verified PF2e version.

## 12. File layout

```
module.json
src/
  main.ts              hooks, settings, sidebar button
  settings.ts          client-scoped apiKey, baseUrl, packs
  api/client.ts        POST export, error mapping, 429 backoff
  api/v4.ts            v4 type guards and validation
  match/compendium.ts  slug -> name -> name+level, alias table
  match/items.ts       runes, materials, composed names
  match/spells.ts      entries, heightening, focus, innate
  build/actor.ts       staged actor plan
  build/choices.ts     ChoiceSet / GrantItem selections
  build/homebrew.ts    world items and folders
  sync/diff.ts         dry-run diff, preserve rules
  api/list.ts          character list (find-character v1 / list-api-characters)
  build/force.ts       forced overrides (attributes, ranks, HP)
  sync/parity.ts       parity check vs v4 export
  ui/ImportDialog.ts   selectable PC table, progress, confirm
  ui/ParityReport.ts
  ui/MissReport.ts
lang/en.json
templates/*.hbs
test/fixtures/*.json   scrubbed real v4 exports
test/*.test.ts
docs/PLAN.md
```

## 13. Tests

- Fixtures: scrubbed real v4 exports covering a martial, a full caster, a focus caster, an archetype character, rune/material gear, and homebrew.
- Parity: each fixture must import with zero parity mismatches (or a documented known gap).
- Unit tests (Vitest) for list parsing and grant marking, v4 validation, name normalization and aliasing, rune parsing, spell entry building, ChoiceSet mapping, diff and preserve rules, error and 429 handling (mocked fetch).
- Manual checklist in a pinned Foundry + PF2e test world: first import, re-import with no changes (empty diff), re-import after a WG change, 403 without grant, 401 bad key.

## 14. Milestones

1. Pre-build checks P1-P5, plus P6: confirm `find-character {}` with an API key on wgui.wandersguide.site returns the key owner's characters (list v1).
2. Module skeleton, settings, API client, test connection.
3. Selectable PC list (v1 via `find-character`), multi-select, one-at-a-time export loop.
4. v4 validation and fixtures.
5. ABC items and actor creation with forced selections (no prompts).
6. Feats, gear (runes/materials), spells; forced overrides.
7. Parity check and report; iterate on fixtures until clean.
8. Homebrew world items and miss report.
9. Flags, dry-run diff, updates with preserve rules.
10. Optional server: `list-api-characters` (grant-filtered, summary only), then switch the list to it.
11. Ownership, docs, version pinning, release packaging.
## 15. Open questions

1. Does the API-key path work against wgui.wandersguide.site given the hard-coded issuer (P1)? If not, who fixes `connect-raw.ts:37`?
2. Add the `list-api-characters` server function (grant-filtered, names/ids only), or live with `find-character {}` (heavy, not grant-filtered)?
3. Default to remaster or legacy items when both match?
4. Should removed WG items be deleted from the actor or only flagged?
5. Which Foundry (12/13) and PF2e versions to verify against?
6. Should GMs be able to bulk-import a campaign's PCs later (would need each player's grant)?
7. When PF2e cannot express a WG value (e.g. a boost pattern or a homebrew feature effect), is a flagged override effect acceptable, or should it only be reported?
8. Which parity fields are must-match for "clean" vs informational?
9. Where does the WG UI show API client creation and the per-character grant on the WGUI fork? Confirm wording for the user guide.

