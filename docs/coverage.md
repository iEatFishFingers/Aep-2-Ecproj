# What transfers

✅ means it transfers and is covered by the round-trip test. ☑️ means it transfers but isn't covered by the test fixture yet. ⚠️ means it partly transfers or needs checking. ❌ means it doesn't transfer.

## Project and items

| Feature | Status | Notes |
|---|---|---|
| Folders and hierarchy | ✅ | |
| Comps and settings (size, fps, duration, bg colour, work area, motion blur, shy, nested options) | ✅ | |
| Comp markers | ✅ | |
| File footage (video, stills, audio) | ✅ | Imported from the original path, optionally remapped. Files that can't be imported become placeholders, which `AE2EC_Relink.jsx` fixes. Verified on the Lily Allen project (PNG, GIF, MP3). |
| Image sequences | ✅ | Detected when AE says the file isn't a still and the extension is an image format. Verified on 11 PNG sequences. If the files on disk have gaps or extra frames compared with what AE imported, the report says so. |
| Footage interpretation (frame rate, alpha mode, loop, fields, pixel aspect) | ✅ | Set with EffectCraft's Interpret Footage command. EffectCraft imports image sequences at 30 fps, so their AE frame rate is restored. |
| Animated GIF | ⚠️ | EffectCraft 0.6.0 imports GIFs as stills; 0.7.0 plays them. If a GIF comes in as a still, the report flags it, so convert the GIF to a video. |
| Solids | ✅ | Recreated per layer. Unused solids in the Solids folder aren't recreated. |
| Placeholders | ☑️ | |
| Render queue | ❌ | Recorded in the export but not recreated. |
| Proxies | ❌ | |

## Layers

| Feature | Status | Notes |
|---|---|---|
| Solid, null, adjustment, text, shape, camera, light, precomp, footage | ✅ | Adjustment layers and footage layers are ☑️. |
| Order, names, labels, comments | ✅ | |
| In/out/start time, stretch | ✅ | |
| Switches (enabled, audio, solo, shy, lock, 3D, motion blur, collapse, quality, sampling, frame blending, auto-orient) | ✅ | |
| Blending modes (all 38) | ✅ | |
| Parenting | ✅ | Set before transforms, so values come out the same as in AE. |
| Track mattes, legacy (layer above) | ✅ | |
| Track mattes, AE 2023+ (any layer) | ☑️ | Set with EffectCraft's `layer.setTrackMatte` command. |
| Time remapping | ☑️ | |
| Light type | ✅ | |

## Properties

| Feature | Status | Notes |
|---|---|---|
| Values left at After Effects' defaults | ✅ | Exporter 1.2 writes every value and the importer applies it, so nothing depends on EffectCraft's defaults. For older exports (or **Faster**), the importer uses AE's default where it's known to differ: a null's Anchor Point [0, 0, 0]. See [What the importer sets](usage.md#what-the-importer-sets). |
| Transform (incl. 3D orientation/rotation) | ✅ | |
| Separated dimensions (X/Y/Z Position) | ☑️ | |
| Keyframes: linear, bezier, hold | ✅ | |
| Temporal ease (speed and influence per dimension) | ✅ | |
| Spatial tangents, continuous, auto-bezier | ✅ | |
| Roving keyframes | ☑️ | |
| Keyframe label colours | ⚠️ | EffectCraft (0.6.0 and 0.7.0) accepts the call but ignores it. |
| Expressions (text and enabled state) | ✅ | Copied word for word, and the pre-expression value is kept underneath. |
| Effects (all built-in AE effects, plus CC effects) | ✅ | Added by match name, falling back to the effect's AE display name and then its layer name (so e.g. `ADBE Noise2` finds EffectCraft's Noise). They're renamed and switched on or off. Parameters are matched by match name, name, then parameter number. |
| Effect settings stored on different scales | ✅ | The importer rescales a value when AE's range differs from EffectCraft's in a known way (0..1, 0..100, 0..255). Examples are CC Jaws Completion, Drop Shadow Opacity and Fill Opacity. Exports from exporter 1.1+ carry AE's range for every setting, so new cases are handled automatically. Exporter 1.0 exports don't, so their untouched one-number settings are left at EffectCraft's defaults unless the scale is known. |
| Material Options: Casts Shadows, Accepts Shadows | ✅ | AE counts Off, On, Only from 0; EffectCraft's scripting from 1. The importer adds 1. |
| Text on a path (Path Options ▸ Path) | ✅ | AE counts None, then each mask, from 0; EffectCraft's scripting from 1. The importer adds 1. |
| Effect controls (Slider, Point…) used by expressions | ✅ | |
| Effects with custom data (Curves, Levels histogram, some keyers) | ❌ | Scripts can't read that data. The effect is added with defaults and listed under `customValues`. |
| Third-party effects (Trapcode, Element, Saber, Deep Glow…) | ❌ | EffectCraft can't run AE plug-ins. They're listed under `missingEffects`. |
| Masks (path, feather, opacity, expansion, mode, inverted, colour) | ✅ | |
| Shape layers (groups, paths, rect, ellipse, star, fill, stroke, gradients, trim paths, repeater…) | ✅ | Groups, rect, ellipse, fill and trim are in the test. The rest are ☑️ and use the same mechanism. |
| Text: source text, font, size, colour, tracking, justification | ✅ | Box text is ☑️. |
| Text animators and range selectors | ✅ | EffectCraft adds a default Range Selector to each new animator, so the importer removes it before adding AE's. Animator properties (Opacity, Position…) are added the way EffectCraft expects. |
| Per-character styling (different fonts or colours within one text layer) | ❌ | Only the layer's first style is exported. |
| Layer markers | ✅ | |
| Layer styles | ⚠️ | Added with EffectCraft's `layer.style.add` command, then matched by property name. A style applied with all-default settings may be skipped. |
| Puppet pins, paint strokes, Roto Brush | ⚠️ | Attempted generically. Expect to redo them. |
| Essential Graphics / properties | ❌ | |

## EffectCraft quirks found while testing

These were found on EffectCraft 0.6.0 and rechecked on 0.7.0 (10 October 2026). They all still apply unless the item says otherwise.

- `isModified` always returns `false`. This only matters if you export *from* EffectCraft, as the test does. The importer applies every value whatever `mod` says, so it doesn't depend on it.
- Some shape defaults can't be set by script: `ADBE Vector Blend Mode` and `ADBE Vector Shape Direction`. Per-character 3D (`perChar3d`) can't be set either. When AE has them at its default, the importer leaves them alone.
- A new null's anchor point is at its centre ([50, 50, 0]); in After Effects it's at the top-left corner ([0, 0, 0]). Everything parented to an untouched null then sits 50 px up and left of where AE puts it, so a camera under a chain of 12 nulls (the BMF project) filmed empty space. The importer sets AE's anchor (from the export, or AE's default for older exports). The EffectCraft fork's `fix/new-nulls-anchor-at-top-left` branch makes new nulls match AE.
- Casts Shadows, Accepts Shadows and a text layer's Path are menus EffectCraft's scripting counts from 1, where AE counts from 0 (`setValue(0)` and `setValue(1)` both give Off).
- On 0.6.0, a spatial keyframe's temporal ease could come back with 3 entries instead of 1. The values were the same. 0.7.0 returns 1 entry.
- Scripts can't include other files (`$.evalFile` throws), and can only read files in the project's folder unless **Allow Scripts to Write Files and Access Network** is on. That's why `build-script.ps1` exists.
- `SolidSource`, `FileSource` and `PlaceholderSource` don't exist as classes, so the exporter falls back to checking the source's properties.
- `File.exists` is `false` for any file outside the saved project's folder, but `importFile` works anywhere. The importer therefore imports directly instead of checking first. The first real import (Lily Allen project) turned every footage item into a placeholder because of this, and it's fixed in importer 1.0.1.
- `String.prototype.substr` doesn't exist. Use `substring`.
- Scripts can't change footage interpretation, and `app.executeCommand` takes only a command id, with no parameters. The importer runs the engine commands for Interpret Footage, track mattes and layer styles with `app.run(commandId, params)`, EffectCraft's public scripting call for any engine command. If one of them fails, that step is skipped and listed in the report.
- Setting a text document's stroke width or colour switches stroke on, even when `applyStroke = false` is set afterwards. So the importer leaves stroke fields alone when AE had stroke off.
- A new text animator comes with a Range Selector already in it.
- Items, layers and effect parameters have their own match names in some cases, e.g. CC Jaws is `ec.transition.ccjaws`, with parameters `ec.transition.ccjaws-0001…`.
