# Testing

## Round trip inside EffectCraft

EffectCraft implements After Effects' scripting model, so the exporter can run *inside EffectCraft*. That makes a full round-trip test possible without After Effects:

1. `tests/roundtrip.jsx` builds a fixture project with 2 comps and 10 layers. It covers every layer type, keyframes with ease and spatial tangents, a hold key, expressions, effects (one renamed and switched off), a mask, shapes with trim paths, text, markers, a precomp, parenting and a track matte.
2. The fixture is exported with `AE2EC.exportProject()` from the real exporter.
3. A fresh project is created and the export is imported with the real importer.
4. The new project is exported again and compared with the first export, item by item. IDs, timestamps and `isModified` flags are ignored.
5. The export is imported again without the null's Anchor Point, as exporter 1.1 and older wrote it, and the null must get After Effects' default [0, 0, 0].
6. A small export written as After Effects would (exporter 1.0, no ranges) is imported: Casts and Accepts Shadows and a text layer's Path must be counted from 1, Fill's Opacity rescaled from 0..1, and an untouched setting with no known scale left alone.

The test passes when the importer reports `ok`, there are zero differences, and no unexpected value failures occur. It allows for the known EffectCraft quirks listed in [coverage.md](coverage.md).

### Run it

EffectCraft scripts can't include other files, so build the combined script first:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build-script.ps1 -Test
"C:\Program Files\EffectCraft\effectcraft-cli.exe" script tests\build\roundtrip.combined.jsx --json
```

To run it in the app instead, go to **File ▸ Scripts ▸ Run Script File…** and choose `tests\build\roundtrip.combined.jsx`. Note that it replaces the open project with a new one.

Through Claude's MCP connection, the test is run with `execute_command file.runScript {"path": "<repo>/tests/build/roundtrip.combined.jsx"}`.

Add `-ReturnFixture` to `build-script.ps1` to include the first export in the result. That's how `tests/fixtures/effectcraft-fixture.ae2ec.json` was made.

### Result on 10 October 2026 (EffectCraft 0.7.0, exporter 1.2.0, importer 1.3.0)

```
ok: true, differences: [], unexpectedFailures: {}, failedValues: {}
exported: 2 comps, 10 layers, 3 footage, 181 properties, 9 keyframes, 2 expressions
imported: 2 comps, 10 layers, 3 effects, 1 mask, 16 values set (the other values already matched), 9 keyframes, 2 expressions
old export: the null's Anchor Point came in as [0, 0, 0]
from After Effects: Path 2, Casts Shadows 2, Accepts Shadows 1, Fill Opacity 50, Horizontal Feather 0 (as expected)
```

`tools\test.ps1` on the same fixture: imported, and Verify checked 181 properties with no differences.

On 9 October 2026 (EffectCraft 0.6.0) the fixture exported 235 properties and the importer set 228 of them, with `ADBE Vector Blend Mode`, `ADBE Vector Shape Direction` and `perChar3d` failing as known quirks.

## Testing the import dialog (no build needed)

`tools\test.ps1` tests the import dialog against the EffectCraft you have installed, with the scripts in this repo, so a change to any `effectcraft\*.jsx` file can be checked in seconds. Nothing gets built or installed.

```powershell
# the round-trip fixture
powershell -ExecutionPolicy Bypass -File tools\test.ps1
# a real export, saving the result to open it afterwards, and leaving EffectCraft open
powershell -ExecutionPolicy Bypass -File tools\test.ps1 -Json "C:\...\prince of the scene .ae2ec.json" -Save "$env:TEMP\ae2ec-out" -Keep
```

Several exports run one after another: `& .\tools\test.ps1 -Json a.ae2ec.json, b.ae2ec.json` (from PowerShell; `powershell -File` can't pass a list).

It starts EffectCraft with the control channel and a settings folder of its own, so your settings, installed scripts and auto-saves aren't touched. Then it drives **Import from After Effects** as a user would: it gives the export instead of picking it (`AE2EC_JSON_PATH`), clicks **Import**, follows the progress, and prints the report and the result of **Verify**. It exits with 1 if an import failed. `-Exe` tests another EffectCraft build, `-NoVerify` skips Verify.

When the change works, run `tools\install.ps1` to use it in your own EffectCraft. You only need a new EffectCraft build when EffectCraft itself changes.

## Testing the After Effects side

The exporter only uses documented AE scripting calls, and it's written in ES3 so ExtendScript can run it. It was checked for ES5-only syntax. Every AE-only call is wrapped so that a property AE refuses to read is skipped rather than stopping the export.

To test with a real project:

1. Export it from AE (see [usage.md](usage.md)).
2. Import it with `tools\import.ps1 -Json … -Live`.
3. Render a few frames from both apps at the same times and compare them.
4. Read `*.import-report.json`. Anything in `failedValues` or `unsupported` that isn't explained in [coverage.md](coverage.md) is either a bug or a gap. Note it down with its match name.

### Real project: Lily Allen visualiser (9 October 2026)

The source was `nonmummy .aep`, exported from After Effects 17.1 (AE 2020): 8 comps, 42 layers, 53 keyframes, 6 expressions, 16 masks and 3 effects (Drop Shadow, Fill, Gradient Ramp). After the footage fix, importing it in the app gave:

```
footage 10 imported, 0 placeholders; comps 8, layers 42, effects 3, masks 16,
props 75, keys 53, expressions 6; nothing unsupported or failed
note: kOnzy.gif is animated in AE but EffectCraft imports it as a still
```

Two problems showed up in the first attempt:
- The first exporter version read every hidden property (about 5,500), which made After Effects freeze for a long time. Later versions read only modified ones by default (75). The BMF export below suggests the freeze was mostly writing the JSON, not reading; exporter 1.2 reads every value again and writes the JSON in small pieces.
- Every footage item became a placeholder because of the `File.exists` restriction.

Re-imported on 10 October 2026 with importer 1.3.0 (this export has every value, `mod` included): Verify found no value differences. With importer 1.2.0 it found 6 when checking every value, among them two nulls at [50, 50, 0] instead of AE's [0, 0, 0].

Before the import, the footage types in that folder (MP3, PNG, WebP, GIF) were checked to import in EffectCraft 0.6.0. The GIF came in as a still.

### Real project: "prince of the scene" (9 October 2026)

The source was `prince of the scene .aep` (AE 2020), exported with exporter 1.0.0: 2 comps, 101 layers (34 text, 20 shape, 2 cameras), 11 PNG image sequences, 109 keyframes, 17 expressions, 40 effects including CC Jaws, Motion Tile, Texturize and Transform, and text animators.

The verify tool found these problems in the first import, all fixed in importer 1.2.0:

| Problem | Cause | Fix |
|---|---|---|
| Image sequences played at the wrong speed | EffectCraft imports sequences at 30 fps | Frame rate set with Interpret Footage |
| CC Jaws covered the whole frame instead of leaving cinematic bars | AE stores Completion as 0..1 and EffectCraft as 0..100 | Range rescaling (`rng`, known-ranges table) |
| Drop Shadow opacity was 100% instead of 64% | AE stores 0..255 and EffectCraft 0..100 | Range rescaling |
| Noise effect missing | AE's `ADBE Noise2` is EffectCraft's `ADBE Noise` | Fall back to the effect's name |
| Text animators had two range selectors | EffectCraft adds a default selector | Remove auto-created children first |
| Animator Opacity was missing | It has to be added, not looked up | `addProperty` fallback |
| Text stroke switched on | Setting the stroke width enables stroke in EffectCraft | Skip stroke fields when stroke is off |
| Footage layers renamed "clip 2", "clip 3" | Unset AE names weren't copied | Always set the layer name |

After the fixes:

```
import: 18 footage, 0 placeholders, 101 layers, 40 effects, 345 properties, 109 keys,
        17 expressions; nothing missing, unsupported or failed; 9 footage items re-interpreted
verify: 101 layers, 345 properties, 95 keyframes checked; remaining differences:
        2 image sequences whose files on disk differ from what AE imported (t_ has gaps,
        f_[0001-0151] has 180 files now)
```

Re-imported on 10 October 2026 with importer 1.3.0: the same Verify result as importer 1.2.0 (one sequence length). Four nulls got After Effects' default Anchor Point, which this export (made with only modified values) doesn't record.

### Real project: BMF (10 October 2026)

The source was `bmf.aep` (AE 2020), exported with exporter 1.1.0 (only modified values): 34 comps, 355 layers, 90 of them nulls. In comp `scene 1`, Camera 2 is parented to a chain of 12 untouched nulls. EffectCraft gave each of them its own default anchor, [50, 50, 0], so each moved its children 50 px up and left, and the camera filmed empty space: at 0 s it sat at x 357, y −57 instead of the comp's centre, and the comp rendered black.

Importer 1.3.0 gives the 88 untouched nulls After Effects' default anchor, [0, 0, 0]. The two nulls centred in AE with a tool are exported as modified [50, 50, 0] and keep it. Camera 2 now sits at x 957, y 543 at 0 s, and the comp shows the push-in on "SWEET ONE". Verify gives the same result as before, except that "keyframe ease" differences dropped from 48 to 4, because ease on a Linear side is no longer compared.

The export's log shows where After Effects spent its time: 2 s reading the 355 layers, then 286 s writing 1 MB of JSON. See [How long it takes](usage.md#how-long-it-takes).
