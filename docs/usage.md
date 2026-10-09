# Usage

## 1. Export from After Effects

### One-time setup

In After Effects, open **Edit ▸ Preferences ▸ Scripting & Expressions** and turn on **Allow Scripts to Write Files and Access Network**. The exporter checks this setting and tells you if it's off.

You can also make the script appear in the **File ▸ Scripts** menu by copying `ae\AE2EC_Export.jsx` to `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\`. That's optional.

### Running it

1. Open the project and **save it**. The export records the project's location, and footage paths are absolute.
2. Go to **File ▸ Scripts ▸ Run Script File…** and choose `ae\AE2EC_Export.jsx`.
3. Choose your options:

   | Option | Default | Meaning |
   |---|---|---|
   | Only comps selected in the Project panel | off | Export only the selected comps, plus every precomp, footage item and folder they use. |
   | Include values left at their defaults | **on** | Writes every readable property value, flagged as modified or not. This makes the file bigger but complete. The importer still skips unmodified values unless you ask it not to. |
   | Readable JSON | **on** | Indented output, which is easier to read and diff in git. Turn it off for very large projects. |

4. Choose where to save. The default is `<project>.ae2ec.json` next to the `.aep`.

Progress appears in the **Info** panel. When the export finishes, a summary shows the number of comps, layers, properties, keyframes and expressions.

## 2. Import into EffectCraft

### Option A: headless, to a new `.ecproj` (recommended)

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

## 3. The report

`<project>.import-report.json` has these sections. The script also prints a summary.

| Section | What to do |
|---|---|
| `counts` | What was created. Compare it with the exporter's summary. |
| `missingFootage` | Files that weren't found and were replaced with placeholders. Relink them in EffectCraft, or re-import with `-PathMap`. |
| `missingEffects` | Effects EffectCraft doesn't have, usually third-party plug-ins (Trapcode, Element, Saber…). Rebuild the look with built-in effects. |
| `customValues` | Effect data that AE scripting can't read, such as the curve in **Curves**. The effect is added with default settings, so redo those settings by hand. |
| `unsupported` | Properties or groups EffectCraft doesn't have under that match name. |
| `failedValues` | Values EffectCraft refused. They're listed by match name with counts. |
| `notes` | Everything else, for example "animated GIF imported as a still" or "track matte layer isn't the one above". |

## 4. Check the result

- Render the same frames in both apps and compare them side by side. Claude can do this through the MCP connection with `render_frame`.
- Expressions are copied word for word. EffectCraft's expression engine follows AE's (`wiggle`, `loopOut`, `thisComp.layer()`…), but look out for errors in the Timeline.
- Fonts have to be installed on the machine that runs EffectCraft. Text uses the PostScript font name from AE.
