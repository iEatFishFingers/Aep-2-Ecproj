/*
 * tests/roundtrip.jsx  -  run inside EffectCraft (it speaks the AE scripting model).
 *
 * 1. builds a fixture project that touches every feature the exporter handles
 * 2. exports it with ae/AE2EC_Export.jsx (core functions only, no dialog)
 * 3. imports that into a fresh project with effectcraft/AE2EC_Import.jsx
 * 4. exports again and compares the two exports
 * 5. imports the export without the null's Anchor Point (as exporter 1.1 and older wrote it) and
 *    checks the null gets After Effects' default
 *
 * EffectCraft scripts cannot include other files, so this runs as part of a
 * combined script built by tools/build-script.ps1 -Test (see docs/testing.md).
 * Optional global: AE2EC_WRITE_FIXTURE = path to save the first export to.
 * The last expression is a JSON summary: { ok, differences: [...], report }.
 */

(function () {
    var out = { ok: true, differences: [] };

    function buildFixture() {
        app.beginUndoGroup("ae2ec fixture");
        var fold = app.project.items.addFolder("Precomps");
        var inner = app.project.items.addComp("Inner", 800, 600, 1, 4, 25);
        inner.parentFolder = fold;
        inner.bgColor = [0.2, 0.1, 0.3];
        var bg = inner.layers.addSolid([0.1, 0.6, 0.9], "Inner BG", 800, 600, 1);
        bg.property("ADBE Transform Group").property("ADBE Opacity").setValue(80);

        var c = app.project.items.addComp("Main", 1920, 1080, 1, 6, 30);
        c.bgColor = [0.05, 0.05, 0.08];
        c.workAreaStart = 1; c.workAreaDuration = 3;
        c.markerProperty.setValueAtTime(2, new MarkerValue("Drop"));

        // bottom of the stack first
        var solid = c.layers.addSolid([1, 0.2, 0.2], "Red Solid", 600, 400, 1);
        var tr = solid.property("ADBE Transform Group");
        var pos = tr.property("ADBE Position");
        pos.setValueAtTime(0, [300, 300]);
        pos.setValueAtTime(1.5, [1500, 700]);
        pos.setValueAtTime(3, [960, 540]);
        pos.setTemporalEaseAtKey(2, [new KeyframeEase(0, 80)], [new KeyframeEase(0, 40)]);
        pos.setInterpolationTypeAtKey(3, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
        pos.setSpatialTangentsAtKey(2, [-200, 0], [200, 0]);
        var sc = tr.property("ADBE Scale");
        sc.setValueAtTime(0, [50, 50]); sc.setValueAtTime(2, [120, 100]);
        sc.setTemporalEaseAtKey(1, [new KeyframeEase(0, 33), new KeyframeEase(0, 33)], [new KeyframeEase(0, 66), new KeyframeEase(0, 50)]);
        tr.property("ADBE Rotate Z").expression = "wiggle(2, 15)";
        solid.blendingMode = BlendingMode.SCREEN;
        solid.label = 3;
        var fx = solid.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
        fx.property(1).setValue(14);
        var glow = solid.property("ADBE Effect Parade").addProperty("ADBE Glo2");
        glow.name = "My Glow";
        glow.enabled = false;
        var mk = solid.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        var shp = new Shape();
        shp.vertices = [[0, 0], [600, 0], [600, 400], [0, 400]];
        shp.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
        shp.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
        shp.closed = true;
        mk.property("ADBE Mask Shape").setValue(shp);
        mk.property("ADBE Mask Feather").setValue([20, 20]);
        mk.maskMode = MaskMode.SUBTRACT;
        mk.inverted = true;

        // a matte directly above the solid (legacy track matte uses the layer above)
        var matteShape = c.layers.addShape();
        matteShape.name = "Solid matte";
        var mg = matteShape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        mg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([500, 500]);
        mg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        solid.trackMatteType = TrackMatteType.LUMA;

        var pre = c.layers.add(inner);
        pre.name = "Inner precomp";
        pre.startTime = 0.5;
        pre.threeDLayer = true;
        pre.property("ADBE Transform Group").property("ADBE Rotate Y").setValue(25);

        var shape = c.layers.addShape();
        shape.name = "Box shape";
        var grp = shape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var rect = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([300, 180]);
        rect.property("ADBE Vector Rect Roundness").setValue(24);
        var fill = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([1, 0.8, 0.1, 1]);
        var trim = shape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Filter - Trim");
        trim.property("ADBE Vector Trim End").setValueAtTime(0, 0);
        trim.property("ADBE Vector Trim End").setValueAtTime(2, 100);

        var txt = c.layers.addText("Hello EffectCraft");
        var tdp = txt.property("ADBE Text Properties").property("ADBE Text Document");
        var d = tdp.value;
        d.fontSize = 96; d.fillColor = [1, 1, 1]; d.tracking = 50;
        d.justification = ParagraphJustification.CENTER_JUSTIFY;
        tdp.setValue(d);
        txt.property("ADBE Transform Group").property("ADBE Position").setValue([960, 900]);
        txt.property("ADBE Marker").setValueAtTime(1, new MarkerValue("Text in"));

        var nul = c.layers.addNull();
        nul.name = "Controller";
        var slider = nul.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        slider.name = "Amount";
        slider.property(1).setValue(42);
        solid.parent = nul;
        tr.property("ADBE Opacity").expression = 'thisComp.layer("Controller").effect("Amount")(1) + 50';

        var matte = c.layers.addSolid([1, 1, 1], "Matte", 800, 800, 1);    // top: matte for the solid? keep it as plain layer
        matte.enabled = false;
        matte.shy = true;

        var cam = c.layers.addCamera("Cam", [960, 540]);
        var light = c.layers.addLight("Key", [960, 540]);
        light.lightType = LightType.SPOT;
        app.endUndoGroup();
        c.openInViewer();
    }

    function shallowCopy(o) { var r = {}, k; for (k in o) { if (o.hasOwnProperty(k)) { r[k] = o[k]; } } return r; }

    // drop things that legitimately differ between two exports
    function normalise(v, key) {
        var i, k, o;
        if (v === null || typeof v !== "object") {
            if (typeof v === "number") { return Math.round(v * 1000) / 1000; }
            return v;
        }
        if (v instanceof Array) {
            o = [];
            for (i = 0; i < v.length; i++) { o.push(normalise(v[i])); }
            return o;
        }
        o = {};
        // EffectCraft quirk: a spatial key can come back with 3 ease entries instead of 1
        // (same values); compare only the first one
        if (v.si !== undefined) {
            if (v.ie && v.ie.length > 1) { v = shallowCopy(v); v.ie = [v.ie[0]]; }
            if (v.oe && v.oe.length > 1) { v = shallowCopy(v); v.oe = [v.oe[0]]; }
        }
        for (k in v) {
            if (!v.hasOwnProperty(k)) { continue; }
            if (k === "id" || k === "parentId" || k === "sourceId" || k === "exportedAt" || k === "file" ||
                k === "fileURI" || k === "project" || k === "stats" || k === "renderQueue" || k === "mod" ||
                k === "activeItemId") { continue; }
            o[k] = normalise(v[k], k);
        }
        return o;
    }

    function diff(a, b, path, outList) {
        if (outList.length >= 80) { return; }
        var ta = Object.prototype.toString.call(a), tb = Object.prototype.toString.call(b), k, i;
        if (ta !== tb) { outList.push(path + ": " + JSON.stringify(a) + " -> " + JSON.stringify(b)); return; }
        if (a instanceof Array) {
            if (a.length !== b.length) { outList.push(path + ": length " + a.length + " -> " + b.length); }
            for (i = 0; i < Math.min(a.length, b.length); i++) {
                var label = (a[i] && a[i].mn) ? a[i].mn : (a[i] && a[i].name ? a[i].name : i);
                diff(a[i], b[i], path + "[" + label + "]", outList);
            }
            return;
        }
        if (a && typeof a === "object") {
            for (k in a) { if (a.hasOwnProperty(k)) { if (!b.hasOwnProperty(k)) { outList.push(path + "." + k + ": missing after import"); } else { diff(a[k], b[k], path + "." + k, outList); } } }
            for (k in b) { if (b.hasOwnProperty(k) && !a.hasOwnProperty(k)) { outList.push(path + "." + k + ": added by import"); } }
            return;
        }
        if (a !== b) { outList.push(path + ": " + JSON.stringify(a) + " -> " + JSON.stringify(b)); }
    }

    // AE2EC (exporter) and AE2EC_RUN_IMPORTER() are provided by the combined build:
    // tools/build-script.ps1 -Test  (EffectCraft scripts cannot eval or include other files)
    if (typeof AE2EC === "undefined" || typeof AE2EC_RUN_IMPORTER !== "function") {
        throw new Error("Run the combined build (tools\\build-script.ps1 -Test), not this file on its own");
    }

    var KNOWN_FAILURES = { "perChar3d": 1, "ADBE Vector Blend Mode": 1, "ADBE Vector Shape Direction": 1 };   // EffectCraft 0.6.0, defaults only

    if (typeof AE2EC_SKIP_FIXTURE === "undefined" || !AE2EC_SKIP_FIXTURE) { buildFixture(); }
    var first = AE2EC.exportProject({ includeUnmodified: true }).data;
    out.exported = first.stats;
    if (typeof AE2EC_WRITE_FIXTURE !== "undefined" && AE2EC_WRITE_FIXTURE) {
        try { AE2EC.writeTextFile(AE2EC_WRITE_FIXTURE, AE2EC.stringify(first, " ")); out.fixture = AE2EC_WRITE_FIXTURE; }
        catch (eW) { out.fixtureError = String(eW); }
    }
    if (typeof AE2EC_RETURN_FIXTURE !== "undefined" && AE2EC_RETURN_FIXTURE) { out.fixtureData = first; }

    // import into an empty project
    app.newProject();
    AE2EC_DATA = first;
    AE2EC_OPTIONS = { rootFolder: false };
    var reportText = AE2EC_RUN_IMPORTER();
    out.report = JSON.parse(reportText);

    var second = AE2EC.exportProject({ includeUnmodified: true }).data;
    // compare item by item, matched on type + name (creation order differs between the two)
    function byKey(items) {
        var m = {}, i;
        for (i = 0; i < items.length; i++) { m[items[i].type + ":" + items[i].name] = items[i]; }
        return m;
    }
    var A = byKey(normalise(first.items)), B = byKey(normalise(second.items)), key;
    for (key in A) { if (A.hasOwnProperty(key)) { if (!B[key]) { out.differences.push(key + ": missing after import"); } else { diff(A[key], B[key], key, out.differences); } } }
    for (key in B) { if (B.hasOwnProperty(key) && !A[key]) { out.differences.push(key + ": added by import"); } }
    out.unexpectedFailures = {};
    var fk, nUnexpected = 0;
    for (fk in out.report.failedValues) {
        if (out.report.failedValues.hasOwnProperty(fk) && !KNOWN_FAILURES[fk]) { out.unexpectedFailures[fk] = out.report.failedValues[fk]; nUnexpected++; }
    }

    // An older export has no value for a null's untouched Anchor Point (exporter 1.1 and older
    // wrote only modified values): the null must get After Effects' default [0, 0, 0], not
    // EffectCraft's own.
    var old = JSON.parse(JSON.stringify(first)), i, j, L, tr;
    for (i = 0; i < old.items.length; i++) {
        for (j = 0; old.items[i].layers && j < old.items[i].layers.length; j++) {
            L = old.items[i].layers[j];
            tr = null;
            for (var p = 0; p < L.props.length; p++) { if (L.props[p].mn === "ADBE Transform Group") { tr = L.props[p]; } }
            if (L.type !== "null" || !tr) { continue; }
            var kept = [];
            for (var c = 0; c < tr.ch.length; c++) { if (tr.ch[c].mn !== "ADBE Anchor Point") { kept.push(tr.ch[c]); } }
            tr.ch = kept;
        }
    }
    app.newProject();
    AE2EC_DATA = old;
    AE2EC_OPTIONS = { rootFolder: false };
    AE2EC_RUN_IMPORTER();
    var anchor = null;
    for (i = 1; i <= app.project.numItems; i++) {
        var it2 = app.project.item(i);
        if (it2 instanceof CompItem && it2.name === "Main") {
            anchor = it2.layer("Controller").property("ADBE Transform Group").property("ADBE Anchor Point").value;
        }
    }
    out.oldExportNullAnchor = anchor;
    var anchorOk = anchor !== null && Math.abs(anchor[0]) < 1e-9 && Math.abs(anchor[1]) < 1e-9;
    if (!anchorOk) { out.differences.push("old export: null Controller's Anchor Point is " + JSON.stringify(anchor) + ", not After Effects' default [0, 0, 0]"); }

    // An export made in After Effects (exporter 1.0, so no ranges): AE counts Casts / Accepts
    // Shadows and a text layer's Path from 0 where EffectCraft counts from 1, stores Fill's
    // Opacity as 0..1, and an untouched setting with no known range is left alone.
    function leaf(mn, n, vt, mod, v) { return { mn: mn, n: n, pt: "P", vt: vt, mod: mod, v: v }; }
    var square = { closed: true, vertices: [[0, 0], [100, 0], [100, 100], [0, 100]],
        inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]] };
    app.newProject();
    AE2EC_DATA = { format: "ae2ec", formatVersion: 1, exporter: "AE2EC_Export.jsx 1.0.0", host: { app: "17.1.3x40" },
        project: { name: "from AE" },
        items: [{ id: 1, type: "comp", name: "From AE", width: 640, height: 360, pixelAspect: 1, frameRate: 25, duration: 2, layers: [
            { index: 1, name: "On a path", type: "text", attrs: { threeDLayer: true }, props: [
                { mn: "ADBE Text Properties", n: "Text", pt: "N", ch: [{ mn: "ADBE Text Path Options", n: "Path Options", pt: "N", ch: [
                    leaf("ADBE Text Path", "Path", "MASK_INDEX", true, 1)] }] },
                { mn: "ADBE Mask Parade", n: "Masks", pt: "I", ch: [{ mn: "ADBE Mask Atom", n: "Mask 1", pt: "N", i: 1, ch: [
                    leaf("ADBE Mask Shape", "Mask Path", "SHAPE", true, square)] }] },
                { mn: "ADBE Material Options Group", n: "Material Options", pt: "N", ch: [
                    leaf("ADBE Casts Shadows", "Casts Shadows", "OneD", true, 1), leaf("ADBE Accepts Shadows", "Accepts Shadows", "OneD", true, 0)] }] },
            { index: 2, name: "Filled", type: "solid", solid: { name: "Filled", width: 640, height: 360, pixelAspect: 1, color: [0, 0, 0] }, attrs: {}, props: [
                { mn: "ADBE Effect Parade", n: "Effects", pt: "I", ch: [{ mn: "ADBE Fill", n: "Fill", pt: "N", i: 1, ch: [
                    leaf("ADBE Fill-0005", "Opacity", "OneD", true, 0.5),
                    leaf("ADBE Fill-0003", "Horizontal Feather", "OneD", false, 7)] }] }] }] }] };   // 7: made up, to see it's left alone
    AE2EC_OPTIONS = { rootFolder: false };
    var fromAE = JSON.parse(AE2EC_RUN_IMPORTER()), got = {};
    for (i = 1; i <= app.project.numItems; i++) {
        var it3 = app.project.item(i);
        if (!(it3 instanceof CompItem) || it3.name !== "From AE") { continue; }
        var txt = it3.layer("On a path"), fill = it3.layer("Filled").property("ADBE Effect Parade").property(1);
        got.textPath = txt.property("ADBE Text Properties").property("ADBE Text Path Options").property("Path").value;
        got.casts = txt.property("ADBE Material Options Group").property("ADBE Casts Shadows").value;
        got.accepts = txt.property("ADBE Material Options Group").property("ADBE Accepts Shadows").value;
        got.fillOpacity = fill.property("ADBE Fill-0005").value;
        got.fillFeather = fill.property("ADBE Fill-0003").value;
    }
    var want = { textPath: 2, casts: 2, accepts: 1, fillOpacity: 50, fillFeather: 0 };
    out.fromAE = got;
    for (var wk in want) {
        if (want.hasOwnProperty(wk) && got[wk] !== want[wk]) { out.differences.push("export from After Effects: " + wk + " is " + got[wk] + ", expected " + want[wk]); }
    }
    if (!fromAE.ok) { out.differences.push("export from After Effects: import failed: " + (fromAE.error || JSON.stringify(fromAE.failedValues))); }

    out.ok = out.report.ok && out.differences.length === 0 && nUnexpected === 0;
    return JSON.stringify(out, null, 1);
})();
