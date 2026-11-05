# Hosted update manifests

Each manifest here is the module.json of a module's latest release, with a `download` link to that release's `module.zip` in this repo. Foundry uses them to install and update: amba-bridge, foundry-pf2-import, green-fvtt, sheet-theme-green, blue-fvtt, sheet-theme-dark-blue and amba-foundry-suite (a code-free bundle that requires all the others plus foundry-wanderersguide-import).

Sources for green-fvtt, sheet-theme-green, blue-fvtt and sheet-theme-dark-blue live under `modules/` in this repo; the others live in their own (private) repos.

## Releasing a module (`tools/release-module.ps1`)

Release zips for these modules are attached to GitHub releases in **this** public repo, because some module sources live in private repos.

| | |
|---|---|
| Tag | `<module-id>-v<version>` |
| Assets | `module.zip` (module.json at the zip root) and `module.json` |
| `manifest` | `https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/<module-id>.json` |
| `download` | `https://github.com/edmund-landgraf/foundry-wanderersguide-import/releases/download/<module-id>-v<version>/module.zip` |

The module's own `module.json` (in its source repo) must already carry those `manifest` and `download` values.

```powershell
# Dry run (default): validates module.json, builds D:\temp\module-releases\<tag>\module.zip,
# checks the zip layout and the files module.json references, scans for internal hosts/secrets, prints the plan.
.\tools\release-module.ps1 -SourceDir <module folder> -ModuleId <module-id>

# Publish: same checks (any problem stops it), refuses an existing tag, creates the release,
# then writes manifests\<module-id>.json here. Commit that file and merge it to main.
.\tools\release-module.ps1 -SourceDir <module folder> -ModuleId <module-id> -Publish
```

Only runtime files go in the zip by default (`module.json`, `LICENSE*`, `scripts/`, `styles/`, `lang/`, `templates/`, `packs/`, `assets/`, `icons/`, `images/`); docs, tests and fixtures stay out. Override with `-Include`. Publish order: publish the release first, then merge the updated hosted manifest, so the `download` link exists before Foundry sees it.

### Sheet themes (CSS at the module root)

`sheet-theme-green` and `sheet-theme-dark-blue` keep their stylesheet at the module root, which the default `-Include` list does not cover. Release them from inside a PowerShell session (array arguments do not pass through `powershell -File`):

```powershell
& .\tools\release-module.ps1 -SourceDir modules\sheet-theme-dark-blue -ModuleId sheet-theme-dark-blue -Include 'module.json','*.css'
```
