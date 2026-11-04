<#
.SYNOPSIS
  Builds a Foundry module release zip (module.json at the zip root) and, with -Publish,
  creates a GitHub release in the public host repo and refreshes manifests/<id>.json.

.DESCRIPTION
  Default is a dry run: validates module.json, builds the zip and a preview of the hosted
  manifest into -OutDir, verifies the zip layout, and prints the publish plan. Nothing is
  uploaded and no repo file is changed.

  Release layout (host repo, default edmund-landgraf/foundry-wanderersguide-import):
    tag       <id>-v<version>
    assets    module.zip, module.json
    manifest  https://raw.githubusercontent.com/<host>/main/manifests/<id>.json
    download  https://github.com/<host>/releases/download/<id>-v<version>/module.zip

.EXAMPLE
  .\tools\release-module.ps1 -SourceDir D:\repos\AdventureMakerByAct\foundry\amba-bridge -ModuleId amba-bridge
.EXAMPLE
  .\tools\release-module.ps1 -SourceDir D:\repos\AdventureMakerByAct\foundry\amba-bridge -ModuleId amba-bridge -Publish
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $SourceDir,
  [Parameter(Mandatory)] [string] $ModuleId,
  [string] $HostRepo = 'edmund-landgraf/foundry-wanderersguide-import',
  [string] $OutDir = 'D:\temp\module-releases',
  [string[]] $Include = @('module.json', 'LICENSE*', 'scripts/', 'styles/', 'lang/', 'templates/', 'packs/', 'assets/', 'icons/', 'images/'),
  [switch] $Publish
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$utf8 = New-Object System.Text.UTF8Encoding $false
$hostRoot = Split-Path -Parent $PSScriptRoot
$excludeDirs = @('.git', 'node_modules', 'test', 'tests', '.github', '.vscode', 'coverage')

$SourceDir = (Resolve-Path $SourceDir).Path
$mjPath = Join-Path $SourceDir 'module.json'
if (-not (Test-Path $mjPath)) { throw "No module.json in $SourceDir" }
$mj = [IO.File]::ReadAllText($mjPath) | ConvertFrom-Json

# --- validate ---
$tag = "$ModuleId-v$($mj.version)"
$expManifest = "https://raw.githubusercontent.com/$HostRepo/main/manifests/$ModuleId.json"
$expDownload = "https://github.com/$HostRepo/releases/download/$tag/module.zip"
$problems = @()
if ($mj.id -ne $ModuleId) { $problems += "id is '$($mj.id)', expected '$ModuleId'" }
if ($mj.version -notmatch '^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$') { $problems += "version '$($mj.version)' is not semver" }
if ($mj.manifest -ne $expManifest) { $problems += "manifest is '$($mj.manifest)', expected '$expManifest'" }
if ($mj.download -ne $expDownload) { $problems += "download is '$($mj.download)', expected '$expDownload'" }
if ($problems) {
  $problems | ForEach-Object { Write-Warning $_ }
  if ($Publish) { throw 'module.json is not consistent; fix it in the module source before publishing.' }
}

# --- collect files (tracked files only when the source is in git) ---
$files = $null
$gitTop = (& git -C $SourceDir rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -eq 0 -and $gitTop) {
  $files = & git -C $SourceDir ls-files --cached --others --exclude-standard -- . | ForEach-Object { $_ -replace '\\', '/' }
  $dirty = & git -C $SourceDir status --porcelain -- .
  if ($dirty) {
    Write-Warning "Uncommitted changes in $SourceDir are included in the zip:"; $dirty | ForEach-Object { Write-Warning "  $_" }
    if ($Publish) { throw 'Commit or stash changes in the module folder before publishing.' }
  }
} else {
  Write-Warning "$SourceDir is not in git; zipping every file."
  $files = Get-ChildItem $SourceDir -Recurse -File | ForEach-Object { $_.FullName.Substring($SourceDir.Length + 1) -replace '\\', '/' }
}
$files = $files | Where-Object {
  $parts = $_ -split '/'
  -not ($parts[0..($parts.Count - 2)] | Where-Object { $excludeDirs -contains $_ }) -and $_ -notmatch '\.zip$'
} | Where-Object {
  $f = $_
  $Include | Where-Object { if ($_.EndsWith('/')) { $f.StartsWith($_) } else { $f -like $_ } }
} | Sort-Object -Unique

# --- public-release hygiene scan (the host repo is public) ---
$block = '(?i)\bvps-[a-z0-9]+|\bssh\s+[a-z0-9.-]+|\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b)\d{1,3}(\.\d{1,3}){3}\b|postgres(ql)?://|-----BEGIN [A-Z ]*PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}'
$warn = '(?i)unwhelm'
$hits = @(); $warns = @()
foreach ($f in $files) {
  $full = Join-Path $SourceDir $f
  if ($f -match '\.(png|jpe?g|webp|gif|svg|ogg|mp3|woff2?|ttf|db|ldb)$') { continue }
  $hits += Select-String -Path $full -Pattern $block | ForEach-Object { "${f}:$($_.LineNumber): $($_.Matches[0].Value)" }
  $warns += Select-String -Path $full -Pattern $warn | ForEach-Object { "${f}:$($_.LineNumber)" }
}
if ($warns) { Write-Warning "$($warns.Count) line(s) mention 'Unwhelm' (project-name rule; review before publishing):"; $warns | Select-Object -First 10 | ForEach-Object { Write-Warning "  $_" } }
if ($hits) {
  Write-Warning 'Possible internal hosts or secrets in files that would be published:'; $hits | ForEach-Object { Write-Warning "  $_" }
  if ($Publish) { throw 'Hygiene scan failed; the release would be public.' }
}

# --- build zip ---
$outRoot = Join-Path $OutDir $tag
New-Item -ItemType Directory -Force $outRoot | Out-Null
$zipPath = Join-Path $outRoot 'module.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath }
$zip = [IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($f in $files) {
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $SourceDir $f), $f, 'Optimal')
  }
} finally { $zip.Dispose() }
Copy-Item $mjPath (Join-Path $outRoot 'module.json') -Force

# --- verify zip layout ---
$z = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $root = $z.Entries | Where-Object FullName -eq 'module.json'
  if (-not $root) { throw 'module.json is not at the zip root.' }
  $r = New-Object IO.StreamReader($root.Open()); $zmj = $r.ReadToEnd() | ConvertFrom-Json; $r.Dispose()
  if ($zmj.id -ne $ModuleId -or $zmj.version -ne $mj.version) { throw 'module.json inside the zip does not match the source.' }
  $names = $z.Entries | ForEach-Object FullName
  $needed = @($zmj.esmodules) + @($zmj.scripts) + @($zmj.styles) + @($zmj.languages | ForEach-Object path) | Where-Object { $_ }
  $missing = $needed | Where-Object { $names -notcontains $_ }
  if ($missing) { throw "Files referenced by module.json are missing from the zip: $($missing -join ', ')" }
  $entryCount = $z.Entries.Count
} finally { $z.Dispose() }
$hash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()

# --- hosted manifest preview ---
$hosted = [IO.File]::ReadAllText($mjPath)
$previewPath = Join-Path $outRoot "$ModuleId.hosted.json"
[IO.File]::WriteAllText($previewPath, $hosted, $utf8)
$hostedTarget = Join-Path $hostRoot "manifests\$ModuleId.json"

Write-Host ''
Write-Host "Module    $ModuleId $($mj.version)"
Write-Host "Zip       $zipPath ($entryCount entries, sha256 $hash)"
Write-Host "Tag       $tag on $HostRepo"
Write-Host "Manifest  $expManifest"
Write-Host "Download  $expDownload"
Write-Host "Hosted    $hostedTarget <- copy of the source module.json"

if (-not $Publish) {
  Write-Host ''
  Write-Host 'Dry run: nothing uploaded, no repo file changed. Re-run with -Publish to:'
  Write-Host "  1. gh release create $tag module.zip module.json -R $HostRepo"
  Write-Host "  2. write manifests\$ModuleId.json in $hostRoot (commit and merge it to main yourself)"
  return
}

$ErrorActionPreference = 'Continue'; & gh release view $tag -R $HostRepo 2>&1 | Out-Null; $exists = ($LASTEXITCODE -eq 0); $ErrorActionPreference = 'Stop'
if ($exists) { throw "Release $tag already exists on $HostRepo; bump the version instead of overwriting." }
& gh release create $tag $zipPath (Join-Path $outRoot 'module.json') -R $HostRepo --title "$($mj.title) $($mj.version)" --notes "Foundry module $ModuleId $($mj.version). Manifest: $expManifest"
if ($LASTEXITCODE -ne 0) { throw 'gh release create failed.' }
[IO.File]::WriteAllText($hostedTarget, $hosted, $utf8)
Write-Host "Published $tag. Updated $hostedTarget; commit it and merge to main so Foundry sees the new version."