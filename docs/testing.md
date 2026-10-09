# Testing

## Round trip inside EffectCraft

EffectCraft implements After Effects' scripting model, so the exporter can run *inside EffectCraft*. That makes a full round-trip test possible without After Effects:

1. `tests/roundtrip.jsx` builds a fixture project with 2 comps and 10 layers. It covers every layer type, keyframes with ease and spatial tangents, a hold key, expressions, effects (one renamed and switched off), a mask, shapes with trim paths, text, markers, a precomp, parenting and a track matte.
2. The fixture is exported with `AE2EC.exportProject()` from the real exporter.
3. A fresh project is created and the export is imported with the real importer.
4. The new project is exported again and compared with the first export, item by item. IDs, timestamps and `isModified` flags are ignored.

The test passes when the importer reports `ok`, there are zero differences, and no unexpected value failures occur. It allows for the known EffectCraft 0.6.0 quirks listed in [coverage.md](coverage.md).

### Run it

EffectCraft scripts can't include other files, so build the combined script first:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build-script.ps1 -Test
"C:\Program Files\EffectCraft\effectcraft-cli.exe" script tests\build\roundtrip.combined.jsx --json
```

To run it in the app instead, go to **File ▸ Scripts ▸ Run Script File…** and choose `tests\build\roundtrip.combined.jsx`. Note that it replaces the open project with a new one.

Through Claude's MCP connection, the test is run with `execute_command file.runScript {"path": "<repo>/tests/build/roundtrip.combined.jsx"}`.

Add `-ReturnFixture` to `build-script.ps1` to include the first export in the result. That's how `tests/fixtures/effectcraft-fixture.ae2ec.json` was made.

### Result on 9 October 2026 (EffectCraft 0.6.0)

```
ok: true, differences: [], unexpectedFailures: {}
exported: 2 comps, 10 layers, 3 footage, 235 properties, 9 keyframes, 2 expressions
imported: 2 comps, 10 layers, 3 effects, 1 mask, 228 properties set, 9 keyframes, 2 expressions
```

## Testing the After Effects side

The exporter only uses documented AE scripting calls, and it's written in ES3 so ExtendScript can run it. It was checked for ES5-only syntax. Every AE-only call is wrapped so that a property AE refuses to read is skipped rather than stopping the export.

To test with a real project:

1. Export it from AE (see [usage.md](usage.md)).
2. Import it with `tools\import.ps1 -Json … -Live`.
3. Render a few frames from both apps at the same times and compare them.
4. Read `*.import-report.json`. Anything in `failedValues` or `unsupported` that isn't explained in [coverage.md](coverage.md) is either a bug or a gap. Note it down with its match name.

First real-world target: `C:\Users\Yohan\Documents\Editing\lily allen nonmonogomummy\nonmummy .aep`. It's a lyric visualiser with an MP3, PNG, WebP and GIF stills. Those footage types were checked to import in EffectCraft 0.6.0, and the GIF imports as a still.
