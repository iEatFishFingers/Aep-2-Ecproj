<#
.SYNOPSIS
  Installs "Import from After Effects" in EffectCraft.

.DESCRIPTION
  Builds the import dialog (effectcraft\AE2EC_ImportDialog.jsx joined with the importer, relink
  and verify scripts, see build-script.ps1 -Dialog) and puts it in EffectCraft's Scripts folder,
  as "Import Converted Project.jsx", where File > Import > Converted Project... and File > Scripts
  find it. An install from an older version ("Import from After Effects.jsx", which older
  EffectCraft builds run from File > Import) is updated too.

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
$target = Join-Path $ConfigDir 'Scripts\Import Converted Project.jsx'
& (Join-Path $PSScriptRoot 'build-script.ps1') -Dialog -Out $target | Out-Null
Write-Host "Installed $target" -ForegroundColor Green
$old = Join-Path $ConfigDir 'Scripts\Import from After Effects.jsx'
if (Test-Path -LiteralPath $old) {
    Copy-Item -LiteralPath $target -Destination $old -Force
    Write-Host "Updated the older install $old"
}
Write-Host 'In EffectCraft: File > Import > Converted Project...'
