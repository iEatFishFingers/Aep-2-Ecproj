<#
.SYNOPSIS
  Imports an ae2ec export (from AE2EC_Export.jsx) into EffectCraft.

.DESCRIPTION
  Builds a self-contained script (data + importer) with build-script.ps1, then runs it
  with effectcraft-cli:
    - default: headless, saves a new .ecproj next to the export
    - -Live:   into the EffectCraft window you have open (started with --control 9877)
  The importer's report is saved as <name>.import-report.json and summarised here.

.PARAMETER Json
  The .ae2ec.json file written by the After Effects exporter.

.PARAMETER Out
  .ecproj to write (headless mode). Default: same folder and name as the export.

.PARAMETER Live
  Import into the running app over the control port instead of writing a file.

.PARAMETER ApplyAll
  Also set values that After Effects reported as unmodified (slower, occasionally safer).

.PARAMETER PathMap
  Footage path remaps, "old prefix=>new prefix". Repeatable.
  e.g. -PathMap "D:\Footage=>E:\Archive\Footage"

.PARAMETER NoRootFolder
  Do not wrap the imported items in a "<project> (from AE)" folder.

.EXAMPLE
  .\tools\import.ps1 -Json "C:\...\nonmummy.ae2ec.json"
.EXAMPLE
  .\tools\import.ps1 -Json "C:\...\nonmummy.ae2ec.json" -Live
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Json,
    [string]$Out,
    [switch]$Live,
    [int]$Port = 9877,
    [switch]$ApplyAll,
    [string[]]$PathMap = @(),
    [switch]$NoRootFolder,
    [string]$Cli = (Join-Path $env:ProgramFiles 'EffectCraft\effectcraft-cli.exe'),
    [switch]$KeepScript
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

if (-not (Test-Path -LiteralPath $Cli)) { throw "effectcraft-cli.exe not found at '$Cli'. Install EffectCraft or pass -Cli." }
$jsonPath = (Resolve-Path -LiteralPath $Json).Path
$base = $jsonPath -replace '\.json$', '' -replace '\.ae2ec$', ''

# ---- options for the importer
$maps = @()
foreach ($m in $PathMap) {
    $parts = $m -split '=>', 2
    if ($parts.Count -ne 2) { throw "PathMap entries look like ""old=>new"", got: $m" }
    $maps += , @($parts[0].Trim(), $parts[1].Trim())
}
$opts = [ordered]@{
    applyAll   = [bool]$ApplyAll
    rootFolder = -not $NoRootFolder
    pathMap    = $maps
    openComp   = $true
}
$optsJson = ConvertTo-Json -InputObject $opts -Depth 5 -Compress
if ($maps.Count -eq 1) { $optsJson = $optsJson -replace '"pathMap":\[(".*?",".*?")\]', '"pathMap":[[$1]]' }   # PS 5.1 flattens a single pair

# ---- build the combined script
$script = "$base.ae2ec-import.jsx"
& (Join-Path $here 'build-script.ps1') -Json $jsonPath -OptionsJson $optsJson -Out $script | Out-Null

# ---- run it
if ($Live) {
    Write-Host "Importing into the open EffectCraft window (port $Port)..." -ForegroundColor Cyan
    $output = & $Cli script $script --bridge $Port 2>&1 | Out-String
} else {
    if (-not $Out) { $Out = "$base.ecproj" }
    Write-Host "Importing headless into $Out ..." -ForegroundColor Cyan
    $output = & $Cli script $script --save-as $Out 2>&1 | Out-String
}
$exit = $LASTEXITCODE

# ---- report
$report = $null
$m = [regex]::Match($output, 'AE2EC_REPORT_BEGIN\s*(\{.*?\})\s*AE2EC_REPORT_END', 'Singleline')
if ($m.Success) {
    $reportText = $m.Groups[1].Value
    $reportPath = "$base.import-report.json"
    [System.IO.File]::WriteAllText($reportPath, $reportText, (New-Object System.Text.UTF8Encoding($false)))
    $report = $reportText | ConvertFrom-Json
}

if (-not $report) {
    Write-Host $output
    throw "effectcraft-cli exited with code $exit and no import report. See the output above."
}

$c = $report.counts
Write-Host ''
Write-Host ("Comps {0}, layers {1}, effects {2}, masks {3}, properties {4}, keyframes {5}, expressions {6}" -f `
        $c.comps, $c.layers, $c.effects, $c.masks, $c.props, $c.keys, $c.expressions) -ForegroundColor Green
Write-Host ("Footage imported {0}, placeholders {1}" -f $c.footage, $c.placeholders)

function Show-Map($title, $map) {
    if (-not $map) { return }
    $props = @($map.PSObject.Properties)
    if ($props.Count -eq 0) { return }
    Write-Host ''
    Write-Host $title -ForegroundColor Yellow
    $props | Sort-Object Value -Descending | Select-Object -First 25 | ForEach-Object { Write-Host ("  {0,4}  {1}" -f $_.Value, $_.Name) }
    if ($props.Count -gt 25) { Write-Host "  ... and $($props.Count - 25) more (see the report)" }
}
if ($report.missingFootage -and $report.missingFootage.Count) {
    Write-Host ''
    Write-Host 'Missing footage (placeholders created):' -ForegroundColor Yellow
    $report.missingFootage | ForEach-Object { Write-Host "  $($_.name)  <-  $($_.file)" }
}
Show-Map 'Effects EffectCraft does not have:' $report.missingEffects
Show-Map 'Properties not found in EffectCraft:' $report.unsupported
Show-Map 'Values that could not be set:' $report.failedValues
Show-Map 'Effect data scripts cannot read (e.g. Curves) - redo by hand:' $report.customValues
if ($report.notes -and $report.notes.Count) {
    Write-Host ''
    Write-Host 'Notes:' -ForegroundColor Yellow
    $report.notes | Select-Object -First 30 | ForEach-Object { Write-Host "  $_" }
}
if ($report.error) { Write-Host ''; Write-Host "Error: $($report.error)" -ForegroundColor Red }

Write-Host ''
if ($Live) { Write-Host 'Done. The project is in your EffectCraft window (Ctrl+Z undoes the whole import).' }
else { Write-Host "Done. Open $Out in EffectCraft." }
Write-Host "Full report: $base.import-report.json"
if (-not $KeepScript) { Remove-Item -LiteralPath $script -ErrorAction SilentlyContinue }
if (-not $report.ok) { exit 1 }
