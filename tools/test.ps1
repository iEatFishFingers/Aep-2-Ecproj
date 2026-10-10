<#
.SYNOPSIS
  Tests the import dialog against the installed EffectCraft: nothing to build or install.

.DESCRIPTION
  Joins the scripts as tools\install.ps1 does (from this repo, so your edits are what runs),
  starts EffectCraft with the control channel and a settings folder of its own (your settings,
  scripts and auto-saves aren't touched), and drives "Import from After Effects" like a user:
  the export is given instead of picked, Import is clicked, the progress is followed, then the
  report is read and Verify run. It prints what each export gave and exits 1 if one failed.

  Edit effectcraft\*.jsx or ae\AE2EC_Export.jsx, run this, read the result. Run
  tools\install.ps1 when you want the change in your own EffectCraft.

.PARAMETER Json
  Exports to import, one after another. Default: tests\fixtures\effectcraft-fixture.ae2ec.json.

.PARAMETER Exe
  EffectCraft to test. Default: the installed one.

.PARAMETER Save
  Folder to save each imported project in (<export name>.ecproj), to open it afterwards.

.PARAMETER NoVerify
  Skip Verify (it compares every property with the export, which takes a few seconds).

.PARAMETER Keep
  Leave EffectCraft open when done, with the last import in it.

.EXAMPLE
  .\tools\test.ps1
.EXAMPLE
  .\tools\test.ps1 -Json "C:\Users\Yohan\Documents\Editing\nemzzz prince of the scene\prince of the scene .ae2ec.json" -Keep
#>
[CmdletBinding()]
param(
    [string[]]$Json = @(),
    [string]$Exe = (Join-Path $env:ProgramFiles 'EffectCraft\effectcraft.exe'),
    [int]$Port = 9890,
    [string]$Save,
    [switch]$NoVerify,
    [switch]$Keep
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $Json.Count) { $Json = @(Join-Path $repo 'tests\fixtures\effectcraft-fixture.ae2ec.json') }
if (-not (Test-Path -LiteralPath $Exe)) { throw "EffectCraft not found at '$Exe'. Pass -Exe." }

# ---- the dialog, built from this repo's scripts
$bundlePath = Join-Path $repo 'tests\build\Import from After Effects.jsx'
& (Join-Path $PSScriptRoot 'build-script.ps1') -Dialog -Out $bundlePath | Out-Null
$bundle = [IO.File]::ReadAllText($bundlePath)

# ---- EffectCraft with a settings folder of its own
$config = Join-Path $env:TEMP "ae2ec-test-$Port"
Remove-Item -Recurse -Force $config -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $config | Out-Null
$env:EFFECTCRAFT_CONFIG_DIR = $config
$app = Start-Process -FilePath $Exe -ArgumentList '--control', "$Port" -PassThru
$env:EFFECTCRAFT_CONFIG_DIR = $null

$deadline = (Get-Date).AddSeconds(90)
while ($true) {
    try { $tcp = New-Object Net.Sockets.TcpClient; $tcp.Connect('127.0.0.1', $Port); break }
    catch { if ((Get-Date) -gt $deadline) { throw "EffectCraft didn't open its control port $Port" }; Start-Sleep -Milliseconds 500 }
}
$reader = New-Object IO.StreamReader($tcp.GetStream())
$writer = New-Object IO.StreamWriter($tcp.GetStream())
$writer.AutoFlush = $true
$script:id = 0

function Call([string]$command, $params = @{}) {
    $script:id++
    $writer.WriteLine((@{ id = $script:id; method = 'engine.execute'; params = @{ command = $command; params = $params } } | ConvertTo-Json -Depth 10 -Compress))
    $r = $reader.ReadLine() | ConvertFrom-Json
    if ($r.error) { throw "$command failed: $($r.error | ConvertTo-Json -Compress)" }
    $r.result
}

# Texts of a script window's controls, by name.
function Controls($window) {
    $out = @{}
    $stack = New-Object System.Collections.Stack
    $stack.Push((Call 'scriptui.get' @{ window = $window }).root)
    while ($stack.Count) {
        $w = $stack.Pop()
        if ($w.name) { $out[$w.name] = $w }
        foreach ($c in $w.children) { $stack.Push($c) }
    }
    $out
}

function WaitForDialog([int]$seconds) {
    $until = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $until) {
        $d = @(Call 'scriptui.list') | Where-Object { $_.kind -eq 'dialog' } | Select-Object -First 1
        if ($d) { return $d }
        Start-Sleep -Milliseconds 250
    }
    throw "no dialog after $seconds s"
}

Start-Sleep -Seconds 2
Call 'prefs.set' @{ key = 'scripting.allowScriptsWriteFiles'; value = $true } | Out-Null
$failed = 0
try {
    foreach ($export in $Json) {
        $path = (Resolve-Path -LiteralPath $export).Path
        Write-Host ''
        Write-Host "== $path" -ForegroundColor Cyan
        Call 'file.newProject' | Out-Null
        $code = 'var AE2EC_JSON_PATH = ' + ($path | ConvertTo-Json) + ";`n" + $bundle
        Call 'script.run' @{ code = $code; name = 'Import from After Effects.jsx' } | Out-Null
        $options = WaitForDialog 30
        $c = Controls $options.window
        Write-Host "   $($c.project.text)"
        Write-Host "   $($c.counts.text)"

        $clock = [Diagnostics.Stopwatch]::StartNew()
        Call 'scriptui.click' @{ window = $options.window; widget = 'ok' } | Out-Null
        $report = WaitForDialog 1800
        $c = Controls $report.window
        Write-Host ("   {0}  ({1:N1} s in the app)" -f $c.summary.text, $clock.Elapsed.TotalSeconds) -ForegroundColor Green
        foreach ($line in @($c.issues.items) | Select-Object -First 30) { Write-Host "   - $line" }
        if (-not $c.summary.text.StartsWith('Imported ')) { $failed++ }

        if (-not $NoVerify) {
            Call 'scriptui.click' @{ window = $report.window; widget = 'verify' } | Out-Null
            Write-Host "   $((Controls $report.window).status.text)" -ForegroundColor Yellow
        }
        Call 'scriptui.click' @{ window = $report.window; widget = 'ok' } | Out-Null
        if ($Save) {
            New-Item -ItemType Directory -Force $Save | Out-Null
            $out = Join-Path $Save (([IO.Path]::GetFileName($path) -replace '\.ae2ec\.json$', '').Trim() + '.ecproj')
            Call 'file.saveAs' @{ path = $out } | Out-Null
            Write-Host "   saved $out"
        }
    }
} finally {
    if (-not $Keep) {
        $script:id++
        $writer.WriteLine((@{ id = $script:id; method = 'app.quit'; params = @{ force = $true } } | ConvertTo-Json -Compress))
        Start-Sleep -Seconds 1
        Remove-Item -Recurse -Force $config -ErrorAction SilentlyContinue
    }
    $tcp.Close()
}
if ($failed) { exit 1 }
