# AMBA Foundry Suite

A bundle module with no code, styles or settings. Its `module.json` lists the AMBA Foundry modules under `relationships.requires`, so installing it from Foundry's Setup screen installs all of them:

| Module id | Manifest |
|---|---|
| `amba-bridge` | https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/amba-bridge.json |
| `foundry-pf2-import` | https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/foundry-pf2-import.json |
| `foundry-wanderersguide-import` | https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/module.json |
| `green-fvtt` | https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/green-fvtt.json |
| `sheet-theme-green` | https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/sheet-theme-green.json |
| `blue-fvtt` | https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/blue-fvtt.json |
| `sheet-theme-dark-blue` | https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/sheet-theme-dark-blue.json |

Install: Foundry Setup -> Add-on Modules -> Install Module -> Manifest URL:

```
https://raw.githubusercontent.com/edmund-landgraf/foundry-wanderersguide-import/main/manifests/amba-foundry-suite.json
```

Then enable the modules you want in each world. Compatibility is the strictest of the bundled modules: Foundry v14, PF2e 8.6.1+ (from AMBA Bridge).

Release with `tools/release-module.ps1 -SourceDir modules\amba-foundry-suite -ModuleId amba-foundry-suite -Include 'module.json','README.md'` (publish the release before merging the hosted manifest).
