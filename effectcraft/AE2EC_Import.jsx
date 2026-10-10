/*
 * AE2EC_Import.jsx
 * Rebuilds an After Effects project in EffectCraft from an ae2ec JSON export
 * (made by ae/AE2EC_Export.jsx).
 *
 * It uses EffectCraft's After Effects-style scripting model, so it runs:
 *   - from the command line:  tools\import.ps1 -Json file.ae2ec.json -Out file.ecproj
 *   - against the open app:   tools\import.ps1 -Json file.ae2ec.json -Live
 *   - through Claude's MCP:   run_script with this file's text after the data
 *
 * Input (globals defined before this file runs):
 *   AE2EC_DATA      the parsed export object  (or)
 *   AE2EC_JSON_PATH path of the .ae2ec.json file to read
 *   AE2EC_OPTIONS   optional, see DEFAULTS below
 *
 * The last expression is a JSON report; it is also printed between
 * AE2EC_REPORT_BEGIN / AE2EC_REPORT_END lines.
 */

var AE2EC_IMPORT = (function () {

    var VERSION = "1.2.0";

    var DEFAULTS = {
        applyAll: false,         // also set properties AE reported as unmodified
        rootFolder: true,        // put everything in a folder named after the AE project
        pathMap: [],             // [["D:/old/footage", "E:/new/footage"], ...] prefix replacements
        openComp: true,          // open the AE project's active comp when done
        save: null,              // path of an .ecproj to save to when done
        progress: null           // function (done, total, what), called as the import goes (see step)
    };

    // ------------------------------------------------------------------ report
    var R = {
        importer: "AE2EC_Import.jsx " + VERSION,
        ok: true,
        counts: { folders: 0, footage: 0, placeholders: 0, comps: 0, layers: 0, effects: 0, masks: 0,
            props: 0, keys: 0, expressions: 0, layerStyles: 0 },
        missingFootage: [],
        missingEffects: {},
        unsupported: {},
        failedValues: {},
        customValues: {},
        rescaled: {},
        notes: []
    };

    function bump(map, key) { map[key] = (map[key] || 0) + 1; }

    // Progress for opts.progress: `what` is being done now, step `done` of `total` (each footage
    // item, each layer made, each layer's properties). The callback returning false stops the
    // import (CANCELLED); what was made so far stays, as one undo step.
    var P = { done: 0, total: 1, fn: null }, CANCELLED = new Error("Import cancelled");
    function step(what) {
        P.done++;
        if (P.fn && P.fn(P.done, P.total, what) === false) { throw CANCELLED; }
    }
    function note(msg) { if (R.notes.length < 200) { R.notes.push(msg); } }

    // EffectCraft engine commands with parameters. Scripts reach them through __call, an
    // internal bridge (app.executeCommand drops parameters). Used for things the scripting
    // model can't set: footage interpretation, track mattes on any layer, layer styles.
    // If a future EffectCraft changes it, the importer falls back and reports what it skipped.
    function ec(id, params) {
        if (typeof __call !== "function") { throw new Error("EffectCraft command bridge not available"); }
        return __call(id, params || {});
    }

    // ------------------------------------------------------------------ enums / values
    function enumVal(enumName, v) {
        if (v === null || v === undefined) { return undefined; }
        if (typeof v === "number") { return v; }
        try {
            var E = eval(enumName);
            if (E && E[v] !== undefined) { return E[v]; }
        } catch (e) { }
        return undefined;
    }

    function setIf(obj, key, v) {
        if (v === undefined || v === null) { return; }
        try { obj[key] = v; } catch (e) { bump(R.failedValues, "attr:" + key); }
    }

    function deShape(o) {
        var s = new Shape(), k;
        for (k in o) { if (o.hasOwnProperty(k)) { try { s[k] = o[k]; } catch (e) { } } }
        return s;
    }

    var TEXT_LAST = { applyFill: 1, applyStroke: 1 };
    // EffectCraft switches stroke (or fill) on as soon as its width/colour is touched, even when
    // applyStroke is set to false afterwards, so leave those fields alone when AE had them off
    var STROKE_FIELDS = { strokeColor: 1, strokeWidth: 1, strokeOverFill: 1 };
    var FILL_FIELDS = { fillColor: 1 };
    function deText(o, base) {
        var d = base || new TextDocument(o.text || "");
        var k, v;
        for (k in o) {
            if (!o.hasOwnProperty(k) || TEXT_LAST[k]) { continue; }
            if (o.applyStroke === false && STROKE_FIELDS[k]) { continue; }
            if (o.applyFill === false && FILL_FIELDS[k]) { continue; }
            v = o[k];
            if (k === "justification") { v = enumVal("ParagraphJustification", v); if (v === undefined) { continue; } }
            if (k === "pointText" || k === "boxText") { continue; }   // read-only, implied by boxTextSize
            try { d[k] = v; } catch (e) { }
        }
        for (k in TEXT_LAST) { if (o.hasOwnProperty(k)) { try { d[k] = o[k]; } catch (e2) { } } }
        return d;
    }

    function deMarker(o) {
        var m = new MarkerValue(o.comment || ""), k;
        for (k in o) {
            if (!o.hasOwnProperty(k) || k === "comment" || k === "params") { continue; }
            try { m[k] = o[k]; } catch (e) { }
        }
        if (o.params) { try { m.setParameters(o.params); } catch (e2) { } }
        return m;
    }

    // After Effects and EffectCraft sometimes store the same setting on different scales
    // (e.g. CC Jaws Completion 0..1 vs 0..100, Drop Shadow Opacity 0..255 vs 0..100).
    // The exporter records AE's range per property ("rng"); for older exports a small table helps.
    var KNOWN_RANGES = {
        "CC Jaws-0001": [0, 1],
        "ADBE Drop Shadow-0002": [0, 255],
        "ADBE Radial Shadow-0002": [0, 255]
    };
    var SCALE_RULES = [[1, 100], [255, 100], [100, 1], [100, 255], [1, 255], [255, 1]];
    function rangeFactor(node, prop) {
        if (node.vt !== "OneD") { return 1; }
        var ae = node.rng || KNOWN_RANGES[node.mn];
        if (!ae || ae[1] === null || ae[1] === undefined) { return 1; }
        var ecMax = null;
        try { if (prop.hasMax) { ecMax = prop.maxValue; } } catch (e) { }
        if (ecMax === null || Math.abs(ecMax - ae[1]) < 1e-9) { return 1; }
        for (var i = 0; i < SCALE_RULES.length; i++) {
            if (Math.abs(ae[1] - SCALE_RULES[i][0]) < 1e-9 && Math.abs(ecMax - SCALE_RULES[i][1]) < 1e-9) {
                bump(R.rescaled, node.mn + " (x" + (Math.round(ecMax / ae[1] * 10000) / 10000) + ")");
                return ecMax / ae[1];
            }
        }
        return 1;
    }

    function deValue(vt, v, prop) {
        if (vt === "SHAPE") { return deShape(v); }
        if (vt === "TEXT_DOCUMENT") {
            var base = null;
            try { base = prop.value; } catch (e) { }
            return deText(v, base);
        }
        if (vt === "MARKER") { return deMarker(v); }
        return v;
    }

    // ------------------------------------------------------------------ keyframes
    function eases(arr) {
        var out = [], i;
        for (i = 0; i < arr.length; i++) { out.push(new KeyframeEase(arr[i][0], arr[i][1])); }
        return out;
    }

    function applyKeys(prop, node) {
        var i, k, idx;
        try { while (prop.numKeys > 0) { prop.removeKey(prop.numKeys); } } catch (e0) { }
        var f = rangeFactor(node, prop);
        for (i = 0; i < node.k.length; i++) {
            k = node.k[i];
            try {
                prop.setValueAtTime(k.t, (f !== 1 && typeof k.v === "number") ? k.v * f : deValue(node.vt, k.v, prop));
                R.counts.keys++;
            } catch (e1) { bump(R.failedValues, node.mn + " (keyframe)"); }
        }
        for (i = 0; i < node.k.length; i++) {
            k = node.k[i];
            try { idx = prop.nearestKeyIndex(k.t); } catch (e2) { continue; }
            var ii = enumVal("KeyframeInterpolationType", k.ii);
            var oi = enumVal("KeyframeInterpolationType", k.oi);
            try { if (ii !== undefined && oi !== undefined) { prop.setInterpolationTypeAtKey(idx, ii, oi); } } catch (e3) { }
            try { if (k.tc !== undefined) { prop.setTemporalContinuousAtKey(idx, k.tc); } } catch (e4) { }
            try { prop.setTemporalAutoBezierAtKey(idx, false); } catch (e5) { }
            if (k.ie && k.oe && !(k.ii === "HOLD" && k.oi === "HOLD")) {
                try { prop.setTemporalEaseAtKey(idx, eases(k.ie), eases(k.oe)); } catch (e6) { bump(R.failedValues, node.mn + " (ease)"); }
            }
            try { if (ii !== undefined && oi !== undefined) { prop.setInterpolationTypeAtKey(idx, ii, oi); } } catch (e7) { }
            if (k.tab) { try { prop.setTemporalAutoBezierAtKey(idx, true); } catch (e8) { } }
            if (k.si && k.so) {
                try { prop.setSpatialTangentsAtKey(idx, k.si, k.so); } catch (e9) { }
                try { if (k.sc !== undefined) { prop.setSpatialContinuousAtKey(idx, k.sc); } } catch (e10) { }
                try { if (k.sab !== undefined) { prop.setSpatialAutoBezierAtKey(idx, k.sab); } } catch (e11) { }
            }
            if (k.lbl) { try { prop.setLabelAtKey(idx, k.lbl); } catch (e12) { } }
        }
        for (i = 0; i < node.k.length; i++) {
            if (node.k[i].rov) { try { prop.setRovingAtKey(prop.nearestKeyIndex(node.k[i].t), true); } catch (e13) { } }
        }
    }

    // ------------------------------------------------------------------ property tree
    function wantValue(node, opts) {
        if (node.v === undefined) { return false; }
        if (opts.applyAll || node.mod === undefined || node.mod === true) { return true; }
        return node.vt === "TEXT_DOCUMENT" || node.vt === "SHAPE";
    }

    function applyLeaf(prop, node, opts, ctx) {
        if (node.sep) {
            try { prop.dimensionsSeparated = true; } catch (e) { bump(R.unsupported, node.mn + " (separate dimensions)"); }
            return;
        }
        if (node.custom) { bump(R.customValues, ctx.path); }
        if (node.mn === "ADBE Time Remapping" && !ctx.layerNode.attrs.timeRemapEnabled) { return; }
        if (node.k && node.k.length) {
            applyKeys(prop, node);
            R.counts.props++;
        } else if (wantValue(node, opts)) {
            try {
                if (prop.numKeys > 0) { while (prop.numKeys > 0) { prop.removeKey(prop.numKeys); } }
                var fv = rangeFactor(node, prop);
                prop.setValue((fv !== 1 && typeof node.v === "number") ? node.v * fv : deValue(node.vt, node.v, prop));
                R.counts.props++;
            } catch (e1) { bump(R.failedValues, node.mn); }
        }
        if (node.x !== undefined) {
            try {
                prop.expression = node.x;
                try { prop.expressionEnabled = (node.xe !== false); } catch (e2) { }
                R.counts.expressions++;
            } catch (e3) { bump(R.failedValues, node.mn + " (expression)"); }
        }
    }

    function findChild(group, node) {
        var p = null;
        try { p = group.property(node.mn); } catch (e) { p = null; }
        if (!p && node.n) { try { p = group.property(node.n); } catch (e2) { p = null; } }
        if (!p && node.mn) {
            // effect parameters: "<effect match name>-0003" is the 3rd parameter in both apps
            var m = /-(\d{4})$/.exec(node.mn);
            if (m) { try { p = group.property(parseInt(m[1], 10)); } catch (e3) { p = null; } }
        }
        if (!p && node.mn) {
            // groups like text animator Properties hold children that must be added
            try { if (group.canAddProperty(node.mn)) { p = group.addProperty(node.mn); } } catch (e4) { p = null; }
        }
        return p;
    }

    // add an effect / shape item / animator: match name first, then the effect's display name,
    // then the (possibly renamed) instance name
    function addChild(group, c) {
        var tries = [c.mn], i, p = null;
        if (c.fx) { tries.push(c.fx); }
        if (c.n && c.n !== c.fx) { tries.push(c.n); }
        for (i = 0; i < tries.length && !p; i++) {
            try { if (group.canAddProperty(tries[i])) { p = group.addProperty(tries[i]); } } catch (e) { p = null; }
        }
        return p;
    }

    // a freshly added group may arrive with default children EffectCraft creates for you
    // (e.g. a text animator comes with a Range Selector); clear them before adding AE's own
    function clearIndexed(g) {
        try { while (g.numProperties > 0) { g.property(g.numProperties).remove(); } } catch (e) { }
    }

    function applyGroupAttrs(g, node) {
        if (node.en !== undefined) { try { if (g.enabled !== node.en) { g.enabled = node.en; } } catch (e) { } }
        if (node.mask) {
            var m = node.mask;
            setIf(g, "maskMode", enumVal("MaskMode", m.mode));
            setIf(g, "inverted", m.inverted);
            setIf(g, "rotoBezier", m.rotoBezier);
            setIf(g, "maskMotionBlur", enumVal("MaskMotionBlur", m.motionBlur));
            setIf(g, "maskFeatherFalloff", enumVal("MaskFeatherFalloff", m.featherFalloff));
            setIf(g, "color", m.color);
        }
    }

    function anyModified(node) {
        if (node.mod === true || (node.k && node.k.length) || node.x !== undefined) { return true; }
        if (node.ch) { for (var i = 0; i < node.ch.length; i++) { if (anyModified(node.ch[i])) { return true; } } }
        return false;
    }

    function applyChildren(group, node, opts, ctx) {
        if (!node.ch) { return; }
        var i, c, p, path = ctx.path, fresh = ctx.fresh;
        if (node.pt === "I" && fresh) { clearIndexed(group); }
        for (i = 0; i < node.ch.length; i++) {
            c = node.ch[i];
            ctx.path = path + " > " + (c.n || c.mn);
            ctx.fresh = fresh;
            if (node.pt === "I") {
                p = addChild(group, c);
                ctx.fresh = true;
                if (!p) {
                    if (node.mn === "ADBE Effect Parade") { bump(R.missingEffects, c.n + " [" + c.mn + "]"); }
                    else { bump(R.unsupported, c.mn); }
                    continue;
                }
                if (node.mn === "ADBE Effect Parade") { R.counts.effects++; }
                if (c.mn === "ADBE Mask Atom") { R.counts.masks++; }
                try { if (c.n && p.name !== c.n) { p.name = c.n; } } catch (e2) { }
            } else {
                p = findChild(group, c);
                // only report missing properties that carry something the user changed
                if (!p) { if (anyModified(c)) { bump(R.unsupported, c.mn); } continue; }
            }
            applyNode(p, c, opts, ctx);
        }
        ctx.path = path;
        ctx.fresh = fresh;
    }

    function applyNode(p, node, opts, ctx) {
        if (node.pt === "P") { applyLeaf(p, node, opts, ctx); return; }
        applyGroupAttrs(p, node);
        applyChildren(p, node, opts, ctx);
    }

    // Layer styles: EffectCraft adds a style through its Layer > Layer Styles menu,
    // then the style's properties are found by their display names.
    function applyLayerStyles(layer, node, opts, ctx) {
        if (!node.ch) { return; }
        var i, c, ls, st;
        for (i = 0; i < node.ch.length; i++) {
            c = node.ch[i];
            if (c.mn === "ADBE Blend Options Group") { continue; }
            if (!(c.en === true && anyModified(c)) && !(c.mod === true)) { continue; }
            ls = null; st = null;
            try { ls = layer.property("ADBE Layer Styles"); } catch (e0) { }
            if (ls) { st = findChild(ls, c); }
            var STYLE_KEYS = { "dropShadow/enabled": "dropShadow", "innerShadow/enabled": "innerShadow",
                "outerGlow/enabled": "outerGlow", "innerGlow/enabled": "innerGlow", "bevelEmboss/enabled": "bevelEmboss",
                "chromeFX/enabled": "satin", "solidFill/enabled": "colorOverlay", "gradientFill/enabled": "gradientOverlay",
                "frameFX/enabled": "stroke" };
            if (!st && STYLE_KEYS[c.mn]) {
                try {
                    ec("layer.style.add", { style: STYLE_KEYS[c.mn], layers: [layer.id] });
                    ls = layer.property("ADBE Layer Styles");
                    st = ls ? findChild(ls, c) : null;
                } catch (eSt) { st = null; }
            }
            if (!st) {
                try {
                    var comp = layer.containingComp, j;
                    for (j = 1; j <= comp.numLayers; j++) { comp.layer(j).selected = false; }
                    layer.selected = true;
                    app.executeCommand(app.findMenuCommandId(c.n));
                    ls = layer.property("ADBE Layer Styles");
                    st = ls ? findChild(ls, c) : null;
                    layer.selected = false;
                } catch (e1) { st = null; }
            }
            if (!st) { bump(R.unsupported, "Layer style: " + c.n); continue; }
            R.counts.layerStyles++;
            ctx.path = "Layer Styles > " + c.n;
            applyNode(st, c, opts, ctx);
        }
        // blending options last (needs the style group to exist)
        for (i = 0; i < node.ch.length; i++) {
            c = node.ch[i];
            if (c.mn !== "ADBE Blend Options Group" || !anyModified(c)) { continue; }
            try { ls = layer.property("ADBE Layer Styles"); st = ls ? findChild(ls, c) : null; } catch (e2) { st = null; }
            if (st) { applyNode(st, c, opts, ctx); }
        }
    }

    // ------------------------------------------------------------------ items
    function remapPath(p, opts) {
        if (!p) { return p; }
        var norm = p.replace(/\\/g, "/"), i, from, to;
        for (i = 0; i < opts.pathMap.length; i++) {
            from = String(opts.pathMap[i][0]).replace(/\\/g, "/");
            to = String(opts.pathMap[i][1]).replace(/\\/g, "/");
            if (norm.toLowerCase().indexOf(from.toLowerCase()) === 0) { return to + norm.substring(from.length); }
        }
        return norm;
    }

    function importFootage(it, opts) {
        if (it.kind === "solid") { return null; }      // solids are recreated per layer
        var item = null, path = null, why = null, madePlaceholder = false;
        if (it.kind === "file" && it.file) {
            path = remapPath(it.file, opts);
            // Import straight away: EffectCraft only lets scripts *check* files inside the
            // project's folder (File.exists is false elsewhere), but importing works anywhere.
            try {
                var io = new ImportOptions(new File(path));
                if (it.sequence) { try { io.sequence = true; } catch (e0) { } }
                item = app.project.importFile(io);
                R.counts.footage++;
            } catch (e1) {
                why = String(e1);
            }
            if (!item) { R.missingFootage.push({ name: it.name, file: it.file, tried: path, error: why }); }
        }
        if (!item) {
            try {
                item = app.project.importPlaceholder(it.name, it.width || 1920, it.height || 1080,
                    it.frameRate || 30, it.duration || 10);
                R.counts.placeholders++;
                madePlaceholder = true;
                // remember where the file should be, for effectcraft/AE2EC_Relink.jsx
                if (path) { try { item.comment = "ae2ec:" + path; } catch (eC) { } }
            } catch (e2) { note("Could not create placeholder for " + it.name + ": " + e2); return null; }
        }
        try { item.name = it.name; } catch (e3) { }
        var ip = it.interp || {}, ms = null;
        try { ms = item.mainSource; } catch (eMs) { }
        if (!madePlaceholder) {
            var curStill = false;
            try { curStill = ms && ms.isStill === true; } catch (eSt) { }
            if (it.isStill === false && it.hasVideo !== false && curStill) {
                note("'" + it.name + "' is animated in After Effects but EffectCraft imported it as a still (" +
                    (it.duration ? it.duration + " s" : "") + "). Convert it to a video or image sequence.");
            }
            // interpretation: frame rate (image sequences default to 30 fps in EffectCraft), alpha, loop, aspect
            var params = { items: [item.id] }, change = false, targetFps = ip.conformFrameRate || it.frameRate;
            try {
                if (it.hasVideo !== false && it.isStill === false && targetFps && !curStill &&
                        Math.abs(item.frameRate - targetFps) > 0.0005) { params.frameRate = targetFps; change = true; }
            } catch (eFr) { }
            var alphaMap = { IGNORE: "ignore", STRAIGHT: "straight", PREMULTIPLIED: "premultiplied" };
            if (ip.alphaMode && alphaMap[ip.alphaMode] && ip.alphaMode !== "STRAIGHT") { params.alpha = alphaMap[ip.alphaMode]; change = true; }
            if (ip.invertAlpha) { params.invertAlpha = true; change = true; }
            if (ip.loop && ip.loop > 1) { params.loop = ip.loop; change = true; }
            var fieldMap = { OFF: "off", UPPER_FIELD_FIRST: "upper", LOWER_FIELD_FIRST: "lower" };
            if (ip.fieldSeparationType && ip.fieldSeparationType !== "OFF" && fieldMap[ip.fieldSeparationType]) { params.fields = fieldMap[ip.fieldSeparationType]; change = true; }
            try { if (it.pixelAspect && Math.abs(item.pixelAspect - it.pixelAspect) > 0.0001) { params.pixelAspect = it.pixelAspect; change = true; } } catch (ePa) { }
            if (change) {
                try { ec("file.interpretFootage", params); R.counts.interpreted = (R.counts.interpreted || 0) + 1; }
                catch (eIn) { note("Could not set interpretation of '" + it.name + "' (" + JSON.stringify(params) + "): " + eIn); }
            }
            // image sequences with gaps: AE spans the whole number range, EffectCraft only the files present
            try {
                if (it.sequence && it.duration && Math.abs(item.duration - it.duration) > 1.5 / (targetFps || 30)) {
                    note("Image sequence '" + it.name + "' is " + (Math.round(it.duration * 1000) / 1000) + " s in After Effects but " +
                        (Math.round(item.duration * 1000) / 1000) + " s in EffectCraft: frames are probably missing on disk (AE holds over gaps).");
                }
            } catch (eSq) { }
        }
        return item;
    }

    function createComp(it) {
        var c = app.project.items.addComp(it.name, it.width, it.height, it.pixelAspect || 1,
            Math.max(it.duration, 1 / it.frameRate), it.frameRate);
        setIf(c, "bgColor", it.bgColor);
        setIf(c, "displayStartTime", it.displayStartTime);
        setIf(c, "motionBlur", it.motionBlur);
        setIf(c, "shutterAngle", it.shutterAngle);
        setIf(c, "shutterPhase", it.shutterPhase);
        setIf(c, "motionBlurSamplesPerFrame", it.motionBlurSamplesPerFrame);
        setIf(c, "motionBlurAdaptiveSampleLimit", it.motionBlurAdaptiveSampleLimit);
        setIf(c, "frameBlending", it.frameBlending);
        setIf(c, "hideShyLayers", it.hideShyLayers);
        setIf(c, "draft3d", it.draft3d);
        setIf(c, "preserveNestedFrameRate", it.preserveNestedFrameRate);
        setIf(c, "preserveNestedResolution", it.preserveNestedResolution);
        setIf(c, "workAreaStart", it.workAreaStart);
        setIf(c, "workAreaDuration", it.workAreaDuration);
        R.counts.comps++;
        return c;
    }

    // ------------------------------------------------------------------ layers
    function findNode(props, mn) {
        if (!props) { return null; }
        for (var i = 0; i < props.length; i++) { if (props[i].mn === mn) { return props[i]; } }
        return null;
    }

    function textDocOf(L) {
        var t = findNode(L.props, "ADBE Text Properties");
        var d = t ? findNode(t.ch, "ADBE Text Document") : null;
        if (!d) { return null; }
        if (d.v) { return d.v; }
        if (d.k && d.k.length) { return d.k[0].v; }
        return null;
    }

    function createLayer(comp, L, itemMap) {
        var lay = null, a = L.attrs || {};
        var dur = comp.duration;
        switch (L.type) {
            case "text":
                var td = textDocOf(L) || {};
                if (td.boxTextSize && (td.boxText || td.pointText === false)) { lay = comp.layers.addBoxText(td.boxTextSize, td.text || ""); }
                else { lay = comp.layers.addText(td.text || ""); }
                break;
            case "shape": lay = comp.layers.addShape(); break;
            case "null": lay = comp.layers.addNull(dur); break;
            case "camera": lay = comp.layers.addCamera(L.name, [comp.width / 2, comp.height / 2]); break;
            case "light":
                lay = comp.layers.addLight(L.name, [comp.width / 2, comp.height / 2]);
                setIf(lay, "lightType", enumVal("LightType", a.lightType));
                break;
            case "solid":
                var s = L.solid || {};
                lay = comp.layers.addSolid(s.color || [0, 0, 0], s.name || L.name, s.width || comp.width,
                    s.height || comp.height, s.pixelAspect || 1, dur);
                break;
            default:
                var src = itemMap[L.sourceId];
                if (src) {
                    lay = comp.layers.add(src);
                } else {
                    note("Layer '" + L.name + "' in '" + comp.name + "': source missing, replaced by a null");
                    lay = comp.layers.addNull(dur);
                }
        }
        R.counts.layers++;
        return lay;
    }

    function applyLayerAttrs(lay, L) {
        var a = L.attrs || {};
        setIf(lay, "name", L.name);   // always: EffectCraft numbers duplicate footage names ("clip 2")
        setIf(lay, "label", a.label);
        setIf(lay, "comment", a.comment);
        setIf(lay, "threeDLayer", a.threeDLayer);
        setIf(lay, "threeDPerChar", a.threeDPerChar);
        if (a.adjustmentLayer) { setIf(lay, "adjustmentLayer", true); }
        if (a.guideLayer) { setIf(lay, "guideLayer", true); }
        if (a.collapseTransformation) { setIf(lay, "collapseTransformation", true); }
        if (a.environmentLayer) { setIf(lay, "environmentLayer", true); }
        setIf(lay, "motionBlur", a.motionBlur);
        setIf(lay, "effectsActive", a.effectsActive);
        setIf(lay, "preserveTransparency", a.preserveTransparency);
        setIf(lay, "blendingMode", enumVal("BlendingMode", a.blendingMode));
        setIf(lay, "quality", enumVal("LayerQuality", a.quality));
        setIf(lay, "samplingQuality", enumVal("LayerSamplingQuality", a.samplingQuality));
        setIf(lay, "frameBlendingType", enumVal("FrameBlendingType", a.frameBlendingType));
        setIf(lay, "autoOrient", enumVal("AutoOrientType", a.autoOrient));
        if (a.timeRemapEnabled) { setIf(lay, "timeRemapEnabled", true); }
        if (a.stretch !== undefined && a.stretch !== 100) { setIf(lay, "stretch", a.stretch); }
        setIf(lay, "startTime", a.startTime);
        setIf(lay, "inPoint", a.inPoint);
        setIf(lay, "outPoint", a.outPoint);
    }

    function applyMatte(lay, L, layers) {
        if (!L.matte) { return; }
        var type = enumVal("TrackMatteType", L.matte.type);
        if (L.matte.layer && L.matte.layer !== L.index - 1) {
            var target = layers[L.matte.layer];
            var kindMap = { ALPHA: "alpha", ALPHA_INVERTED: "alphaInverted", LUMA: "luma", LUMA_INVERTED: "lumaInverted" };
            if (target) {
                try { ec("layer.setTrackMatte", { layer: lay.id, matte: target.id, kind: kindMap[L.matte.type] || "alpha" }); return; }
                catch (e) { note("Layer '" + L.name + "': could not use layer " + L.matte.layer + " as its track matte (" + e + "); used the layer above"); }
            }
        }
        setIf(lay, "trackMatteType", type);
    }

    function buildComp(comp, it, itemMap, opts) {
        var Ls = it.layers || [], layers = [], i, L, lay;
        // add bottom-up: each new layer goes on top, so the final order matches AE
        for (i = Ls.length - 1; i >= 0; i--) {
            L = Ls[i];
            step(comp.name + ": making " + L.name);
            try { lay = createLayer(comp, L, itemMap); } catch (e) { note("Could not create layer '" + L.name + "': " + e); lay = null; }
            layers[L.index] = lay;
            if (lay) { try { applyLayerAttrs(lay, L); } catch (e1) { note("Layer attrs '" + L.name + "': " + e1); } }
        }
        for (i = 0; i < Ls.length; i++) {        // parenting before transforms
            L = Ls[i];
            if (L.parent && layers[L.index] && layers[L.parent]) {
                try { layers[L.index].parent = layers[L.parent]; } catch (e2) { bump(R.failedValues, "parent"); }
            }
        }
        for (i = 0; i < Ls.length; i++) {        // properties
            L = Ls[i]; lay = layers[L.index];
            step(comp.name + ": setting up " + L.name);
            if (!lay) { continue; }
            var ctx = { layerNode: L, path: comp.name + " > " + L.name };
            var j, p, n;
            for (j = 0; j < (L.props || []).length; j++) {
                n = L.props[j];
                ctx.path = comp.name + " > " + L.name + " > " + n.n;
                if (n.mn === "ADBE Layer Styles") { applyLayerStyles(lay, n, opts, ctx); continue; }
                p = findChild(lay, n);
                if (!p) { if (anyModified(n)) { bump(R.unsupported, n.mn); } continue; }
                try { applyNode(p, n, opts, ctx); } catch (e3) { note(ctx.path + ": " + e3); }
            }
        }
        for (i = 0; i < Ls.length; i++) {        // mattes, then switches that depend on them
            L = Ls[i]; lay = layers[L.index];
            if (!lay) { continue; }
            applyMatte(lay, L, layers);
            var a = L.attrs || {};
            setIf(lay, "enabled", a.enabled);
            setIf(lay, "audioEnabled", a.audioEnabled);
            if (a.solo) { setIf(lay, "solo", true); }
            if (a.shy) { setIf(lay, "shy", true); }
        }
        for (i = 0; i < Ls.length; i++) {        // lock last
            if (Ls[i].attrs && Ls[i].attrs.locked && layers[Ls[i].index]) { setIf(layers[Ls[i].index], "locked", true); }
        }
        if (it.markers && it.markers.length) {
            try { applyKeys(comp.markerProperty, { mn: "comp markers", vt: "MARKER", k: it.markers }); } catch (e4) { note("Comp markers in '" + comp.name + "': " + e4); }
        }
    }

    // ------------------------------------------------------------------ main
    function load() {
        if (typeof AE2EC_DATA !== "undefined" && AE2EC_DATA) { return AE2EC_DATA; }
        if (typeof AE2EC_JSON_PATH !== "undefined" && AE2EC_JSON_PATH) {
            var f = new File(AE2EC_JSON_PATH);
            f.encoding = "UTF-8";
            if (!f.open("r")) { throw new Error("Cannot open " + AE2EC_JSON_PATH); }
            var txt = f.read();
            f.close();
            return JSON.parse(txt);
        }
        throw new Error("No input: define AE2EC_DATA or AE2EC_JSON_PATH before running the importer");
    }

    function run() {
        var data = load(), k;
        if (data.format !== "ae2ec") { throw new Error("Not an ae2ec export (format = " + data.format + ")"); }
        if (data.formatVersion > 1) { note("File is format version " + data.formatVersion + "; this importer knows version 1"); }
        var opts = {}, user = (typeof AE2EC_OPTIONS !== "undefined" && AE2EC_OPTIONS) ? AE2EC_OPTIONS : {};
        for (k in DEFAULTS) { opts[k] = DEFAULTS[k]; }
        for (k in user) { if (user.hasOwnProperty(k)) { opts[k] = user[k]; } }
        P.fn = typeof opts.progress === "function" ? opts.progress : null;
        P.total = 0;
        for (k = 0; k < (data.items || []).length; k++) {
            var item = data.items[k];
            P.total += item.type === "footage" ? 1 : item.type === "comp" ? 2 * (item.layers || []).length : 0;
        }

        app.beginUndoGroup("Import After Effects project (ae2ec)");
        var items = data.items || [], itemMap = {}, i, it, made;

        var root = null;
        if (opts.rootFolder) {
            root = app.project.items.addFolder((data.project && data.project.name ? data.project.name : "AE project") + " (from AE)");
        }
        for (i = 0; i < items.length; i++) {              // 1. folders
            it = items[i];
            if (it.type !== "folder") { continue; }
            itemMap[it.id] = app.project.items.addFolder(it.name);
            R.counts.folders++;
        }
        for (i = 0; i < items.length; i++) {              // 2. footage
            it = items[i];
            if (it.type !== "footage") { continue; }
            step("Footage: " + it.name);
            made = importFootage(it, opts);
            if (made) { itemMap[it.id] = made; }
        }
        for (i = 0; i < items.length; i++) {              // 3. empty comps (so precomps can be referenced)
            it = items[i];
            if (it.type !== "comp") { continue; }
            try { itemMap[it.id] = createComp(it); } catch (e) { note("Could not create comp '" + it.name + "': " + e); }
        }
        for (i = 0; i < items.length; i++) {              // 4. folder structure
            it = items[i];
            if (!itemMap[it.id]) { continue; }
            var parent = it.parentId ? itemMap[it.parentId] : root;
            if (parent) { try { itemMap[it.id].parentFolder = parent; } catch (e2) { } }
            if (it.label !== undefined) { setIf(itemMap[it.id], "label", it.label); }
            if (it.comment) {
                var cur = "";
                try { cur = String(itemMap[it.id].comment || ""); } catch (eCm) { }
                if (cur.indexOf("ae2ec:") !== 0) { setIf(itemMap[it.id], "comment", it.comment); }   // keep relink info
            }
        }
        for (i = 0; i < items.length; i++) {              // 5. layers
            it = items[i];
            if (it.type !== "comp" || !itemMap[it.id]) { continue; }
            try { buildComp(itemMap[it.id], it, itemMap, opts); } catch (e3) {
                if (e3 === CANCELLED) { throw e3; }
                note("Comp '" + it.name + "': " + e3); R.ok = false;
            }
        }
        app.endUndoGroup();

        if (opts.openComp && data.project && data.project.activeItemId && itemMap[data.project.activeItemId]) {
            try { itemMap[data.project.activeItemId].openInViewer(); } catch (e4) { }
        }
        if (opts.save) {
            try { app.project.save(new File(opts.save)); R.saved = opts.save; } catch (e5) { note("Save failed: " + e5); R.ok = false; }
        }
        R.source = { file: data.project ? data.project.file : null, exporter: data.exporter, host: data.host };
        // keep the report inside the project too (scripts can't write files): the import folder's comment
        if (root) { try { root.comment = "ae2ec import report\n" + JSON.stringify(R); } catch (eRc) { } }
        return R;
    }

    var report;
    try {
        report = run();
    } catch (err) {
        R.ok = false;
        R.error = String(err) + (err && err.line ? " (line " + err.line + ")" : "");
        if (err === CANCELLED) { R.cancelled = true; }
        try { app.endUndoGroup(); } catch (e) { }
        report = R;
    }
    var text = JSON.stringify(report, null, 1);
    try { writeLn("AE2EC_REPORT_BEGIN"); writeLn(text); writeLn("AE2EC_REPORT_END"); } catch (e6) { }
    return text;
})();

AE2EC_IMPORT;
