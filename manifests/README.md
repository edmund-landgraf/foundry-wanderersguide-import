# Hosted update manifests

These manifests are **update-check only**: they let Foundry see a module's latest version, but they have no `download` URL, so Foundry cannot install or update a module from them.

The previous `download` pointed at this repo's `main.zip`, which contains the Wanderer's Guide importer, not these modules. A `download` will be added back for each module once it has its own release zip, with that module's `module.json` at the zip root.