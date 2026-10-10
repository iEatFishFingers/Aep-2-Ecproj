# The ae2ec file format (version 1)

The format is a single UTF-8 JSON file, conventionally named `<project>.ae2ec.json`. All non-ASCII characters are `\u` escaped. Times are in seconds of **comp time**, the same as AE's `keyTime` and `setValueAtTime`. Colours are `[r, g, b]` or `[r, g, b, a]` with values from 0 to 1. Enums are written as **names** (`"SCREEN"`, `"BEZIER"`) rather than AE's numeric ids. Reading code should still accept a number if a name was unknown at export time.

## Top level

```jsonc
{
  "format": "ae2ec",
  "formatVersion": 1,
  "exporter": "AE2EC_Export.jsx 1.2.0",
  "exportedAt": "…",
  "host": { "app": "25.0x…", "build": "…" },          // app.version / buildName
  "options": { "selectedOnly": false, "includeUnmodified": true },   // false: the "Faster" option
  "project": { "file": "C:\\…\\nonmummy .aep", "name": "nonmummy .aep", "bitsPerChannel": 8,
               "workingSpace": "", "linearBlending": false, "expressionEngine": "javascript-1.0",
               "activeItemId": 12 },
  "stats": { "comps": 0, "layers": 0, "footage": 0, "props": 0, "keys": 0, "expressions": 0, "skipped": 0 },
  "items": [ … ],                                       // in AE's Project panel order
  "renderQueue": [ { "compId": 12, "output": "C:\\…\\out.mov", "timeSpanStart": 0, "timeSpanDuration": 10 } ]
}
```

## Items

Every item has `id` (AE's item id, used only for references within the file), `type`, `name`, `parentId` (a folder id, or `null` for the root), and optionally `label` and `comment`.

**Folder:** `{ "type": "folder" }`

**Footage:**

```jsonc
{ "type": "footage", "kind": "file" | "solid" | "placeholder",
  "width": 1920, "height": 1080, "pixelAspect": 1, "duration": 12.5, "frameRate": 25,
  "hasVideo": true, "hasAudio": false, "footageMissing": false,
  "file": "C:\\…\\clip.mov", "fileURI": "/c/…/clip.mov",   // kind = file
  "isStill": false, "sequence": false,                        // sequence = image sequence
  "color": [1, 0, 0],                                          // kind = solid
  "interp": { "conformFrameRate": 0, "nativeFrameRate": 25, "alphaMode": "PREMULTIPLIED",
              "invertAlpha": false, "premulColor": [0,0,0], "fieldSeparationType": "OFF", "loop": 1 } }
```

**Comp:**

```jsonc
{ "type": "comp", "width": 1920, "height": 1080, "pixelAspect": 1, "frameRate": 30, "duration": 10,
  "displayStartTime": 0, "bgColor": [0,0,0], "workAreaStart": 0, "workAreaDuration": 10,
  "motionBlur": false, "shutterAngle": 180, "shutterPhase": -90, "frameBlending": false,
  "hideShyLayers": false, "preserveNestedFrameRate": false, "preserveNestedResolution": false,
  "renderer": "…", "numLayers": 12,
  "markers": [ key, … ],          // comp markers, same shape as keyframes (vt MARKER)
  "layers": [ layer, … ] }        // index 1 (top) first
```

## Layers

```jsonc
{ "index": 3, "name": "Title",
  "type": "text" | "shape" | "solid" | "null" | "camera" | "light" | "precomp" | "footage" | "placeholder",
  "sourceId": 40,                 // item id of the source (precomp / footage / solid)
  "solid": { "name": "…", "width": 1920, "height": 1080, "pixelAspect": 1, "color": [1,1,1] },  // solid & null
  "parent": 1,                    // parent layer index, or null
  "matte": { "type": "ALPHA", "layer": 2 },   // only when the layer uses a track matte
  "isTrackMatte": false,
  "attrs": { "enabled": true, "audioEnabled": true, "solo": false, "shy": false, "locked": false,
             "label": 9, "inPoint": 0, "outPoint": 10, "startTime": 0, "stretch": 100,
             "threeDLayer": false, "adjustmentLayer": false, "guideLayer": false,
             "collapseTransformation": false, "motionBlur": false, "timeRemapEnabled": false,
             "blendingMode": "NORMAL", "quality": "BEST", "samplingQuality": "BICUBIC",
             "autoOrient": "NO_AUTO_ORIENT", "frameBlendingType": "NO_FRAME_BLEND",
             "lightType": "SPOT", "isNameSet": true, … },
  "props": [ node, … ] }          // the layer's property tree (see below)
```

`matte.layer` is the matte's layer index. Before AE 2023 it's always `index - 1`. From AE 2023 on, track mattes can point at any layer.

## Property nodes

The property tree is a direct mirror of AE's `PropertyGroup` / `Property` objects, keyed by **match name**, so it doesn't depend on the UI language.

**Group:**

```jsonc
{ "mn": "ADBE Effect Parade", "n": "Effects",
  "pt": "I",                  // "I" indexed group (children are added: effects, masks, shape items,
                              //      text animators), "N" named group (children already exist)
  "en": true,                 // enabled switch, when the group has one (effects, shape items…)
  "mod": true,                // AE's isModified, when available
  "i": 2,                     // position in an indexed parent
  "fx": "Noise",              // effects: AE's display name for the effect (exporter 1.1+), used when
                              //      EffectCraft knows the effect under a different match name
  "mask": { "mode": "ADD", "inverted": false, "rotoBezier": false, "motionBlur": "SAME_AS_LAYER",
            "featherFalloff": "FFO_SMOOTH", "color": [1,0,0], "locked": false },   // mask atoms only
  "ch": [ node, … ] }
```

**Property (leaf):**

```jsonc
{ "mn": "ADBE Position", "n": "Position", "pt": "P",
  "vt": "TwoD_SPATIAL",       // OneD TwoD TwoD_SPATIAL ThreeD ThreeD_SPATIAL COLOR SHAPE TEXT_DOCUMENT
                              // MARKER LAYER_INDEX MASK_INDEX CUSTOM_VALUE NO_VALUE
  "mod": true,                // isModified
  "rng": [0, 1],              // OneD only (exporter 1.1+): AE's [min, max] for the property; tells the
                              //      importer which scale AE stores it on (0..1, 0..100, 0..255)
  "v": [960, 540],            // static value (pre-expression); absent when keyframed, and for markers
  "k": [ key, … ],            // keyframes
  "x": "wiggle(2,20)",        // expression text
  "xe": true,                 // expression enabled
  "xerr": "…",                // AE's expression error at export time, if any
  "sep": true,                // Position only: dimensions separated (values live on ADBE Position_0/1/2)
  "custom": true }            // CUSTOM_VALUE that scripts cannot read (e.g. Curves)
```

**Keyframe:**

```jsonc
{ "t": 1.5, "v": [960, 540],
  "ii": "BEZIER", "oi": "BEZIER",                  // in/out interpolation
  "ie": [[0, 33.333]], "oe": [[0, 75]],            // temporal ease per dimension: [speed, influence %]
                                                   // (spatial properties have one entry)
  "tc": false, "tab": false,                       // temporal continuous / auto-bezier
  "si": [-200, 0], "so": [200, 0],                 // spatial in/out tangents (spatial properties)
  "sc": false, "sab": false, "rov": true,          // spatial continuous / auto-bezier / roving
  "lbl": 3 }                                       // keyframe label colour (AE 2022+)
```

**Special values:**

- **SHAPE** (mask paths, shape paths): `{ "closed": true, "vertices": [[x,y]…], "inTangents": […], "outTangents": […] }`, plus `feather*` arrays when there are mask feather points.
- **TEXT_DOCUMENT**: `{ "text", "font" (PostScript name), "fontFamily", "fontStyle", "fontSize", "applyFill", "fillColor", "applyStroke", "strokeColor", "strokeWidth", "strokeOverFill", "tracking", "leading", "autoLeading", "justification" (name), "baselineShift", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic", "allCaps", "smallCaps", "superscript", "subscript", "tsume", "boxText", "pointText", "boxTextSize", "boxTextPos", indents and spacing… }`. Only the fields AE could read are present.
- **MARKER**: `{ "comment", "duration", "chapter", "url", "frameTarget", "cuePointName", "eventCuePoint", "label", "protectedRegion", "params": {…} }`.
- **LAYER_INDEX / MASK_INDEX**: plain numbers (layer or mask index, with 0 meaning none).

## What gets written

By default (`includeUnmodified: true`, exporter 1.2 and newer), the exporter reads and writes the value of every property it visits, whether or not AE reports it as modified. `mod` still says which ones were. The importer then never has to rely on EffectCraft's defaults, which aren't always After Effects' (a new null's anchor point, for one: AE puts it at the null's top-left corner).

With the **Faster** option (`includeUnmodified: false`, and the only behaviour of exporter 1.1 and older), a property is written only if AE reports it as modified, or it has keyframes or an expression. Text documents and shape paths are always written. For a property it leaves out, the importer uses After Effects' default where it knows EffectCraft's differs, and EffectCraft's otherwise (see [usage](usage.md#what-the-importer-sets)).

Either way, some groups are skipped entirely because they can't apply:
- Material Options and Geometry Options on 2D layers
- the Audio group on layers without audio
- layer styles that aren't switched on

A marker property has no static value: markers are written only as keyframes. Exporter 1.0 also wrote the value of an empty marker property, which importers ignore.

## Versioning

`formatVersion` changes only when a reader would misread the file. New optional fields can be added within version 1, and readers ignore fields they don't know.
