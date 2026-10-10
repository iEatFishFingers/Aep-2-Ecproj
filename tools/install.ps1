<#
.SYNOPSIS
  Installs "Import from After Effects" in EffectCraft.

.DESCRIPTION
  Builds the import dialog (effectcraft\AE2EC_ImportDialog.jsx joined with the importer, relink
  and verify scripts, see build-script.ps1 -Dialog) and puts it in EffectCraft's Scripts folder,
  where File > Import > After Effects Project (.ae2ec.json)... and File > Scripts find it.

  Run it again after changing any of those scripts or the export format. EffectCraft picks the
  new version up the next time the menu item is used; it doesn't need restarting.

.PARAMETER ConfigDir
  EffectCraft's settings folder. Default: $env:EFFECTCRAFT_CONFIG_DIR, else %APPDATA%\EffectCraft.

.EXAMPLE
  .\tools\install.ps1
#>
[CmdletBinding()]
param([string]$ConfigDir)

$ErrorActionPreference = 'Stop'
if (-not $ConfigDir) { $ConfigDir = if ($env:EFFECTCRAFT_CONFIG_DIR) { $env:EFFECTCRAFT_CONFIG_DIR } else { Join-Path $env:APPDATA 'EffectCraft' } }
$target = Join-Path $ConfigDir 'Scripts\Import from After Effects.jsx'
& (Join-Path $PSScriptRoot 'build-script.ps1') -Dialog -Out $target | Out-Null
Write-Host "Installed $target" -ForegroundColor Green
Write-Host 'In EffectCraft: File > Import > After Effects Project (.ae2ec.json)...'
