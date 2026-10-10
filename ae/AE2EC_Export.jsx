/*
 * AE2EC_Export.jsx
 * After Effects -> EffectCraft project exporter.
 *
 * Run inside After Effects: File > Scripts > Run Script File... and pick this file.
 * It walks the open project (folders, footage, comps, layers and every property:
 * values, keyframes with easing, expressions, effects, masks, shapes, text, markers)
 * and writes it to a single JSON file (format "ae2ec", see docs/format.md).
 * The EffectCraft side (effectcraft/AE2EC_Import.jsx) rebuilds the project from it.
 *
 * Needs: Edit > Preferences > Scripting & Expressions >
 *        "Allow Scripts to Write Files and Access Network" turned on.
 *
 * Written in ES3 (ExtendScript): no JSON object, no Array.forEach, no let/const.
 * Set AE2EC_NO_MAIN = true before including this file to load the functions
 * without showing the dialog (used by tests and by other tools).
 */

var AE2EC = (typeof AE2EC !== "undefined" && AE2EC) ? AE2EC : {};

(function (X) {

    X.EXPORTER_NAME = "AE2EC_Export.jsx";
    X.EXPORTER_VERSION = "1.1.0";
    X.FORMAT = "ae2ec";
    X.FORMAT_VERSION = 1;

    // ------------------------------------------------------------------ enums
    // Enum values are written as names so the file does not depend on numeric ids.
    X.ENUMS = {
        PropertyType: ["PROPERTY", "INDEXED_GROUP", "NAMED_GROUP"],
        PropertyValueType: ["NO_VALUE", "ThreeD_SPATIAL", "ThreeD", "TwoD_SPATIAL", "TwoD", "OneD",
            "COLOR", "CUSTOM_VALUE", "MARKER", "LAYER_INDEX", "MASK_INDEX", "SHAPE", "TEXT_DOCUMENT"],
        KeyframeInterpolationType: ["LINEAR", "BEZIER", "HOLD"],
        BlendingMode: ["ADD", "ALPHA_ADD", "CLASSIC_COLOR_BURN", "CLASSIC_COLOR_DODGE", "CLASSIC_DIFFERENCE",
            "COLOR", "COLOR_BURN", "COLOR_DODGE", "DANCING_DISSOLVE", "DARKEN", "DARKER_COLOR", "DIFFERENCE",
            "DISSOLVE", "DIVIDE", "EXCLUSION", "HARD_LIGHT", "HARD_MIX", "HUE", "LIGHTEN", "LIGHTER_COLOR",
            "LINEAR_BURN", "LINEAR_DODGE", "LINEAR_LIGHT", "LUMINESCENT_PREMUL", "LUMINOSITY", "MULTIPLY",
            "NORMAL", "OVERLAY", "PIN_LIGHT", "SATURATION", "SCREEN", "SILHOUETE_ALPHA", "SILHOUETTE_LUMA",
            "SOFT_LIGHT", "STENCIL_ALPHA", "STENCIL_LUMA", "SUBTRACT", "VIVID_LIGHT"],
        TrackMatteType: ["NO_TRACK_MATTE", "ALPHA", "ALPHA_INVERTED", "LUMA", "LUMA_INVERTED"],
        MaskMode: ["NONE", "ADD", "SUBTRACT", "INTERSECT", "LIGHTEN", "DARKEN", "DIFFERENCE"],
        MaskMotionBlur: ["SAME_AS_LAYER", "ON", "OFF"],
        MaskFeatherFalloff: ["FFO_LINEAR", "FFO_SMOOTH"],
        LightType: ["PARALLEL", "SPOT", "POINT", "AMBIENT", "ENVIRONMENT"],
        LayerQuality: ["BEST", "DRAFT", "WIREFRAME"],
        LayerSamplingQuality: ["BICUBIC", "BILINEAR"],
        AutoOrientType: ["ALONG_PATH", "CAMERA_OR_POINT_OF_INTEREST", "CHARACTERS_TOWARD_CAMERA", "NO_AUTO_ORIENT"],
        FrameBlendingType: ["FRAME_MIX", "NO_FRAME_BLEND", "PIXEL_MOTION"],
        ParagraphJustification: ["LEFT_JUSTIFY", "RIGHT_JUSTIFY", "CENTER_JUSTIFY", "FULL_JUSTIFY_LASTLINE_LEFT",
            "FULL_JUSTIFY_LASTLINE_RIGHT", "FULL_JUSTIFY_LASTLINE_CENTER", "FULL_JUSTIFY_LASTLINE_FULL",
            "MULTIPLE_JUSTIFICATIONS"],
        AlphaMode: ["IGNORE", "STRAIGHT", "PREMULTIPLIED"],
        FieldSeparationType: ["OFF", "UPPER_FIELD_FIRST", "LOWER_FIELD_FIRST"]
    };

    function enumObj(enumName) {
        try { return eval(enumName); } catch (e) { return null; }
    }

    /** Numeric enum value -> name ("SCREEN"). Unknown values are returned as numbers. */
    X.enumName = function (enumName, value) {
        if (value === undefined || value === null) { return null; }
        var E = enumObj(enumName);
        if (!E) { return value; }
        var names = X.ENUMS[enumName] || [];
        var i;
        for (i = 0; i < names.length; i++) {
            try { if (E[names[i]] === value) { return names[i]; } } catch (e1) { }
        }
        try {
            for (var k in E) { if (E[k] === value) { return k; } }
        } catch (e2) { }
        return value;
    };

    // ------------------------------------------------------------------ JSON
    var ESCAPE_RE = /[\\"\u0000-\u001f\u007f-\uffff]/g;
    function escapeChar(c) {
        switch (c) {
            case '"': return '\\"';
            case "\\": return "\\\\";
            case "\n": return "\\n";
            case "\r": return "\\r";
            case "\t": return "\\t";
        }
        var hex = c.charCodeAt(0).toString(16);
        while (hex.length < 4) { hex = "0" + hex; }
        return "\\u" + hex;
    }
    // one regex pass instead of a per-character loop (much faster in ExtendScript)
    function quote(s) {
        return '"' + String(s).replace(ESCAPE_RE, escapeChar) + '"';
    }

    function isArray(v) { return v instanceof Array; }

    function stringifyInto(v, parts, indent, depth) {
        var i, k, first, pad, padIn, keys;
        if (v === null || v === undefined) { parts.push("null"); return; }
        var t = typeof v;
        if (t === "number") { parts.push(isFinite(v) ? String(v) : "null"); return; }
        if (t === "boolean") { parts.push(v ? "true" : "false"); return; }
        if (t === "string") { parts.push(quote(v)); return; }
        pad = indent ? "\n" + new Array(depth + 1).join(indent) : "";
        padIn = indent ? "\n" + new Array(depth + 2).join(indent) : "";
        if (isArray(v)) {
            if (v.length === 0) { parts.push("[]"); return; }
            // short numeric arrays (vectors, colours) stay on one line
            var flat = true;
            for (i = 0; i < v.length; i++) { if (typeof v[i] === "object" && v[i] !== null) { flat = false; break; } }
            parts.push("[");
            for (i = 0; i < v.length; i++) {
                if (i > 0) { parts.push(flat ? "," : ","); }
                if (!flat) { parts.push(padIn); }
                stringifyInto(v[i], parts, indent, depth + 1);
            }
            if (!flat) { parts.push(pad); }
            parts.push("]");
            return;
        }
        if (t === "object") {
            keys = [];
            for (k in v) { if (v.hasOwnProperty(k) && v[k] !== undefined && typeof v[k] !== "function") { keys.push(k); } }
            if (keys.length === 0) { parts.push("{}"); return; }
            parts.push("{");
            first = true;
            for (i = 0; i < keys.length; i++) {
                if (!first) { parts.push(","); }
                first = false;
                parts.push(padIn);
                parts.push(quote(keys[i]));
                parts.push(indent ? ": " : ":");
                stringifyInto(v[keys[i]], parts, indent, depth + 1);
            }
            parts.push(pad);
            parts.push("}");
            return;
        }
        parts.push("null");
    }

    /** JSON.stringify replacement for ExtendScript. indent: "" for compact, e.g. " " for pretty. */
    X.stringify = function (v, indent) {
        var parts = [];
        stringifyInto(v, parts, indent || "", 0);
        return parts.join("");
    };

    // ------------------------------------------------------------------ helpers
    function tryGet(fn, fallback) {
        try { var r = fn(); return (r === undefined) ? fallback : r; } catch (e) { return fallback; }
    }

    function copyArray(a) {
        if (!isArray(a)) { return a; }
        var out = [], i;
        for (i = 0; i < a.length; i++) { out.push(isArray(a[i]) ? copyArray(a[i]) : a[i]); }
        return out;
    }

    var VT = {};       // numeric PropertyValueType -> name
    (function () {
        var names = X.ENUMS.PropertyValueType, i;
        for (i = 0; i < names.length; i++) {
            try { VT[PropertyValueType[names[i]]] = names[i]; } catch (e) { }
        }
    })();

    function vtName(prop) {
        var v = tryGet(function () { return prop.propertyValueType; }, null);
        if (v === null) { return null; }
        return VT[v] || String(v);
    }

    // ------------------------------------------------------------------ values
    var TEXT_FIELDS = ["text", "font", "fontFamily", "fontStyle", "fontSize", "applyFill", "fillColor",
        "applyStroke", "strokeColor", "strokeWidth", "strokeOverFill", "tracking", "leading", "autoLeading",
        "justification", "baselineShift", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic",
        "allCaps", "smallCaps", "superscript", "subscript", "tsume", "boxText", "pointText", "boxTextSize",
        "boxTextPos", "startIndent", "endIndent", "firstLineIndent", "spaceBefore", "spaceAfter",
        "lineJoinType", "direction", "composerEngine", "digitSet", "kerning", "kerningType",
        "baselineDirection", "ligature", "noBreak", "hangingRoman", "everyLineComposer"];

    function serTextDocument(d) {
        var out = {}, i, f, v;
        for (i = 0; i < TEXT_FIELDS.length; i++) {
            f = TEXT_FIELDS[i];
            v = tryGet((function (field) { return function () { return d[field]; }; })(f), undefined);
            if (v === undefined || v === null || typeof v === "function") { continue; }
            if (f === "justification") { v = X.enumName("ParagraphJustification", v); }
            if (typeof v === "object" && !isArray(v)) {
                v = (typeof v.toString === "function") ? String(v) : undefined;
                if (v === undefined) { continue; }
            }
            out[f] = isArray(v) ? copyArray(v) : v;
        }
        return out;
    }

    var SHAPE_FIELDS = ["vertices", "inTangents", "outTangents", "featherSegLocs", "featherRelSegLocs",
        "featherRadii", "featherInterps", "featherTensions", "featherTypes", "featherRelCornerAngles"];

    function serShape(s) {
        var out = { closed: tryGet(function () { return s.closed; }, true) }, i, f, v;
        for (i = 0; i < SHAPE_FIELDS.length; i++) {
            f = SHAPE_FIELDS[i];
            v = tryGet((function (field) { return function () { return s[field]; }; })(f), undefined);
            if (v === undefined || v === null) { continue; }
            if (i >= 3 && isArray(v) && v.length === 0) { continue; }   // skip empty feather arrays
            out[f] = copyArray(v);
        }
        return out;
    }

    function serMarker(m) {
        var out = {};
        var f = ["comment", "duration", "chapter", "url", "frameTarget", "cuePointName", "eventCuePoint",
            "label", "protectedRegion"], i, v;
        for (i = 0; i < f.length; i++) {
            v = tryGet((function (field) { return function () { return m[field]; }; })(f[i]), undefined);
            if (v !== undefined && v !== null && v !== "" && typeof v !== "function") { out[f[i]] = v; }
        }
        var params = tryGet(function () { return m.getParameters(); }, null);
        if (params) {
            var p = {}, k, any = false;
            for (k in params) { if (params.hasOwnProperty(k)) { p[k] = String(params[k]); any = true; } }
            if (any) { out.params = p; }
        }
        return out;
    }

    function serValue(vt, v) {
        if (v === undefined || v === null) { return undefined; }
        if (vt === "SHAPE") { return serShape(v); }
        if (vt === "TEXT_DOCUMENT") { return serTextDocument(v); }
        if (vt === "MARKER") { return serMarker(v); }
        if (vt === "NO_VALUE" || vt === "CUSTOM_VALUE") { return undefined; }
        if (isArray(v)) { return copyArray(v); }
        if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") { return v; }
        return undefined;
    }

    function serEase(arr) {
        if (!arr) { return undefined; }
        var out = [], i;
        for (i = 0; i < arr.length; i++) { out.push([arr[i].speed, arr[i].influence]); }
        return out;
    }

    function serKeys(prop, vt, stats) {
        var keys = [], i, k, n = prop.numKeys;
        var spatial = (vt === "TwoD_SPATIAL" || vt === "ThreeD_SPATIAL");
        for (i = 1; i <= n; i++) {
            k = { t: prop.keyTime(i) };
            k.v = serValue(vt, tryGet((function (idx) { return function () { return prop.keyValue(idx); }; })(i), undefined));
            k.ii = X.enumName("KeyframeInterpolationType", tryGet((function (idx) { return function () { return prop.keyInInterpolationType(idx); }; })(i), null));
            k.oi = X.enumName("KeyframeInterpolationType", tryGet((function (idx) { return function () { return prop.keyOutInterpolationType(idx); }; })(i), null));
            k.ie = serEase(tryGet((function (idx) { return function () { return prop.keyInTemporalEase(idx); }; })(i), null));
            k.oe = serEase(tryGet((function (idx) { return function () { return prop.keyOutTemporalEase(idx); }; })(i), null));
            k.tc = tryGet((function (idx) { return function () { return prop.keyTemporalContinuous(idx); }; })(i), undefined);
            k.tab = tryGet((function (idx) { return function () { return prop.keyTemporalAutoBezier(idx); }; })(i), undefined);
            if (spatial) {
                k.si = copyArray(tryGet((function (idx) { return function () { return prop.keyInSpatialTangent(idx); }; })(i), undefined));
                k.so = copyArray(tryGet((function (idx) { return function () { return prop.keyOutSpatialTangent(idx); }; })(i), undefined));
                k.sc = tryGet((function (idx) { return function () { return prop.keySpatialContinuous(idx); }; })(i), undefined);
                k.sab = tryGet((function (idx) { return function () { return prop.keySpatialAutoBezier(idx); }; })(i), undefined);
                k.rov = tryGet((function (idx) { return function () { return prop.keyRoving(idx); }; })(i), undefined);
                if (k.rov === false) { delete k.rov; }
            }
            var lbl = tryGet((function (idx) { return function () { return prop.keyLabel(idx); }; })(i), 0);
            if (lbl) { k.lbl = lbl; }
            keys.push(k);
            stats.keys++;
        }
        return keys;
    }

    // ------------------------------------------------------------------ property tree
    function ptName(p) {
        var t = tryGet(function () { return p.propertyType; }, null);
        if (t === PropertyType.INDEXED_GROUP) { return "I"; }
        if (t === PropertyType.NAMED_GROUP) { return "N"; }
        return "P";
    }

    function serMaskAttrs(m) {
        return {
            mode: X.enumName("MaskMode", tryGet(function () { return m.maskMode; }, null)),
            inverted: tryGet(function () { return m.inverted; }, undefined),
            rotoBezier: tryGet(function () { return m.rotoBezier; }, undefined),
            motionBlur: X.enumName("MaskMotionBlur", tryGet(function () { return m.maskMotionBlur; }, null)),
            featherFalloff: X.enumName("MaskFeatherFalloff", tryGet(function () { return m.maskFeatherFalloff; }, null)),
            color: copyArray(tryGet(function () { return m.color; }, undefined)),
            locked: tryGet(function () { return m.locked; }, undefined)
        };
    }

    function serLeaf(p, opts, stats) {
        var mn = String(p.matchName);
        var vt = vtName(p);

        // Separated dimensions (Position -> X/Y/Z Position); only transform Position has them
        if (mn.substring(0, 13) === "ADBE Position") {   // (substring: EffectCraft has no substr)
            if (tryGet(function () { return p.isSeparationFollower; }, false)) {
                if (!tryGet(function () { return p.separationLeader.dimensionsSeparated; }, false)) { return null; }
            } else if (tryGet(function () { return p.isSeparationLeader && p.dimensionsSeparated; }, false)) {
                stats.props++;
                return { mn: mn, n: p.name, pt: "P", vt: vt, sep: true };
            }
        }

        var mod = tryGet(function () { return p.isModified; }, undefined);
        var nk = tryGet(function () { return p.numKeys; }, 0);
        var ex = "";
        if (tryGet(function () { return p.canSetExpression; }, false)) {
            ex = tryGet(function () { return p.expression; }, "") || "";
        }

        // Fast path: an untouched property at its default is skipped without reading its value.
        if (nk === 0 && !ex && mod === false && !opts.includeUnmodified &&
                vt !== "TEXT_DOCUMENT" && vt !== "SHAPE") {
            stats.skipped++;
            return null;
        }

        var node = { mn: mn, n: p.name, pt: "P", vt: vt };
        if (mod !== undefined) { node.mod = mod; }
        if (vt === "OneD") {
            // the property's range tells the importer which scale AE uses (0..1, 0..100, 0..255)
            var hasMin = tryGet(function () { return p.hasMin; }, false);
            var hasMax = tryGet(function () { return p.hasMax; }, false);
            if (hasMin || hasMax) {
                node.rng = [hasMin ? tryGet(function () { return p.minValue; }, null) : null,
                    hasMax ? tryGet(function () { return p.maxValue; }, null) : null];
            }
        }
        var hasData = false;

        if (nk > 0) {
            node.k = serKeys(p, vt, stats);
            hasData = true;
        } else if (vt === "CUSTOM_VALUE") {
            if (mod !== false) { node.custom = true; hasData = true; }   // e.g. Curves: unreadable by scripts
        } else if (vt !== "NO_VALUE") {
            var ok = true, raw;
            // with an expression, .value is the expression's result: read the value underneath
            try { raw = ex ? p.valueAtTime(0, true) : p.value; } catch (eVal) { ok = false; }
            if (ok) {
                var v = serValue(vt, raw);
                if (v !== undefined) { node.v = v; hasData = true; }
            }
        }

        if (ex) {
            node.x = ex;
            node.xe = tryGet(function () { return p.expressionEnabled; }, true);
            var err = tryGet(function () { return p.expressionError; }, "");
            if (err) { node.xerr = err; }
            stats.expressions++;
            hasData = true;
        }

        if (!hasData) { return null; }      // hidden/inaccessible property
        stats.props++;
        return node;
    }

    // Groups that only matter in some situations; skipping them saves most of the time.
    function skipGroup(g, opts) {
        var mn = g.matchName, L = opts.curLayer || {};
        if (!L.threeD && (mn === "ADBE Material Options Group" || mn === "ADBE Plane Options Group" ||
                mn === "ADBE Extrsn Options Group")) { return true; }
        if (!L.hasAudio && mn === "ADBE Audio Group") { return true; }
        if (opts.inLayerStyles && mn !== "ADBE Blend Options Group" && mn !== "ADBE Layer Styles") {
            // a layer style that is not switched on is not applied
            return tryGet(function () { return g.enabled; }, false) !== true;
        }
        return false;
    }

    var EFFECT_NAMES = null;   // match name -> display name, from app.effects
    function effectDisplayName(mn) {
        if (EFFECT_NAMES === null) {
            EFFECT_NAMES = {};
            var list = tryGet(function () { return app.effects; }, null), i;
            if (list) { for (i = 0; i < list.length; i++) { try { EFFECT_NAMES[list[i].matchName] = list[i].displayName; } catch (e) { } } }
        }
        return EFFECT_NAMES[mn];
    }

    function serGroup(g, opts, stats, parentPt) {
        if (skipGroup(g, opts)) { stats.skipped++; return null; }
        var node = { mn: g.matchName, n: g.name, pt: ptName(g) };
        if (parentPt === "I") {
            var fxName = effectDisplayName(g.matchName);
            if (fxName) { node.fx = fxName; }     // lets the importer find an effect whose match name differs
        }
        var stylesRoot = (g.matchName === "ADBE Layer Styles");
        if (stylesRoot) { opts.inLayerStyles = true; }
        if (tryGet(function () { return g.canSetEnabled; }, false)) {
            node.en = tryGet(function () { return g.enabled; }, true);
        }
        if (g.matchName === "ADBE Mask Atom") { node.mask = serMaskAttrs(g); }
        if (parentPt === "I") {
            // effect / mask / shape item / text animator: its position in the parent
            node.i = tryGet(function () { return g.propertyIndex; }, undefined);
        }
        var gmod = tryGet(function () { return g.isModified; }, undefined);
        if (gmod !== undefined) { node.mod = gmod; }
        var ch = [], i, n = tryGet(function () { return g.numProperties; }, 0), c;
        for (i = 1; i <= n; i++) {
            c = serNode(tryGet((function (idx) { return function () { return g.property(idx); }; })(i), null), opts, stats, node.pt);
            if (c) { ch.push(c); }
        }
        if (stylesRoot) {
            opts.inLayerStyles = false;
            // keep Layer Styles only when at least one style (not just Blending Options) is on
            var anyStyle = false, s2;
            for (s2 = 0; s2 < ch.length; s2++) { if (ch[s2].mn !== "ADBE Blend Options Group") { anyStyle = true; } }
            if (!anyStyle) { return null; }
        }
        if (ch.length) { node.ch = ch; }
        if (!ch.length && parentPt !== "I" && node.en === undefined) { return null; }
        return node;
    }

    function serNode(p, opts, stats, parentPt) {
        if (!p) { return null; }
        var t = tryGet(function () { return p.propertyType; }, null);
        if (t === null) { return null; }
        if (t === PropertyType.PROPERTY) { return serLeaf(p, opts, stats); }
        return serGroup(p, opts, stats, parentPt);
    }

    /** "solid" | "placeholder" | "file" for a FootageItem's mainSource (works without the AE classes). */
    function sourceKind(ms) {
        if (!ms) { return "placeholder"; }
        try { if (typeof SolidSource !== "undefined" && ms instanceof SolidSource) { return "solid"; } } catch (e1) { }
        try { if (typeof PlaceholderSource !== "undefined" && ms instanceof PlaceholderSource) { return "placeholder"; } } catch (e2) { }
        try { if (typeof FileSource !== "undefined" && ms instanceof FileSource) { return "file"; } } catch (e3) { }
        var file = tryGet(function () { return ms.file; }, null);
        if (file) { return "file"; }
        var color = tryGet(function () { return ms.color; }, undefined);
        if (color !== undefined && color !== null) { return "solid"; }
        return "placeholder";
    }

    // ------------------------------------------------------------------ layers
    function layerType(l) {
        if (l instanceof TextLayer) { return "text"; }
        if (l instanceof ShapeLayer) { return "shape"; }
        if (l instanceof CameraLayer) { return "camera"; }
        if (l instanceof LightLayer) { return "light"; }
        if (tryGet(function () { return l.nullLayer; }, false)) { return "null"; }
        var src = tryGet(function () { return l.source; }, null);
        if (src instanceof CompItem) { return "precomp"; }
        if (src instanceof FootageItem) {
            var kind = sourceKind(tryGet(function () { return src.mainSource; }, null));
            if (kind === "solid") { return "solid"; }
            if (kind === "placeholder") { return "placeholder"; }
            return "footage";
        }
        return "unknown";
    }

    var LAYER_ATTRS = ["enabled", "audioEnabled", "solo", "shy", "locked", "label", "comment",
        "inPoint", "outPoint", "startTime", "stretch", "threeDLayer", "threeDPerChar", "adjustmentLayer",
        "guideLayer", "collapseTransformation", "motionBlur", "effectsActive", "environmentLayer",
        "preserveTransparency", "timeRemapEnabled", "isNameSet"];

    function serLayer(l, opts, stats) {
        var out = { index: l.index, name: l.name, type: layerType(l) };
        opts.curLayer = {
            threeD: tryGet(function () { return l.threeDLayer; }, false) || out.type === "camera" || out.type === "light",
            hasAudio: tryGet(function () { return l.hasAudio; }, false)
        };
        opts.inLayerStyles = false;
        var a = {}, i, v;
        for (i = 0; i < LAYER_ATTRS.length; i++) {
            v = tryGet((function (f) { return function () { return l[f]; }; })(LAYER_ATTRS[i]), undefined);
            if (v !== undefined && v !== null && typeof v !== "function") { a[LAYER_ATTRS[i]] = v; }
        }
        a.blendingMode = X.enumName("BlendingMode", tryGet(function () { return l.blendingMode; }, null));
        a.quality = X.enumName("LayerQuality", tryGet(function () { return l.quality; }, null));
        a.samplingQuality = X.enumName("LayerSamplingQuality", tryGet(function () { return l.samplingQuality; }, null));
        a.autoOrient = X.enumName("AutoOrientType", tryGet(function () { return l.autoOrient; }, null));
        a.frameBlendingType = X.enumName("FrameBlendingType", tryGet(function () { return l.frameBlendingType; }, null));
        if (out.type === "light") { a.lightType = X.enumName("LightType", tryGet(function () { return l.lightType; }, null)); }
        out.attrs = a;

        var par = tryGet(function () { return l.parent; }, null);
        out.parent = par ? par.index : null;

        var tm = tryGet(function () { return l.trackMatteType; }, null);
        if (tm !== null && tm !== TrackMatteType.NO_TRACK_MATTE) {
            out.matte = { type: X.enumName("TrackMatteType", tm) };
            var ml = tryGet(function () { return l.trackMatteLayer; }, null);   // AE 2023+
            out.matte.layer = ml ? ml.index : l.index - 1;
        }
        out.isTrackMatte = tryGet(function () { return l.isTrackMatte; }, undefined);

        var src = tryGet(function () { return l.source; }, null);
        if (src) {
            out.sourceId = src.id;
            if (out.type === "solid" || out.type === "null") {
                out.solid = {
                    name: src.name,
                    width: src.width,
                    height: src.height,
                    pixelAspect: src.pixelAspect,
                    color: copyArray(tryGet(function () { return src.mainSource.color; }, [0, 0, 0]))
                };
            }
        }

        var props = [], n = tryGet(function () { return l.numProperties; }, 0), c;
        for (i = 1; i <= n; i++) {
            c = serNode(tryGet((function (idx) { return function () { return l.property(idx); }; })(i), null), opts, stats, "N");
            if (c) { props.push(c); }
        }
        // The layer marker is not always listed as a child; add it explicitly.
        var hasMarker = false;
        for (i = 0; i < props.length; i++) { if (props[i].mn === "ADBE Marker") { hasMarker = true; } }
        if (!hasMarker) {
            var mk = tryGet(function () { return l.property("ADBE Marker"); }, null);
            if (mk && mk.numKeys > 0) { props.unshift(serLeaf(mk, opts, stats)); }
        }
        out.props = props;
        stats.layers++;
        return out;
    }

    // ------------------------------------------------------------------ items
    var STILL_EXT = /\.(png|jpe?g|tiff?|tga|exr|dpx|bmp|psd|hdr|cin|sgi|rla|rpf|iff|pxr)$/i;   // not gif/webp: those can be animated

    function serComp(c, opts, stats) {
        var o = {
            id: c.id, type: "comp", name: c.name,
            width: c.width, height: c.height, pixelAspect: c.pixelAspect,
            frameRate: c.frameRate, duration: c.duration,
            displayStartTime: tryGet(function () { return c.displayStartTime; }, 0),
            displayStartFrame: tryGet(function () { return c.displayStartFrame; }, undefined),
            dropFrame: tryGet(function () { return c.dropFrame; }, undefined),
            bgColor: copyArray(tryGet(function () { return c.bgColor; }, [0, 0, 0])),
            workAreaStart: tryGet(function () { return c.workAreaStart; }, 0),
            workAreaDuration: tryGet(function () { return c.workAreaDuration; }, c.duration),
            motionBlur: tryGet(function () { return c.motionBlur; }, false),
            shutterAngle: tryGet(function () { return c.shutterAngle; }, undefined),
            shutterPhase: tryGet(function () { return c.shutterPhase; }, undefined),
            motionBlurSamplesPerFrame: tryGet(function () { return c.motionBlurSamplesPerFrame; }, undefined),
            motionBlurAdaptiveSampleLimit: tryGet(function () { return c.motionBlurAdaptiveSampleLimit; }, undefined),
            frameBlending: tryGet(function () { return c.frameBlending; }, false),
            hideShyLayers: tryGet(function () { return c.hideShyLayers; }, false),
            draft3d: tryGet(function () { return c.draft3d; }, undefined),
            preserveNestedFrameRate: tryGet(function () { return c.preserveNestedFrameRate; }, undefined),
            preserveNestedResolution: tryGet(function () { return c.preserveNestedResolution; }, undefined),
            resolutionFactor: copyArray(tryGet(function () { return c.resolutionFactor; }, undefined)),
            renderer: tryGet(function () { return c.renderer; }, undefined),
            numLayers: c.numLayers
        };
        var mp = tryGet(function () { return c.markerProperty; }, null);
        if (mp && mp.numKeys > 0) { o.markers = serKeys(mp, "MARKER", stats); }
        var layers = [], i;
        var t0, lay;
        for (i = 1; i <= c.numLayers; i++) {
            lay = c.layer(i);
            if (opts.progress) { opts.progress(c.name, i, c.numLayers, lay.name); }
            t0 = new Date().getTime();
            layers.push(serLayer(lay, opts, stats));
            if (opts.onLayer) { opts.onLayer(c.name, i, c.numLayers, lay.name, new Date().getTime() - t0); }
        }
        o.layers = layers;
        stats.comps++;
        return o;
    }

    function serFootage(f, opts) {
        var o = {
            id: f.id, type: "footage", name: f.name,
            width: tryGet(function () { return f.width; }, undefined),
            height: tryGet(function () { return f.height; }, undefined),
            pixelAspect: tryGet(function () { return f.pixelAspect; }, undefined),
            duration: tryGet(function () { return f.duration; }, undefined),
            frameRate: tryGet(function () { return f.frameRate; }, undefined),
            hasVideo: tryGet(function () { return f.hasVideo; }, undefined),
            hasAudio: tryGet(function () { return f.hasAudio; }, undefined),
            footageMissing: tryGet(function () { return f.footageMissing; }, undefined)
        };
        var ms = tryGet(function () { return f.mainSource; }, null);
        o.kind = sourceKind(ms);
        if (o.kind === "solid") {
            o.color = copyArray(tryGet(function () { return ms.color; }, [0, 0, 0]));
        } else if (o.kind === "file") {
            o.kind = "file";
            var file = tryGet(function () { return f.file; }, null) || tryGet(function () { return ms.file; }, null);
            if (file) {
                o.file = file.fsName;
                o.fileURI = tryGet(function () { return file.absoluteURI; }, undefined);
            }
            o.isStill = tryGet(function () { return ms.isStill; }, undefined);
            o.sequence = !!(o.isStill === false && o.hasAudio !== true && o.file && STILL_EXT.test(o.file));
        }
        o.interp = {
            conformFrameRate: tryGet(function () { return ms.conformFrameRate; }, undefined),
            nativeFrameRate: tryGet(function () { return ms.nativeFrameRate; }, undefined),
            alphaMode: X.enumName("AlphaMode", tryGet(function () { return ms.alphaMode; }, null)),
            invertAlpha: tryGet(function () { return ms.invertAlpha; }, undefined),
            premulColor: copyArray(tryGet(function () { return ms.premulColor; }, undefined)),
            fieldSeparationType: X.enumName("FieldSeparationType", tryGet(function () { return ms.fieldSeparationType; }, null)),
            loop: tryGet(function () { return ms.loop; }, undefined),
            highQualityFieldSeparation: tryGet(function () { return ms.highQualityFieldSeparation; }, undefined)
        };
        return o;
    }

    function serItem(it, opts, stats) {
        var o;
        if (it instanceof CompItem) { o = serComp(it, opts, stats); }
        else if (it instanceof FolderItem) { o = { id: it.id, type: "folder", name: it.name }; }
        else if (it instanceof FootageItem) { o = serFootage(it, opts); stats.footage++; }
        else { o = { id: it.id, type: "unknown", name: it.name }; }
        var pf = tryGet(function () { return it.parentFolder; }, null);
        o.parentId = (pf && pf !== app.project.rootFolder) ? pf.id : null;
        o.label = tryGet(function () { return it.label; }, undefined);
        var cm = tryGet(function () { return it.comment; }, "");
        if (cm) { o.comment = cm; }
        return o;
    }

    /** Ids of the given comps plus everything they use (precomps, footage, folders). */
    function collectDependencies(comps) {
        var keep = {}, queue = [], i, j, it, l;
        for (i = 0; i < comps.length; i++) { queue.push(comps[i]); }
        while (queue.length) {
            it = queue.pop();
            if (!it || keep[it.id]) { continue; }
            keep[it.id] = true;
            var pf = tryGet(function () { return it.parentFolder; }, null);
            while (pf && pf !== app.project.rootFolder) { keep[pf.id] = true; pf = pf.parentFolder; }
            if (it instanceof CompItem) {
                for (j = 1; j <= it.numLayers; j++) {
                    l = it.layer(j);
                    var src = tryGet(function () { return l.source; }, null);
                    if (src) { queue.push(src); }
                }
            }
        }
        return keep;
    }

    // ------------------------------------------------------------------ public API
    /**
     * Describe the open project.
     * opts.selectedOnly      only the comps selected in the Project panel (+ dependencies)
     * opts.includeUnmodified also write values still at their defaults (bigger file, safer)
     * opts.progress          function(compName, layerIndex, layerCount)
     * Returns { data, stats }.
     */
    X.exportProject = function (opts) {
        opts = opts || {};
        if (opts.includeUnmodified === undefined) { opts.includeUnmodified = false; }
        var proj = app.project;
        var stats = { comps: 0, layers: 0, footage: 0, props: 0, keys: 0, expressions: 0, skipped: 0 };

        var keep = null;
        if (opts.selectedOnly) {
            var sel = [], s;
            for (s = 0; s < proj.selection.length; s++) { if (proj.selection[s] instanceof CompItem) { sel.push(proj.selection[s]); } }
            if (sel.length === 0 && proj.activeItem instanceof CompItem) { sel.push(proj.activeItem); }
            keep = collectDependencies(sel);
        }

        var items = [], i, it;
        for (i = 1; i <= proj.numItems; i++) {
            it = proj.item(i);
            if (keep && !keep[it.id]) { continue; }
            items.push(serItem(it, opts, stats));
        }

        var rq = [];
        var rqn = tryGet(function () { return proj.renderQueue.numItems; }, 0);
        for (i = 1; i <= rqn; i++) {
            var rqi = proj.renderQueue.item(i);
            var om = tryGet(function () { return rqi.outputModule(1); }, null);
            rq.push({
                compId: tryGet(function () { return rqi.comp.id; }, null),
                output: om ? tryGet(function () { return om.file.fsName; }, null) : null,
                timeSpanStart: tryGet(function () { return rqi.timeSpanStart; }, undefined),
                timeSpanDuration: tryGet(function () { return rqi.timeSpanDuration; }, undefined)
            });
        }

        var active = tryGet(function () { return proj.activeItem; }, null);
        var data = {
            format: X.FORMAT,
            formatVersion: X.FORMAT_VERSION,
            exporter: X.EXPORTER_NAME + " " + X.EXPORTER_VERSION,
            exportedAt: new Date().toString(),
            host: { app: tryGet(function () { return app.version; }, ""), build: tryGet(function () { return app.buildName; }, "") },
            options: { selectedOnly: !!opts.selectedOnly, includeUnmodified: !!opts.includeUnmodified },
            project: {
                file: proj.file ? proj.file.fsName : null,
                name: proj.file ? proj.file.displayName : "Untitled",
                bitsPerChannel: tryGet(function () { return proj.bitsPerChannel; }, undefined),
                workingSpace: tryGet(function () { return proj.workingSpace; }, undefined),
                linearBlending: tryGet(function () { return proj.linearBlending; }, undefined),
                expressionEngine: tryGet(function () { return proj.expressionEngine; }, undefined),
                activeItemId: active ? active.id : null
            },
            stats: stats,
            items: items,
            renderQueue: rq
        };
        return { data: data, stats: stats };
    };

    X.writeTextFile = function (path, text) {
        var f = new File(path);
        f.encoding = "UTF-8";
        f.lineFeed = "Unix";
        if (!f.open("w")) { throw new Error("Could not open " + path + " for writing: " + f.error); }
        f.write(text);
        f.close();
        return f;
    };

    // ------------------------------------------------------------------ UI (After Effects)
    // The section name changed in newer AE versions ("... v2"); if neither can be read,
    // assume writing is allowed and let the save report a clear error.
    function fileWritesAllowed() {
        var sections = ["Main Pref Section v2", "Main Pref Section"], i, v, readAny = false;
        for (i = 0; i < sections.length; i++) {
            v = tryGet((function (sec) { return function () {
                return app.preferences.havePref(sec, "Pref_SCRIPTING_FILE_NETWORK_SECURITY") ?
                    app.preferences.getPrefAsLong(sec, "Pref_SCRIPTING_FILE_NETWORK_SECURITY") : null;
            }; })(sections[i]), null);
            if (v === 1) { return true; }
            if (v !== null) { readAny = true; }
        }
        return !readAny;
    }

    function showOptions() {
        var w = new Window("dialog", "Export to EffectCraft (ae2ec)");
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        var p = w.add("panel", undefined, "Options");
        p.alignChildren = ["left", "top"];
        var cbSel = p.add("checkbox", undefined, "Only comps selected in the Project panel (+ what they use)");
        var cbAll = p.add("checkbox", undefined, "Also write values left at their defaults (slower, bigger file)");
        cbAll.value = false;
        var cbPretty = p.add("checkbox", undefined, "Readable JSON (indented)");
        cbPretty.value = true;
        var g = w.add("group");
        g.alignment = ["right", "top"];
        g.add("button", undefined, "Cancel", { name: "cancel" });
        g.add("button", undefined, "Export...", { name: "ok" });
        if (w.show() !== 1) { return null; }
        return { selectedOnly: cbSel.value, includeUnmodified: cbAll.value, pretty: cbPretty.value };
    }

    X.main = function () {
        if (!app.project) { alert("Open a project first."); return; }
        if (!fileWritesAllowed()) {
            alert("Turn on Edit > Preferences > Scripting & Expressions >\n" +
                "\"Allow Scripts to Write Files and Access Network\", then run this script again.");
            return;
        }
        var opts = showOptions();
        if (!opts) { return; }

        var base = app.project.file ? app.project.file.fsName.replace(/\.aepx?$/i, "") : Folder.desktop.fsName + "/Untitled";
        var target = new File(base + ".ae2ec.json").saveDlg("Save ae2ec export as", "ae2ec JSON:*.json");
        if (!target) { return; }

        // progress window + log file (the log shows where it got to if AE ever stalls)
        var logPath = target.fsName.replace(/\.json$/i, "") + ".log";
        var log = new File(logPath);
        log.encoding = "UTF-8";
        function logLine(t) {
            try { if (log.open("a")) { log.writeln(t); log.close(); } } catch (eLog) { }
        }
        try { if (log.open("w")) { log.writeln("ae2ec export " + new Date().toString()); log.close(); } } catch (eL0) { }

        var totalLayers = 0, doneLayers = 0, k;
        for (k = 1; k <= app.project.numItems; k++) {
            if (app.project.item(k) instanceof CompItem) { totalLayers += app.project.item(k).numLayers; }
        }
        var pw = null, bar = null, label = null;
        try {
            pw = new Window("palette", "Exporting to EffectCraft (ae2ec)");
            pw.alignChildren = ["fill", "top"];
            label = pw.add("statictext", undefined, "Starting...", { truncate: "middle" });
            label.preferredSize = [420, 20];
            bar = pw.add("progressbar", undefined, 0, Math.max(totalLayers, 1));
            bar.preferredSize = [420, 12];
            pw.show();
        } catch (eW) { pw = null; }

        var lastShown = 0;
        opts.progress = function (comp, i, n, layerName) {
            logLine(comp + " | layer " + i + "/" + n + " | " + layerName + " | start");
            var now = new Date().getTime();
            if (now - lastShown > 200) {
                lastShown = now;
                if (pw) {
                    label.text = comp + "  -  layer " + i + "/" + n + ": " + layerName;
                    bar.value = doneLayers;
                    pw.update();
                }
            }
        };
        opts.onLayer = function (comp, i, n, layerName, ms) {
            doneLayers++;
            logLine(comp + " | layer " + i + "/" + n + " | " + layerName + " | done in " + ms + " ms");
        };

        var t0 = new Date().getTime();
        var res, text;
        try {
            res = X.exportProject(opts);
            if (pw) { label.text = "Writing JSON..."; pw.update(); }
            logLine("layers done, writing JSON");
            text = X.stringify(res.data, opts.pretty ? " " : "");
        } catch (eExp) {
            logLine("FAILED: " + eExp.toString() + (eExp.line ? " (line " + eExp.line + ")" : ""));
            if (pw) { pw.close(); }
            throw eExp;
        }
        if (pw) { pw.close(); }
        try {
            X.writeTextFile(target.fsName, text);
        } catch (eWrite) {
            alert("Could not write the file:\n" + eWrite.toString() + "\n\nCheck Edit > Preferences > Scripting & Expressions >\n" +
                "\"Allow Scripts to Write Files and Access Network\".");
            return;
        }
        logLine("done: " + Math.round(text.length / 1024) + " KB in " + Math.round((new Date().getTime() - t0) / 1000) + " s");
        var secs = Math.round((new Date().getTime() - t0) / 100) / 10;
        var s = res.stats;
        clearOutput();
        writeLn("ae2ec export done");
        alert("Exported to:\n" + target.fsName + "\n\n" +
            s.comps + " comps, " + s.layers + " layers, " + s.footage + " footage items\n" +
            s.props + " properties, " + s.keys + " keyframes, " + s.expressions + " expressions\n" +
            "(" + s.skipped + " untouched properties skipped)\n" +
            (Math.round(text.length / 1024)) + " KB in " + secs + " s\n\n" +
            "Next: import it into EffectCraft (see README).");
    };

})(AE2EC);

if (typeof AE2EC_NO_MAIN === "undefined" || !AE2EC_NO_MAIN) {
    try { AE2EC.main(); } catch (e) { alert("ae2ec export failed:\n" + e.toString() + (e.line ? "\nline " + e.line : "")); }
}
