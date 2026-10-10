# Usage

## 1. Export from After Effects

### One-time setup

In After Effects, open **Edit ▸ Preferences ▸ Scripting & Expressions** and turn on **Allow Scripts to Write Files and Access Network**. The exporter checks this setting and tells you if it's off.

### Running it

1. Open the project and **save it**. The export records the project's location, and footage paths are absolute.
2. Go to **File ▸ Scripts ▸ Run Script File…** and choose `ae\AE2EC_Export.jsx`.
3. Choose your options:

   | Option | Default | Meaning |
   |---|---|---|
   | Only comps selected in the Project panel | off | Export only the selected comps, plus every precomp, footage item and folder they use. |
   | Also write values left at their defaults | off | Also reads and writes properties you never touched. This is much slower and makes the file much bigger. It's only useful together with the importer's `-ApplyAll`. |
   | Readable JSON | **on** | Indented output, which is easier to read and diff in git. Turn it off for very large projects. |

4. Choose where to save. The default is `<project>.ae2ec.json` next to the `.aep`.

A progress window shows which comp and layer are being exported. When the export finishes, a summary shows the number of comps, layers, properties, keyframes and expressions.

The exporter also writes a log next to the export (`<project>.ae2ec.log`), with one line when each layer starts and one when it finishes, including the time it took.

### If After Effects says "Not responding"

AE doesn't redraw its window while a script runs, so Windows may label it *Not responding* even while the export is still working. Here's what to do:

- Watch the log file. If new lines keep appearing, it's working.
- If the log hasn't changed for several minutes, its last `start` line shows the layer it's stuck on. End AE in Task Manager (your `.aep` on disk isn't touched by the exporter) and report that layer.
- Leave **Also write values left at their defaults** off. Untouched properties are then skipped without being read, and that's most of them.
- Use **Only comps selected in the Project panel** to export a big project in parts.

## 2. Import into EffectCraft

> **Tip:** importing from inside the app (the menu, or option B, C or D) is the most reliable way to link footage. If a headless import leaves placeholders, open the project and run `effectcraft\AE2EC_Relink.jsx` (see [Relinking footage](#relinking-footage)).

### From the menu (easiest)

1. Install the import dialog once: `powershell -ExecutionPolicy Bypass -File tools\install.ps1`. It builds `effectcraft\AE2EC_ImportDialog.jsx` together with the importer, relink and verify scripts into `%APPDATA%\EffectCraft\Scripts\Import from After Effects.jsx`. Run it again whenever you change any of those scripts or the export format; EffectCraft doesn't need restarting.
2. In EffectCraft, go to **File ▸ Import ▸ After Effects Project (.ae2ec.json)…** (or **File ▸ Scripts ▸ Import from After Effects**) and pick the export.
3. The dialog shows the project, its After Effects version and what's in it. Choose the options (the same as `import.ps1`'s: a folder named after the project, opening its active comp, `-ApplyAll`) and click **Import**. **Browse…** picks another export.
4. While it imports, a progress window shows each step (footage, then each layer) with a log, and EffectCraft keeps drawing. **Cancel** stops it; what was imported so far stays, and **Edit ▸ Undo** removes it.
5. The import goes into the project that's open, inside a folder named after the After Effects project, and isn't saved yet. The report lists what to look at: missing footage, effects EffectCraft doesn't have, settings to redo by hand and notes.
   - **Relink Footage…** asks where the footage is now, then relinks the placeholders, looking first where the footage was and then by file name in that folder.
   - **Verify** compares what EffectCraft built with the export (see [Verify](#4-verify-the-import-automatically)), and adds the differences to the list.
   - **Save Report…** saves the report as JSON next to the export.
   - **Save Project As…** saves the project as an `.ecproj`, named after the After Effects project. You can also use **File ▸ Save As** later.

Everything is created as one undo step. The export file you pick, the report you save and the footage folder you choose can be read and written without EffectCraft's **Allow Scripts to Write Files and Access Network** setting, because you picked them.

### Option A: headless, to a new `.ecproj`

```powershell
powershell -ExecutionPolicy Bypass -File tools\import.ps1 -Json "C:\...\nonmummy .ae2ec.json"
```

This writes `nonmummy .ecproj` next to the export. EffectCraft doesn't need to be running.

### Option B: live, into the open window

Start EffectCraft with the control port (see the **mcp connection** repo), then run:

```powershell
powershell -ExecutionPolicy Bypass -File tools\import.ps1 -Json "C:\...\nonmummy .ae2ec.json" -Live
```

Everything is created inside a `<project> (from AE)` folder in whatever project is open, as a **single undo step**.

### Option C: from inside EffectCraft

1. Build the combined script: `powershell -ExecutionPolicy Bypass -File tools\build-script.ps1 -Json "C:\...\nonmummy .ae2ec.json"`. This writes `nonmummy .ae2ec-import.jsx`.
2. In EffectCraft, go to **File ▸ Scripts ▸ Run Script File…** and choose that `.jsx`.

### Option D: ask Claude

With the EffectCraft MCP connected, ask Claude to import the export file. Claude builds the combined script the same way and runs it with EffectCraft's `file.runScript` command. Then it can render frames, check the report, and fix things up with you.

### `import.ps1` options

| Option | Meaning |
|---|---|
| `-Json <file>` | The export to import (required). |
| `-Out <file.ecproj>` | Where to save in headless mode. The default is next to the export. |
| `-Live` / `-Port 9877` | Import into the running app instead of writing a file. |
| `-ApplyAll` | Also set the values AE reported as unmodified. It's slower, but helps if EffectCraft's defaults differ from AE's for something you see. |
| `-PathMap "old=>new"` | Rewrite footage paths that start with `old`. You can repeat it. Use it when the footage has moved, or when importing on another machine. |
| `-NoRootFolder` | Don't wrap the import in a `(from AE)` folder. |
| `-Cli <path>` | `effectcraft-cli.exe` if it's not in `C:\Program Files\EffectCraft`. |
| `-KeepScript` | Keep the generated `*.ae2ec-import.jsx` instead of deleting it. |

### Relinking footage

When a file can't be imported, the importer creates a placeholder and stores the original path in the placeholder's comment (`ae2ec:<path>`). To fix those placeholders:

1. Open the project in EffectCraft.
2. Go to **File ▸ Scripts ▸ Run Script File…** and choose `effectcraft\AE2EC_Relink.jsx`.

It replaces every placeholder with the file at its stored path, and prints what it relinked and what's still missing.

If the footage has moved, re-run the import with `-PathMap "old=>new"`. Alternatively, build a copy of the relink script that starts with `var AE2EC_RELINK_FOLDER = "D:/new/folder";`, and it will also look for each file by name in that folder.

## 3. The report

`<project>.import-report.json` has these sections. The script also prints a summary.

| Section | What to do |
|---|---|
| `counts` | What was created. Compare it with the exporter's summary. |
| `missingFootage` | Files that couldn't be imported, each with the path tried and the error. They were replaced with placeholders, so run `AE2EC_Relink.jsx` or re-import with `-PathMap`. |
| `missingEffects` | Effects EffectCraft doesn't have, usually third-party plug-ins (Trapcode, Element, Saber…). Rebuild the look with built-in effects. |
| `customValues` | Effect data that AE scripting can't read, such as the curve in **Curves**. The effect is added with default settings, so redo those settings by hand. |
| `unsupported` | Properties or groups EffectCraft doesn't have under that match name. |
| `failedValues` | Values EffectCraft refused. They're listed by match name with counts. |
| `rescaled` | Settings that the two apps store on different scales, and the factor applied. For example, CC Jaws Completion is `0..1` in AE but `0..100` in EffectCraft, and Drop Shadow Opacity is `0..255` versus `0..100`. |
| `notes` | Everything else, for example "animated GIF imported as a still", or "image sequence has a different number of frames on disk". |

## 4. Verify the import automatically

`AE2EC_Verify.jsx` re-exports what EffectCraft built, using the exporter's own code, and compares it with the After Effects export. It checks footage frame rates and lengths, comp settings, every layer's timing, switches, parent and matte, and every property AE recorded, including values, keyframes, eases and expressions. To use it:

1. Build it: `powershell -ExecutionPolicy Bypass -File tools\build-script.ps1 -Json "C:\...\project.ae2ec.json" -Verify`. This writes `project.ae2ec-verify.jsx`.
2. With the imported project open in EffectCraft, go to **File ▸ Scripts ▸ Run Script File…** and choose that file.
3. The result counts the differences by kind (`value`, `keyframe value`, `missing in EffectCraft`…) and lists examples with their path, e.g. `main > #5 necklace > Effects > Drop Shadow > Opacity`.

Claude runs this after every import it does through the MCP connection.

## 5. Check the result by eye

- Render the same frames in both apps and compare them side by side. Claude can do this through the MCP connection with `render_frame`.
- Expressions are copied word for word. EffectCraft's expression engine follows AE's (`wiggle`, `loopOut`, `thisComp.layer()`…), but look out for errors in the Timeline.
- Fonts have to be installed on the machine that runs EffectCraft. Text uses the PostScript font name from AE.
