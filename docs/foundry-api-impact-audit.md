# Foundry API Impact Audit

Date: 2026-11-23  
Baseline: Foundry Virtual Tabletop v14.370 API documentation  
Repository scope: the Foundry/Wanderer's Guide/AMBA projects visible under `D:\repos\edmund-landgraf`

## Executive summary

The Foundry v14 API has a broad documented surface, but the projects in this workspace use a concentrated subset:

- Document CRUD and embedded-document APIs: Actor, Item, Folder, JournalEntry, Scene, Note, Playlist, Combat, Token, ActiveEffect, and related collections.
- Application and sheet APIs: legacy ApplicationV1 hooks and header buttons, ApplicationV2/DialogV2, FilePicker, application instances, and sheet rendering.
- World/runtime APIs: `game`, settings, users, actors, scenes, combats, playlists, `fromUuid`, notifications, chat messages, hooks, and canvas scene state.
- Integration contracts: Foundry source objects, PF2e system data, module flags, relay payloads, WGUI metadata, and AMBA publish payloads.

The highest-risk finding is compatibility between ApplicationV1 and ApplicationV2. The current Wanderer's Guide importer supports Foundry 12 through 14 and the PF2e actor sheet is still using the legacy ApplicationV1 header-button model. Sheet controls should therefore use the V1 header-button hook for this module rather than assuming `app.element` is an `HTMLElement` or mounting against render-hook HTML.

The AMBA bridge has the widest Foundry footprint. It uses document creation/update, embedded documents, journal pages, scene notes, actors, items, tokens, playlists, combat, canvas state, FilePicker, header controls, dialogs, chat, settings, and application instances.

## Audit method and limits

The Foundry v14 API index was used as the node inventory. It explicitly divides the API into Documents and Data, Canvas, User Interface, Dice, Audio/Video, Game Management, AV, and Interactivity. Each listed node was compared with source and documentation references found in the workspace.

The project scan excluded `node_modules`, `.git`, generated `db`, `dist`, and build output. Worktrees with the same module implementation are grouped rather than counted as separate products.

This is an impact audit, not a claim that every private implementation detail of Foundry was executed. Foundry itself distinguishes public, protected, private, and internal API. Private or internal members can change without the public-API compatibility guarantees. See the [Foundry API guidance](https://foundryvtt.com/api/index.html#reading-these-api-docs).

## Projects found in scope

| Product or project family | Runtime Foundry code | API impact | Notes |
|---|---:|---:|---|
| `foundry-wanderersguide-import` | Yes | High | Main WGUI importer, relay client, actor-sheet and directory UI |
| `wgi-relay-wt` | Yes | High | Worktree of the WGUI importer; keep aligned with the main module |
| `foundry-pf2-import` | Yes | High | PF2 import application, manifest, art/FilePicker, Actor updates |
| `AdventureMakerByAct/foundry/amba-bridge` | Yes | Very high | AMBA publisher and runtime bridge |
| `amba-relay-wt/foundry/amba-bridge` | Yes | Very high | AMBA bridge worktree |
| `AMBA-wt-grid`, `AMBA-wt-p1`, `AMBA-wt-p2`, `AMBA-wt-p3`, `AMBA-wt-p4`, `AMBA-wt-p5`, `AMBA-wt-publish-progress`, `AMBA-wt-resync` | Yes, via AMBA bridge | Very high | Worktrees or copies of the AMBA Foundry bridge and its export contract |
| `WandersGuideUI` | No direct Foundry runtime | Medium | Implements the relay/import protocol and PF2/WGUI data model; must agree with Foundry payload scrubs |
| `wanderers-guide` | No direct Foundry runtime detected | Low/medium | Shared WGUI/frontend content and import contract references |
| `PathfinderWeb` | No direct Foundry runtime detected | Low/medium | PF2 content/search references; no Foundry client API calls found |
| `TTRPGCombatSimulator` | No direct Foundry runtime detected | Low | Foundry/PF2 research documentation only |
| Other sibling repositories | No matching Foundry runtime detected | None observed | Re-scan if a project begins shipping a Foundry package |

## Complete v14 node inventory and workspace impact

The following is the documented node inventory from the v14 index, grouped by API area. “Used” means a runtime or contract dependency was found in the workspace. “No direct use” means no matching runtime use was found in the audited source; it does not mean the node is unusable.

### Documents and data

| Node family | Nodes | Impact |
|---|---|---|
| Document abstraction | `foundry.abstract.DataModel`, `foundry.abstract.Document`, `foundry.ClientDocument`, `foundry.CanvasDocument`, `foundry.abstract.TypeDataModel` | Indirect/high. All importer and publisher data moves through document sources and models. Avoid assumptions about PF2e subtype data outside the system contract. |
| Database operations | `foundry.abstract.DatabaseBackend`, `foundry.data.ClientDatabaseBackend` | Indirect. `create`, `update`, delete, and embedded-document writes depend on this layer; do not call private backend internals. |
| Collections | `DocumentCollection`, `WorldCollection`, `CompendiumCollection`, `EmbeddedCollection` | High. Used through `game.actors`, `game.scenes`, `game.playlists`, `game.combats`, actor items/effects, and compendium/world lookups. |
| Primary documents | Actor, Adventure, Cards, ChatMessage, Combat, FogExploration, Folder, Item, JournalEntry, Macro, Playlist, RollTable, Scene, Setting, User | High for Actor, Item, ChatMessage, Combat, Folder, JournalEntry, Playlist, Scene, Setting, and User. No meaningful use found for Adventures, Cards, FogExploration, Macro, or RollTable. |
| Embedded documents | ActiveEffect, AmbientLight, AmbientSound, Card, Combatant, CombatantGroup, Drawing, JournalEntryCategory, JournalEntryPage, Note, PlaylistSound, Region, RegionBehavior, TableResult, Tile, Token, Wall | High for ActiveEffect, Combatant, JournalEntryPage, Note, PlaylistSound, and Token. The rest are indirect through scene or document source handling. |

Important document findings:

- Items are embedded in Actors and are independently mutable; equipment, spells, effects, shield data, quantities, and item flags must not be treated as a flat Actor-only update.
- Active Effects are embedded under Actors or Items and are the natural Foundry representation for many status/effect changes.
- Journal pages are separate embedded documents. Foundry v14 behavior around creating pages during JournalEntry creation is already handled defensively in the AMBA publisher.
- Tokens are embedded in Scenes and may differ from the prototype Actor; any runtime synchronization must distinguish Actor state from Token state.

### Canvas

| Node family | Nodes | Impact |
|---|---|---|
| Canvas core | `Canvas`, `CanvasDocumentMixin`, `PlaceableObject`, `CanvasAnimation` | Medium for AMBA; none for the WGUI importer. AMBA reads the active scene and places notes/tokens. |
| Canvas groups | Effects, Environment, Hidden, Interface, Overlay, Primary, Rendered, Visibility groups | Low/indirect. No project subclasses these groups; scene placement relies on Foundry-managed layers. |
| Canvas layers | CanvasLayer, InteractionLayer, PlaceablesLayer, ControlsLayer, DrawingsLayer, GridLayer, LightingLayer, NotesLayer, RegionLayer, SoundsLayer, TilesLayer, TokenLayer, WallsLayer, weather/effect layers | Medium/indirect for AMBA. AMBA uses notes, tokens, scenes, and active canvas state, but does not own layer implementations. |
| Canvas objects | AmbientLight, AmbientSound, Drawing, Region, Tile, Token, Note, Wall | Medium for AMBA; Token and Note are directly relevant to publish placement. |
| HUD | DrawingHUD, TileHUD, TokenHUD | No direct use found. |

### User interface and applications

| Node family | Nodes | Impact |
|---|---|---|
| ApplicationV2 | `ApplicationV2`, `DialogV2`, `DocumentSheetV2`, `HandlebarsApplicationMixin` | High in `foundry-pf2-import`, current importer dialogs, and AMBA dialogs. ApplicationV2 was introduced in v12 and adopted broadly by core in v13, but packages may still expose V1 sheets. |
| ApplicationV1 | legacy Application, render hooks, header-button arrays | High in the WGUI importer and PF2e actor-sheet integration. `app.element` is jQuery in V1; do not treat it as an HTMLElement. |
| Document sheets | Actor/Item sheets, JournalEntry sheets, ActiveEffect configs, Scene/Token/Note configs | High for sheet and journal controls. Prefer documented hooks over DOM mutation when the target application exposes them. |
| Header controls | `getApplicationV1HeaderButtons`, `getHeaderControlsApplicationV2` | High. The WGUI sheet-button change should use the V1 header-button contract for current PF2e sheets; the AMBA journal control already uses a header-control hook. |
| Sidebar applications | Actor, Item, Scene, Journal, Playlist, Combat, Settings, Players directories | Medium/high. WGUI adds an Actor Directory import button; AMBA uses scene/sidebar-related hooks. |
| UX helpers | ContextMenu, DragDrop, Tabs, TextEditor | Medium. AMBA uses context-menu and note interactions; WGUI primarily uses DialogV2 and application instances. |
| FilePicker/ImagePopout | FilePicker, ImagePopout | High for `foundry-pf2-import` art/token workflows and AMBA media/token workflows. |

Application compatibility requirements:

1. V1 render hooks receive a pending jQuery inner document; V2 render hooks receive an HTMLElement and context/options.
2. V1 header buttons have `{ class, icon, label, onclick }`.
3. V2 header controls have `{ label, icon, action, ... }`; an external module cannot assume a direct `onclick` callback is accepted.
4. For an existing application, use hooks. Do not subclass or override a sheet merely to add a button.
5. A render hook may fire for a pending inner root while the application element is a different outer root. This is the root cause of the duplicate WGUI sheet button.

### Dice

| Node family | Nodes | Impact |
|---|---|---|
| Roll API | Roll, RollTerm, DiceTerm, FunctionTerm, NumericTerm, OperatorTerm, ParentheticalTerm, PoolTerm, StringTerm, Die, Coin, FateDie | Low direct impact. The WGUI UI has its own dice schemas/roller, but no Foundry Roll API dependency was found in the audited runtime modules. |

### Audio, video, game management, AV, and interactivity

| Node family | Nodes | Impact |
|---|---|---|
| Media | AudioHelper, Sound, ImageHelper, VideoHelper | Medium for AMBA media and token art; low for WGUI importer. |
| Game management | Game, GameTime | High. Settings, world ID, user role, collections, active scene, and readiness are central to every Foundry module. |
| AV | AVMaster, AVClient, SimplePeerAVClient | No direct use found. |
| Interactivity | Hooks, KeyboardManager, SocketInterface | Hooks are high impact across all Foundry modules. KeyboardManager and SocketInterface have no direct use detected in the audited runtime. |

## Project-by-project findings

### `foundry-wanderersguide-import`

Primary files:

- `scripts/main.js`
- `scripts/dialog.js`
- `scripts/foundry-read-relay.js`
- `scripts/importer.js`
- `scripts/campaign.js`
- `test/foundry-read-relay.test.mjs`
- `test/campaign-dialog.test.mjs`

Direct API dependencies:

- `Hooks.once` and `Hooks.on` for initialization, readiness, settings rendering, sheet rendering, directory rendering, and settings reload.
- `game.settings.register/get/set`, `game.user`, `game.world`, `game.actors`, `game.scenes`, and client settings storage.
- Actor and Item creation/update, document `toObject`, flags, embedded items/effects, folders, and ownership.
- `fromUuid` for PF2e document resolution.
- `foundry.applications.api.DialogV2` and `foundry.applications.instances`.
- `ui.notifications`, `ChatMessage.create`, and the browser `fetch`/localStorage APIs for the outbound relay.
- PF2e-specific `CONFIG.PF2E` data and actor/item system paths.

Required changes:

- Replace DOM-root mounting of sheet controls with a V1 header-button integration for the current PF2e sheet. The public V1 header-button type is documented as `{class, icon, label, onclick}`.
- Keep `DialogV2` optional because the module supports older Foundry versions.
- Keep relay serialization independent of Foundry's full source object and preserve only the agreed linkage flags.
- Treat `foundry.applications.instances` as V2-specific and retain the existing optional guard.
- Add tests for both V1 jQuery application shapes and the future V2 HTMLElement shape only if V2 support is intentionally added.

### `foundry-pf2-import`

Direct API dependencies include:

- ApplicationV2 and HandlebarsApplicationMixin in `ManifestApp` and `ImportApp`.
- Dialog/application rendering, settings, notifications, Actor collections, `toObject`, `update`, `fromUuid`, `CONFIG.PF2E`, and FilePicker.
- Actor-directory rendering and import/link workflows.

Required changes:

- Keep ApplicationV2 code on documented public methods and static configuration rather than private render internals.
- Test `ApplicationV2.render`, form/action behavior, and FilePicker fallback behavior against the supported Foundry range.
- Do not copy the WGUI importer’s V1 sheet strategy into this module; this module already has a V2 application surface.

### AMBA bridge family

Applies to `AdventureMakerByAct/foundry/amba-bridge` and the AMBA worktrees listed above.

Direct API dependencies include:

- Hooks, settings, readiness, GM checks, world ID, active scene, and application instances.
- `getHeaderControlsJournalEntrySheet`, journal render hooks, scene directory render hooks, note activation/context hooks, and combat create/delete hooks.
- Actor, Item, Folder, Scene, JournalEntry, JournalEntryPage, Note, Playlist, PlaylistSound, Combat, Combatant, and Token document CRUD.
- Embedded-document create/delete/update operations.
- `fromUuid`, compendium conversion, `toObject`, flags, folder lookup, and prototype token data.
- FilePicker upload, ImagePopout, image/video/media utilities, notifications, ChatMessage, and periodic playlist polling.
- Canvas active-scene access and note/token placement.
- DialogV2 with a legacy-safe fallback path.

Required changes:

- Keep all document writes idempotent and keyed by AMBA/WGUI flags; avoid replacing user-owned placement, notes, or folder data without an explicit merge rule.
- Keep JournalEntry page writes separate from JournalEntry creation for Foundry v14 behavior.
- Validate embedded-document IDs before delete/create operations.
- Treat `getHeaderControlsJournalEntrySheet` and other system-specific hooks as integration points that need smoke tests after Foundry or PF2e updates.
- Keep all media upload paths tolerant of FilePicker API differences and remote upload failures.

### `WandersGuideUI`, `wanderers-guide`, and `PathfinderWeb`

No direct Foundry client runtime was found in the primary application source. Their impact is contractual:

- Foundry actor/item/effect source shape.
- PF2e system data and item types.
- Relay request/response schemas.
- WGUI `meta_data.foundry` linkage.
- Import/export fields, collection replacement semantics, and host/world/actor identifiers.

The relay server is not the Foundry application API. It must nevertheless preserve the exact allowlist agreed with the Foundry module and must not infer a Foundry document API from arbitrary JSON.

### Documentation-only and worktree references

The AMBA worktrees, TTRPGCombatSimulator research files, and several shared WGUI/PF2e documents reference Foundry concepts without shipping independent Foundry runtime code. They need documentation updates when contracts change, but they should not receive separate API adapters.

## Highest-priority risks

| Priority | Risk | Affected projects | Action |
|---|---|---|---|
| P0 | Mixing V1 jQuery application roots with V2 HTMLElement assumptions | WGUI importer, PF2e sheets | Use `getApplicationV1HeaderButtons` for current PF2e sheet controls; keep V2 code separate |
| P0 | Relay scrub drops WGUI linkage flags | WGUI importer + WandersGuideUI | Test the final payload after both Foundry and server scrubs |
| P0 | Document writes replace columns or embedded data unintentionally | WGUI importer, AMBA bridge | Use explicit field/collection merges and idempotency keys |
| P1 | Application hooks change across PF2e sheet migrations | WGUI importer, AMBA bridge | Add versioned smoke tests and detect V1/V2 at runtime |
| P1 | Foundry source shape and PF2e system shape are conflated | All PF2e projects | Keep generic Foundry document code separate from `CONFIG.PF2E` and PF2e system paths |
| P1 | Worktree fixes diverge | WGUI/AMBA worktrees | Treat worktrees as release branches, not independent API implementations |
| P2 | Private/internal API use breaks on minor releases | All Foundry packages | Prefer public hooks, document methods, and documented application APIs |

## Recommended compatibility layer

Create a small shared pattern in each Foundry package rather than a shared runtime dependency:

```js
const getActorDocument = (app) => app?.actor ?? app?.document ?? null;

const isEditableCharacter = (app, user) => {
  const actor = getActorDocument(app);
  return actor?.type === "character"
    && (typeof actor.canUserModify !== "function" || actor.canUserModify(user, "update"));
};
```

For sheet controls, use a version-specific adapter:

- ApplicationV1: mutate the header-button array with `{class, icon, label, onclick}`.
- ApplicationV2: use the documented header-control hook only when the target application exposes a compatible action handler; otherwise attach behavior through the application’s render hook without assuming V1 jQuery.

Do not use private methods such as `_getHeaderButtons`, `_replaceHTML`, `_renderHeaderControl`, or `_onRender` from a module. Those are useful for understanding Foundry internals, but the public hook is the supported extension point.

## Proposed follow-up work

1. Implement the WGUI sheet-button change through the V1 header-button hook.
2. Add an explicit V1/V2 application-shape test fixture.
3. Add a relay contract test that runs both scrubs and asserts the final actor/item linkage.
4. Add a Foundry API smoke-test checklist for `foundry-pf2-import` and AMBA bridge release testing.
5. Re-run this audit whenever the module manifest, PF2e minimum version, or Foundry compatibility range changes.

## Sources

- [Foundry v14 API index](https://foundryvtt.com/api/index.html)
- [Foundry application guidance](https://foundryvtt.com/api/modules/foundry.applications.html)
- [Foundry v14 hook events](https://foundryvtt.com/api/modules/hookEvents.html)
- [ApplicationV1 render hook](https://foundryvtt.com/api/functions/hookEvents.renderApplicationV1.html)
- [ApplicationV2 render hook](https://foundryvtt.com/api/functions/hookEvents.renderApplicationV2.html)
- [ApplicationV1 header-button hook](https://foundryvtt.com/api/functions/hookEvents.getApplicationV1HeaderButtons.html)
- [ApplicationV1 header-button type](https://foundryvtt.com/api/types/foundry.ApplicationV1HeaderButton.html)
- [ApplicationV2 header-controls hook](https://foundryvtt.com/api/functions/hookEvents.getHeaderControlsApplicationV2.html)
- [ApplicationV2 class](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html)
- [Document-sheet guidance](https://foundryvtt.com/api/modules/foundry.applications.sheets.html)
- [PF2e creature sheet source showing the V1 header-button model](https://github.com/foundryvtt/pf2e/blob/v14-dev/src/module/actor/creature/sheet.ts)
