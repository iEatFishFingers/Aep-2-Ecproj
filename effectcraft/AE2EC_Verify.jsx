/*
 * AE2EC_Verify.jsx  -  run in EffectCraft after an import.
 *
 * Re-exports the open EffectCraft project with the exporter's own code (EffectCraft runs the
 * After Effects scripting model) and compares it with the original After Effects export:
 * footage frame rates and durations, comp settings, every layer's timing, switches, parent and
 * matte, and every property AE recorded (values, keyframes, eases, expressions).
 *
 * Only what After Effects wrote is checked, so properties left at their defaults in AE are not
 * reported. Built by:  tools\build-script.ps1 -Verify -Json <export.ae2ec.json>
 * (globals: AE2EC_SOURCE = the export, AE2EC = the exporter; prints AE2EC_VERIFY_BEGIN/END).
 */

var AE2EC_VERIFY = (function () {
    var src = AE2EC_SOURCE;
    var dst = AE2EC.exportProject({ includeUnmodified: true }).data;
    var V = { ok: true, checked: { items: 0, layers: 0, props: 0, keys: 0 }, byKind: {}, samples: [] };

    function diff(kind, where, a, b) {
        V.byKind[kind] = (V.byKind[kind] || 0) + 1;
        if (V.samples.length < 150) { V.samples.push(where + ": " + JSON.stringify(a) + " -> " + JSON.stringify(b)); }
    }

    function near(a, b) {
        if (typeof a === "number" && typeof b === "number") { return Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(a)); }
        if (a instanceof Array && b instanceof Array) {
            if (a.length !== b.length) {
                // EffectCraft may report 3 values where AE stored 2 (2D position on a layer); compare the common part
                var n = Math.min(a.length, b.length), i;
                for (i = 0; i < n; i++) { if (!near(a[i], b[i])) { return false; } }
                return true;
            }
            for (var j = 0; j < a.length; j++) { if (!near(a[j], b[j])) { return false; } }
            return true;
        }
        if (a && b && typeof a === "object" && typeof b === "object") {
            for (var k in a) {
                if (!a.hasOwnProperty(k) || !b.hasOwnProperty(k)) { continue; }   // only fields both sides know
                if (!near(a[k], b[k])) { return false; }
            }
            return true;
        }
        return a === b;
    }

    // text: compare what matters visually
    var TEXT_KEYS = ["text", "fontSize", "fillColor", "applyFill", "strokeColor", "applyStroke", "strokeWidth",
        "tracking", "leading", "justification", "font"];
    var STROKE_KEYS = { strokeColor: 1, strokeWidth: 1 };
    function nearText(a, b) {
        for (var i = 0; i < TEXT_KEYS.length; i++) {
            var k = TEXT_KEYS[i];
            if (a.applyStroke === false && STROKE_KEYS[k]) { continue; }   // invisible when stroke is off
            if (a.applyFill === false && k === "fillColor") { continue; }
            if (a.hasOwnProperty(k) && b.hasOwnProperty(k) && !near(a[k], b[k])) { return false; }
        }
        return true;
    }

    function valueEq(vt, a, b) {
        if (vt === "TEXT_DOCUMENT") { return nearText(a || {}, b || {}); }
        return near(a, b);
    }

    // find the child of `dstParent` matching `node`: same match name (same occurrence), else the
    // same effect display name / name at the same position, else effect parameter "-000N" by index
    function matchChild(dstChildren, node, srcSiblings, idx) {
        if (!dstChildren) { return null; }
        var occ = 0, i;
        for (i = 0; i < idx; i++) { if (srcSiblings[i].mn === node.mn) { occ++; } }
        for (i = 0; i < dstChildren.length; i++) {
            if (dstChildren[i].mn === node.mn) { if (occ === 0) { return dstChildren[i]; } occ--; }
        }
        if (node.i !== undefined) {
            for (i = 0; i < dstChildren.length; i++) { if (dstChildren[i].i === node.i) { return dstChildren[i]; } }
        }
        for (i = 0; i < dstChildren.length; i++) { if (node.n && dstChildren[i].n === node.n) { return dstChildren[i]; } }
        var m = /-(\d{4})$/.exec(node.mn || "");
        if (m) {
            var want = parseInt(m[1], 10);
            for (i = 0; i < dstChildren.length; i++) {
                var dm = /-(\d{4})$/.exec(dstChildren[i].mn || "");
                if (dm && parseInt(dm[1], 10) === want) { return dstChildren[i]; }
            }
        }
        return null;
    }

    var KNOWN_RANGES = { "CC Jaws-0001": [0, 1], "ADBE Drop Shadow-0002": [0, 255], "ADBE Radial Shadow-0002": [0, 255] };
    var SCALE_RULES = [[1, 100], [255, 100], [100, 1], [100, 255], [1, 255], [255, 1]];
    function factor(s, d) {
        var a = s.rng || KNOWN_RANGES[s.mn], b = d.rng;
        if (!a || !b || a[1] === null || b[1] === null || a[1] === b[1]) { return 1; }
        for (var i = 0; i < SCALE_RULES.length; i++) {
            if (a[1] === SCALE_RULES[i][0] && b[1] === SCALE_RULES[i][1]) { return b[1] / a[1]; }
        }
        return 1;
    }
    function scaled(v, f) { return (f !== 1 && typeof v === "number") ? v * f : v; }

    function cmpNode(s, d, where) {
        if (s.pt === "P") {
            V.checked.props++;
            if (s.sep) { if (!d.sep) { diff("separate dimensions", where, true, false); } return; }
            if (s.k && s.k.length) {
                if (!d.k || d.k.length !== s.k.length) { diff("keyframe count", where, s.k.length, d.k ? d.k.length : 0); return; }
                var fk = factor(s, d);
                for (var i = 0; i < s.k.length; i++) {
                    var a = s.k[i], b = d.k[i], w = where + " key " + (i + 1);
                    V.checked.keys++;
                    if (!near(a.t, b.t)) { diff("keyframe time", w, a.t, b.t); }
                    if (!valueEq(s.vt, scaled(a.v, fk), b.v)) { diff("keyframe value", w, scaled(a.v, fk), b.v); }
                    if (a.ii !== b.ii || a.oi !== b.oi) { diff("keyframe interpolation", w, [a.ii, a.oi], [b.ii, b.oi]); }
                    if (a.ie && b.ie && a.oi !== "HOLD" && a.ii !== "HOLD" && !(near(a.ie[0], b.ie[0]) && near(a.oe[0], b.oe[0]))) {
                        diff("keyframe ease", w, [a.ie[0], a.oe[0]], [b.ie[0], b.oe[0]]);
                    }
                }
            } else if (s.v !== undefined && s.mod !== false) {
                if (d.k && d.k.length) { diff("unexpected keyframes", where, s.v, "keyframed"); }
                else if (d.v === undefined) { diff("value missing", where, s.v, null); }
                else if (!valueEq(s.vt, scaled(s.v, factor(s, d)), d.v)) { diff("value", where, scaled(s.v, factor(s, d)), d.v); }
            }
            if (s.x !== undefined) {
                var sx = String(s.x).replace(/\r\n?/g, "\n"), dx = d.x === undefined ? null : String(d.x).replace(/\r\n?/g, "\n");
                if (sx !== dx) { diff("expression", where, s.x, d.x); }
            }
            return;
        }
        if (s.en !== undefined && d.en !== undefined && s.en !== d.en) { diff("enabled switch", where, s.en, d.en); }
        if (s.mask && d.mask && s.mask.mode !== d.mask.mode) { diff("mask mode", where, s.mask.mode, d.mask.mode); }
        var ch = s.ch || [], i2, dc;
        for (i2 = 0; i2 < ch.length; i2++) {
            // only follow branches AE actually recorded something in
            dc = matchChild(d.ch, ch[i2], ch, i2);
            if (!dc) {
                if (hasData(ch[i2])) { diff("missing in EffectCraft", where + " > " + (ch[i2].n || ch[i2].mn), ch[i2].mn, null); }
                continue;
            }
            cmpNode(ch[i2], dc, where + " > " + (ch[i2].n || ch[i2].mn));
        }
    }

    function hasData(n) {
        if (n.mod === true || (n.k && n.k.length) || n.x !== undefined) { return true; }
        if (n.ch) { for (var i = 0; i < n.ch.length; i++) { if (hasData(n.ch[i])) { return true; } } }
        return false;
    }

    var LAYER_KEYS = ["inPoint", "outPoint", "startTime", "stretch", "enabled", "threeDLayer", "blendingMode",
        "adjustmentLayer", "collapseTransformation", "motionBlur", "timeRemapEnabled", "solo", "shy"];

    function cmpLayer(s, d, where) {
        V.checked.layers++;
        if (s.name !== d.name) { diff("layer name", where, s.name, d.name); }
        if (s.type !== d.type) { diff("layer type", where, s.type, d.type); }
        for (var i = 0; i < LAYER_KEYS.length; i++) {
            var k = LAYER_KEYS[i], a = s.attrs[k], b = d.attrs[k];
            if (a === undefined || b === undefined) { continue; }
            if (!near(a, b)) { diff("layer " + k, where, a, b); }
        }
        if ((s.parent || null) !== (d.parent || null)) { diff("parent", where, s.parent, d.parent); }
        var sm = s.matte ? s.matte.type : null, dm = d.matte ? d.matte.type : null;
        if (sm !== dm) { diff("track matte", where, sm, dm); }
        var props = s.props || [];
        for (var j = 0; j < props.length; j++) {
            var dp = matchChild(d.props, props[j], props, j);
            if (!dp) { if (hasData(props[j])) { diff("missing in EffectCraft", where + " > " + props[j].n, props[j].mn, null); } continue; }
            cmpNode(props[j], dp, where + " > " + props[j].n);
        }
    }

    // pair items by type + name (in order, so duplicates pair up)
    var pool = {}, i, it, key;
    for (i = 0; i < dst.items.length; i++) {
        key = dst.items[i].type + ":" + dst.items[i].name;
        (pool[key] = pool[key] || []).push(dst.items[i]);
    }
    for (i = 0; i < src.items.length; i++) {
        it = src.items[i];
        if (it.type === "folder" || (it.type === "footage" && it.kind === "solid")) { continue; }
        key = it.type + ":" + it.name;
        var d = pool[key] && pool[key].length ? pool[key].shift() : null;
        V.checked.items++;
        if (!d) { diff("item missing", key, it.name, null); continue; }
        if (it.type === "footage") {
            if (d.kind === "placeholder" && it.kind !== "placeholder") { diff("footage not linked", key, it.file, "placeholder"); }
            if (it.isStill === false && it.hasVideo !== false) {
                if (it.frameRate && d.frameRate && !near(it.frameRate, d.frameRate)) { diff("footage frame rate", key, it.frameRate, d.frameRate); }
                if (it.duration && d.duration && Math.abs(it.duration - d.duration) > 1.5 / (it.frameRate || 30)) { diff("footage duration", key, it.duration, d.duration); }
            }
            if (it.isStill === false && it.hasVideo !== false && d.isStill === true) { diff("animated footage imported as still", key, it.duration, 0); }
        }
        if (it.type === "comp") {
            var CK = ["width", "height", "frameRate", "duration", "workAreaStart", "workAreaDuration", "bgColor"];
            for (var c = 0; c < CK.length; c++) {
                if (it[CK[c]] !== undefined && d[CK[c]] !== undefined && !near(it[CK[c]], d[CK[c]])) { diff("comp " + CK[c], key, it[CK[c]], d[CK[c]]); }
            }
            if (it.layers.length !== d.layers.length) { diff("layer count", key, it.layers.length, d.layers.length); }
            for (var l = 0; l < Math.min(it.layers.length, d.layers.length); l++) {
                cmpLayer(it.layers[l], d.layers[l], it.name + " > #" + it.layers[l].index + " " + it.layers[l].name);
            }
        }
    }

    for (key in V.byKind) { if (V.byKind.hasOwnProperty(key)) { V.ok = false; } }
    var text = JSON.stringify(V, null, 1);
    try { writeLn("AE2EC_VERIFY_BEGIN"); writeLn(text); writeLn("AE2EC_VERIFY_END"); } catch (e) { }
    return text;
})();

AE2EC_VERIFY;
