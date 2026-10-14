# After Effects → EffectCraft project exporter (ae2ec)

This tool moves After Effects projects into [EffectCraft](https://getartcraft.com/apps/effectcraft). EffectCraft can't open `.aep` files, but After Effects can describe its own projects completely through its scripting API, and EffectCraft runs the same scripting model. So:

```
 After Effects                         JSON                          EffectCraft
 ┌──────────────────┐   AE2EC_Export.jsx   ┌────────────────────┐   AE2EC_Import.jsx   ┌──────────────┐
 │  nonmummy .aep   │ ───────────────────► │ nonmummy.ae2ec.json│ ───────────────────► │ .ecproj /    │
 │  (open in AE)    │                      │ (full description) │   tools\import.ps1   │ open window  │
 └──────────────────┘                      └────────────────────┘                      └──────────────┘
```

The export covers folders, footage (with interpretation settings), comps, every layer type, layer switches, parenting, track mattes, and the full property tree of every layer. That tree includes values, keyframes (interpolation, temporal ease, spatial tangents, roving), expressions, effects and their settings, masks, shape layer contents, text documents and animators, markers, and layer styles. The importer rebuilds all of it and writes a report listing anything EffectCraft couldn't recreate.

## Quick start

**1. Export from After Effects**

1. In After Effects, open **Edit ▸ Preferences ▸ Scripting & Expressions** and turn on **Allow Scripts to Write Files and Access Network**. You only need to do this once.
2. Open your project.
3. Go to **File ▸ Scripts ▸ Run Script File…** and choose `ae\AE2EC_Export.jsx`.
4. Keep the default options and save the file. By default it's saved next to the `.aep` as `<project>.ae2ec.json`. A progress window shows how far it has got, and a `.ae2ec.log` next to the export records each layer.

**2. Import into EffectCraft.** The easiest way is from EffectCraft's menu:

1. Once, and again after changing any of the scripts: `powershell -ExecutionPolicy Bypass -File tools\install.ps1`.
2. In EffectCraft, go to **File ▸ Import ▸ Converted Project…** (or **File ▸ Scripts ▸ Import Converted Project**), pick the export, check the options and click **Import**. The report opens when it's done, with **Relink Footage…**, **Verify** and **Save Report…**.

Or from PowerShell:

```powershell
# a new .ecproj next to the export (EffectCraft doesn't need to be open)
powershell -ExecutionPolicy Bypass -File tools\import.ps1 -Json "C:\path\project.ae2ec.json"

# straight into the EffectCraft window you have open (started with --control 9877)
powershell -ExecutionPolicy Bypass -File tools\import.ps1 -Json "C:\path\project.ae2ec.json" -Live
```

You can also double-click `tools\import.bat` and drop the JSON file onto the window, or ask Claude to import it over the EffectCraft MCP connection.

**3. Read the report.** The script prints a summary and saves `<project>.import-report.json`, which lists missing footage, effects EffectCraft doesn't have, and anything else that needs doing by hand.

## What's in the repo

| Path | What it is |
|---|---|
| `ae/AE2EC_Export.jsx` | The After Effects exporter. It's ExtendScript (ES3) with no dependencies. |
| `effectcraft/AE2EC_Import.jsx` | The EffectCraft importer, written against EffectCraft's AE-style scripting model. |
| `effectcraft/AE2EC_ImportDialog.jsx` | EffectCraft's **Import from After Effects** dialog: pick the export, choose options, import, then read the report, relink, verify and save the report. `tools\install.ps1` joins it with the importer, relink and verify scripts and installs it. |
| `effectcraft/AE2EC_Relink.jsx` | Run it in EffectCraft to replace any footage placeholders with their original files. |
| `effectcraft/AE2EC_Verify.jsx` | After an import, it compares what EffectCraft built with the AE export, property by property. Build it with `tools\build-script.ps1 -Verify`. |
| `tools/install.ps1` | Installs the import dialog in EffectCraft's Scripts folder (File ▸ Import and File ▸ Scripts find it there). |
| `tools/test.ps1` | Tests the import dialog with this repo's scripts against the installed EffectCraft, with nothing to build or install; see [testing](docs/testing.md#testing-the-import-dialog-no-build-needed). |
| `tools/import.ps1`, `tools/import.bat` | Run an import (headless to a `.ecproj`, or live into the app) and summarise the report. |
| `tools/build-script.ps1` | Joins the data and the importer into one runnable `.jsx`. EffectCraft scripts can't include other files, so this is needed. |
| `tests/roundtrip.jsx` | An end-to-end test that runs inside EffectCraft: build, export, import, re-export, then compare. |
| `tests/fixtures/` | A sample export produced by the round-trip test. |
| `docs/` | [Usage](docs/usage.md), [file format](docs/format.md), [what transfers](docs/coverage.md) and [testing](docs/testing.md). |

## Status

- **Round trip inside EffectCraft passes** with zero differences on the test fixture: 2 comps, 10 layers, 181 properties, keyframes with eases and spatial tangents, expressions, effects, masks, shapes, text, markers, a precomp, parenting, a track matte, a camera and a light. It also checks what an After Effects export needs on top: AE's defaults for older exports, and settings AE numbers or scales differently.
- **Every value is exported** (exporter 1.2), not only the ones After Effects reports as modified, so the import doesn't depend on EffectCraft's defaults. Exports made before that still import right where AE's default is known to differ, such as a null's anchor point (see [what the importer sets](docs/usage.md#what-the-importer-sets)).
- **A real project has been converted**: `nonmummy .aep` (Lily Allen visualiser, AE 2020) has 8 comps and 42 layers, and all footage, keyframes, masks, effects and expressions came across. The only remaining note was that EffectCraft 0.6.0 showed the animated GIF as a still (0.7.0 plays GIFs). See [docs/testing.md](docs/testing.md).
- See [docs/coverage.md](docs/coverage.md) for known gaps. The main ones are third-party plug-ins, effect data scripts can't read (such as Curves), per-character text styling, and GIFs, which EffectCraft 0.6.0 imports as stills (0.7.0 plays them).

Requires After Effects (any recent version) and EffectCraft 0.6.0 or newer with `effectcraft-cli.exe`, which installs to `C:\Program Files\EffectCraft` on Windows. The import dialog needs an EffectCraft whose scripts can show file dialogs (`File.openDialog`). Those file dialogs and the **File ▸ Import ▸ After Effects Project (.ae2ec.json)…** menu item come from the `feat/aep-to-ecproj-import` branch of the [EffectCraft fork](https://github.com/iEatFishFingers/effectcraft), which is merged into the fork's `dev` branch. EffectCraft 0.7.0 built from `dev` has both; the official 0.6.0 and 0.7.0 releases don't. In an EffectCraft without file dialogs for scripts, the dialog can't ask for the export and closes straight away; use `tools\import.ps1` there.
