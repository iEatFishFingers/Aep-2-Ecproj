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
4. Keep the default options and save the file. By default it's saved next to the `.aep` as `<project>.ae2ec.json`.

**2. Import into EffectCraft.** Pick one of these:

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
| `tools/import.ps1`, `tools/import.bat` | Run an import (headless to a `.ecproj`, or live into the app) and summarise the report. |
| `tools/build-script.ps1` | Joins the data and the importer into one runnable `.jsx`. EffectCraft scripts can't include other files, so this is needed. |
| `tests/roundtrip.jsx` | An end-to-end test that runs inside EffectCraft: build, export, import, re-export, then compare. |
| `tests/fixtures/` | A sample export produced by the round-trip test. |
| `docs/` | [Usage](docs/usage.md), [file format](docs/format.md), [what transfers](docs/coverage.md) and [testing](docs/testing.md). |

## Status

- **Round trip inside EffectCraft passes** with zero differences on the test fixture: 2 comps, 10 layers, 235 properties, keyframes with eases and spatial tangents, expressions, effects, masks, shapes, text, markers, a precomp, parenting, a track matte, a camera and a light.
- **The After Effects side** uses only documented AE scripting calls. It hasn't been run on a real `.aep` yet. The first real test is `C:\Users\Yohan\Documents\Editing\lily allen nonmonogomummy\nonmummy .aep`.
- See [docs/coverage.md](docs/coverage.md) for known gaps. The main ones are third-party plug-ins, effect data scripts can't read (such as Curves), per-character text styling, and EffectCraft importing GIFs as stills.

Requires After Effects (any recent version) and EffectCraft 0.6.0 or newer with `effectcraft-cli.exe`, which installs to `C:\Program Files\EffectCraft` on Windows.
