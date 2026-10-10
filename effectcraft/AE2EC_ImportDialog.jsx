/*
 * AE2EC_ImportDialog.jsx  -  "Import from After Effects" in EffectCraft
 * (File > Import > After Effects Project (.ae2ec.json)..., or File > Scripts).
 *
 * Asks for an export made by ae/AE2EC_Export.jsx (or takes AE2EC_JSON_PATH, as tools/test.ps1
 * does), shows what is in it and the import options, imports it with AE2EC_Import.jsx while a
 * progress window shows each step (with Cancel), then shows the report with Relink Footage
 * (AE2EC_Relink.jsx), Verify (AE2EC_Verify.jsx), Save Report and Save Project As.
 *
 * It doesn't run on its own: tools\install.ps1 joins it with those scripts (EffectCraft scripts
 * can't include other files), which defines AE2EC_RUN_IMPORTER, AE2EC_RUN_RELINK and
 * AE2EC_RUN_VERIFY, and installs the result in EffectCraft as "Import from After Effects.jsx".
 */

// The inputs of the importer, relink and verify scripts (see their headers).
var AE2EC_DATA, AE2EC_OPTIONS, AE2EC_RELINK_FOLDER, AE2EC_SOURCE;

(function () {
    var TITLE = "Import from After Effects";
    var FILTER = "ae2ec export:*.json";

    function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }

    // The export in `file`, or an Error saying why it can't be imported.
    function readExport(file) {
        try {
            file.encoding = "UTF-8";
            if (!file.open("r")) { return new Error("Can't open " + file.fsName); }
            var text = file.read();
            file.close();
            var data = JSON.parse(text);
            if (!data || data.format !== "ae2ec") {
                return new Error(file.name + " isn't an ae2ec export. Export the project from After Effects with AE2EC_Export.jsx.");
            }
            return data;
        } catch (e) {
            return new Error("Can't read " + file.name + ": " + e.message);
        }
    }

    function projectName(data) {
        return data.project && data.project.name ? data.project.name : "AE project";
    }

    function rootFolderName(data) {
        return projectName(data) + " (from AE)";
    }

    // ---------------------------------------------------------------- 1. the export and options

    function chooseOptions(file) {
        var data = null;
        var d = new Window("dialog", TITLE);
        d.orientation = "column";
        d.alignChildren = ["fill", "top"];

        var src = d.add("panel", undefined, "After Effects export");
        src.alignChildren = ["fill", "top"];
        var row = src.add("group");
        var path = row.add("edittext", undefined, "", { name: "path", readonly: true });
        path.characters = 52;
        var browse = row.add("button", undefined, "Browse...", { name: "browse" });
        var project = src.add("statictext", undefined, "", { name: "project" });
        var counts = src.add("statictext", undefined, "", { name: "counts" });

        var opt = d.add("panel", undefined, "Options");
        opt.alignChildren = ["fill", "top"];
        var folder = opt.add("checkbox", undefined, "Put everything in a folder named after the project", { name: "rootFolder" });
        var open = opt.add("checkbox", undefined, "Open the project's active composition when done", { name: "openComp" });
        folder.value = true;
        open.value = true;

        var buttons = d.add("group");
        buttons.alignment = "right";
        buttons.add("button", undefined, "Cancel", { name: "cancel" });
        var ok = buttons.add("button", undefined, "Import", { name: "ok" });

        function load(f) {
            var r = readExport(f);
            path.text = f.fsName;
            data = r instanceof Error ? null : r;
            ok.enabled = data !== null;
            if (!data) {
                project.text = r.message;
                counts.text = "";
                return;
            }
            var s = data.stats || {}, host = data.host && data.host.app ? "  (After Effects " + data.host.app + ")" : "";
            project.text = (data.project && data.project.name ? data.project.name : "Untitled project") + host;
            counts.text = [plural(s.comps || 0, "comp"), plural(s.layers || 0, "layer"), plural(s.footage || 0, "footage item"),
                plural(s.keys || 0, "keyframe"), plural(s.expressions || 0, "expression")].join(", ");
            folder.text = "Put everything in a folder named \"" + rootFolderName(data) + "\"";
        }

        browse.onClick = function () {
            var f = File.openDialog("Choose an After Effects export (.ae2ec.json)", FILTER);
            if (f) { load(f); }
        };
        load(file);
        if (d.show() !== 1 || !data) { return null; }
        return { file: file, data: data, options: { rootFolder: folder.value, openComp: open.value } };
    }

    // ---------------------------------------------------------------- 2. the import, with its progress

    // Runs the importer while a palette shows each step (Window.update() redraws EffectCraft as
    // it goes, so it doesn't look frozen) and a log of the steps; Cancel stops it.
    function runImport(choice) {
        var w = new Window("palette", TITLE);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.add("statictext", undefined, "Importing " + projectName(choice.data) + "...");
        var bar = w.add("progressbar", undefined, 0, 1, { name: "progress" });
        bar.preferredSize = [560, 12];
        var now = w.add("statictext", undefined, "Starting", { name: "step" });
        now.preferredSize = [560, 18];          // a long file name doesn't widen the window
        var log = w.add("listbox", undefined, [], { name: "log" });
        log.preferredSize = [560, 184];
        var lines = [];                          // the last steps, newest at the bottom
        var cancel = w.add("button", undefined, "Cancel", { name: "cancel" });
        cancel.alignment = "right";
        var cancelled = false;
        cancel.onClick = function () {
            cancelled = true;
            cancel.enabled = false;
            now.text = "Stopping...";
        };
        w.show();

        var t0 = Date.now();
        AE2EC_DATA = choice.data;
        AE2EC_OPTIONS = choice.options;
        AE2EC_OPTIONS.progress = function (done, total, what) {
            bar.maxvalue = total;
            bar.value = done;
            now.text = done + " of " + total + ":  " + what;
            lines.push(what);
            if (lines.length > 7) { lines.shift(); }
            setItems(log, lines);
            if (typeof w.update === "function") { w.update(); }   // EffectCraft builds without update() just carry on
            return !cancelled;
        };
        var report = JSON.parse(AE2EC_RUN_IMPORTER());
        report.seconds = Math.round((Date.now() - t0) / 100) / 10;
        w.close();
        return report;
    }

    // ---------------------------------------------------------------- 3. the report

    // One line per thing to look at: the importer's report, then `more` (Verify's differences).
    function issues(report, more) {
        var out = [], i, k;
        function map(label, m) {
            for (k in m) { if (m.hasOwnProperty(k)) { out.push(label + " (" + m[k] + "x): " + k); } }
        }
        for (i = 0; i < (report.missingFootage || []).length; i++) {
            var f = report.missingFootage[i];
            out.push("Missing footage: " + f.name + "  <-  " + f.file);
        }
        map("Effect EffectCraft doesn't have", report.missingEffects || {});
        map("Redo by hand (scripts can't read it)", report.customValues || {});
        map("Not in EffectCraft", report.unsupported || {});
        map("Couldn't set", report.failedValues || {});
        for (i = 0; i < (report.notes || []).length; i++) { out.push("Note: " + report.notes[i]); }
        if (report.cancelled) {
            out.unshift("Stopped: what was imported before Cancel is in the project. Edit > Undo removes it.");
        } else if (report.error) {
            out.unshift("Error: " + report.error);
        }
        for (i = 0; more && i < more.length; i++) { out.push("Differs: " + more[i]); }
        if (!out.length) { out.push("Everything came across."); }
        return out;
    }

    function summary(report) {
        var c = report.counts || {};
        var made = [plural(c.comps || 0, "comp"), plural(c.layers || 0, "layer"), plural(c.effects || 0, "effect"),
            plural(c.masks || 0, "mask"), plural(c.keys || 0, "keyframe"), plural(c.expressions || 0, "expression")].join(", ");
        var footage = plural(c.footage || 0, "footage file") + (c.placeholders ? ", " + plural(c.placeholders, "placeholder") : "");
        var took = report.seconds !== undefined ? " in " + report.seconds + " s" : "";
        return (report.cancelled ? "Stopped after " : report.ok ? "Imported " : "Imported with errors: ") + made + "; " + footage + took + ".";
    }

    function setItems(list, lines) {
        list.removeAll();
        for (var i = 0; i < lines.length; i++) { list.add("item", lines[i]); }
    }

    function showReport(choice, report) {
        var d = new Window("dialog", TITLE);
        d.orientation = "column";
        d.alignChildren = ["fill", "top"];
        d.add("statictext", undefined, summary(report), { name: "summary" });
        d.add("statictext", undefined, "It's in the open project" +
            (choice.options.rootFolder ? ", in the \"" + rootFolderName(choice.data) + "\" folder" : "") +
            ", and isn't saved yet: use Save Project As.", { name: "where" });
        var list = d.add("listbox", undefined, issues(report), { name: "issues" });
        list.preferredSize = [640, 240];
        var status = d.add("statictext", undefined, "", { name: "status" });

        var row = d.add("group");
        row.alignment = "right";
        var relink = row.add("button", undefined, "Relink Footage...", { name: "relink" });
        var verify = row.add("button", undefined, "Verify", { name: "verify" });
        var save = row.add("button", undefined, "Save Report...", { name: "save" });
        var saveProject = row.add("button", undefined, "Save Project As...", { name: "saveProject" });
        row.add("button", undefined, "Done", { name: "ok" });
        relink.enabled = (report.missingFootage || []).length > 0;

        // Footage that wasn't found: try where it was, then by name in a folder the user picks.
        relink.onClick = function () {
            var where = Folder.selectDialog("Where is the missing footage now?");
            AE2EC_RELINK_FOLDER = where ? where.fsName : null;
            var r = JSON.parse(AE2EC_RUN_RELINK());
            status.text = "Relinked " + plural(r.relinked.length, "item") + (r.missing.length ? "; still missing: " + r.missing.length + "." : ".");
            var relinked = {}, still = [], i;
            for (i = 0; i < r.relinked.length; i++) { relinked[r.relinked[i]] = true; }
            for (i = 0; i < report.missingFootage.length; i++) {
                if (!relinked[report.missingFootage[i].name]) { still.push(report.missingFootage[i]); }
            }
            report.missingFootage = still;
            setItems(list, issues(report));
            relink.enabled = still.length > 0;
        };

        // Compare what EffectCraft built with the export, property by property.
        verify.onClick = function () {
            AE2EC_SOURCE = choice.data;
            var v = JSON.parse(AE2EC_RUN_VERIFY());
            var kinds = [], k;
            for (k in v.byKind) { if (v.byKind.hasOwnProperty(k)) { kinds.push(v.byKind[k] + " " + k); } }
            var c = v.checked || {};
            status.text = "Verified " + plural(c.layers || 0, "layer") + " and " + plural(c.props || 0, "property", "properties") + ": " +
                (kinds.length ? kinds.join(", ") + " (examples in the list)." : "no differences.");
            setItems(list, issues(report, v.samples));
        };

        save.onClick = function () {
            var base = choice.file.fsName.replace(/\.json$/i, "").replace(/\.ae2ec$/i, "");
            var f = new File(base + ".import-report.json").saveDlg("Save the import report", "JSON:*.json");
            if (!f) { return; }
            f.encoding = "UTF-8";
            if (f.open("w")) {
                f.write(JSON.stringify(report, null, 1));
                f.close();
                status.text = "Saved " + f.fsName;
            } else {
                status.text = "Can't write " + f.fsName;
            }
        };

        // The project, next to the export by default, named after the After Effects project.
        saveProject.onClick = function () {
            var name = projectName(choice.data).replace(/\.aepx?$/i, "").replace(/\s+$/, "") || "Imported";
            var f = new File(choice.file.path + "/" + name + ".ecproj").saveDlg("Save the project", "EffectCraft Project:*.ecproj");
            if (!f) { return; }
            app.project.save(f);
            status.text = "Saved " + f.fsName;
        };

        d.show();
    }

    // ---------------------------------------------------------------- run

    var file = typeof AE2EC_JSON_PATH !== "undefined" && AE2EC_JSON_PATH ? new File(AE2EC_JSON_PATH) :
        File.openDialog("Choose an After Effects export (.ae2ec.json)", FILTER);
    if (!file) { return; }
    var choice = chooseOptions(file);
    if (!choice) { return; }
    var report = runImport(choice);
    writeLn(summary(report));
    showReport(choice, report);
})();
