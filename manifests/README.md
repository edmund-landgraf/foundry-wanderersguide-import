# Hosted update manifests

These manifests are **update-check only**: they let Foundry see a module's latest version, but they have no `download` URL, so Foundry cannot install or update a module from them.

The previous `download` pointed at this repo's `main.zip`, which contains the Wanderer's Guide importer, not these modules. A `download` will be added back for each module once it has its own release zip, with that module's `module.json` at the zip root.
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