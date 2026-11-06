# AMBA Bridge releases

Module source and the step-by-step runbook live in the private Adventure Maker
repo at `foundry/amba-bridge/RELEASING.md`.

This public repo only hosts:

- `tools/release-module.ps1` — builds `module.zip` and (with `-Publish`) creates
  the GitHub release
- `manifests/amba-bridge.json` on `main` — Foundry update-check URL
- Releases tagged `amba-bridge-vX.Y.Z` with assets `module.zip` and `module.json`

Do not put secrets, private hostnames, or connection details in this repo.
