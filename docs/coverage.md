# What transfers

✅ means it transfers and is covered by the round-trip test. ☑️ means it transfers but isn't covered by the test fixture yet. ⚠️ means it partly transfers or needs checking. ❌ means it doesn't transfer.

## Project and items

| Feature | Status | Notes |
|---|---|---|
| Folders and hierarchy | ✅ | |
| Comps and settings (size, fps, duration, bg colour, work area, motion blur, shy, nested options) | ✅ | |
| Comp markers | ✅ | |
| File footage (video, stills, audio) | ☑️ | Imported from the original path, optionally remapped. Missing files become placeholders. |
| Image sequences | ☑️ | Detected when AE says the file isn't a still and the extension is an image format. |
| Footage interpretation (alpha mode, conform fps, loop, fields) | ☑️ | Set when EffectCraft has the attribute. |
| Animated GIF | ⚠️ | EffectCraft 0.6.0 imports GIFs as stills. The report flags this, so convert the GIF to a video. |
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
| Track mattes, AE 2023+ (any layer) | ⚠️ | EffectCraft scripting has no `setTrackMatte` yet. If the matte isn't the layer above, the importer uses the layer above and adds a note. |
| Time remapping | ☑️ | |
| Light type | ✅ | |

## Properties

| Feature | Status | Notes |
|---|---|---|
| Transform (incl. 3D orientation/rotation) | ✅ | |
| Separated dimensions (X/Y/Z Position) | ☑️ | |
| Keyframes: linear, bezier, hold | ✅ | |
| Temporal ease (speed and influence per dimension) | ✅ | |
| Spatial tangents, continuous, auto-bezier | ✅ | |
| Roving keyframes | ☑️ | |
| Keyframe label colours | ⚠️ | EffectCraft 0.6.0 accepts the call but ignores it. |
| Expressions (text and enabled state) | ✅ | Copied word for word, and the pre-expression value is kept underneath. |
| Effects (all built-in AE effects) | ✅ | Added by match name, renamed, and switched on or off. EffectCraft has all 298 AE effects. |
| Effect controls (Slider, Point…) used by expressions | ✅ | |
| Effects with custom data (Curves, Levels histogram, some keyers) | ❌ | Scripts can't read that data. The effect is added with defaults and listed under `customValues`. |
| Third-party effects (Trapcode, Element, Saber, Deep Glow…) | ❌ | EffectCraft can't run AE plug-ins. They're listed under `missingEffects`. |
| Masks (path, feather, opacity, expansion, mode, inverted, colour) | ✅ | |
| Shape layers (groups, paths, rect, ellipse, star, fill, stroke, gradients, trim paths, repeater…) | ✅ | Groups, rect, ellipse, fill and trim are in the test. The rest are ☑️ and use the same mechanism. |
| Text: source text, font, size, colour, tracking, justification | ✅ | Box text is ☑️. |
| Text animators and range selectors | ☑️ | |
| Per-character styling (different fonts or colours within one text layer) | ❌ | Only the layer's first style is exported. |
| Layer markers | ✅ | |
| Layer styles | ⚠️ | Added through EffectCraft's Layer Styles menu, then matched by property name. A style applied with all-default settings may be skipped. |
| Puppet pins, paint strokes, Roto Brush | ⚠️ | Attempted generically. Expect to redo them. |
| Essential Graphics / properties | ❌ | |

## EffectCraft 0.6.0 quirks found while testing

- `isModified` always returns `false`. This only matters if you export *from* EffectCraft, as the test does, which is why the test uses `applyAll`.
- Some shape defaults can't be set by script: `ADBE Vector Blend Mode` and `ADBE Vector Shape Direction`. `threeDPerChar` can't be set either. AE marks these as unmodified, so a normal import doesn't touch them.
- A spatial keyframe's temporal ease can come back with 3 entries instead of 1. The values are the same.
- Scripts can't `eval` or include other files (`$.evalFile`), and can only read files in the project's folder. That's why `build-script.ps1` exists.
- `SolidSource`, `FileSource` and `PlaceholderSource` don't exist as classes, so the exporter falls back to checking the source's properties.
