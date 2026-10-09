/*
 * AE2EC_Relink.jsx  -  run in EffectCraft: File > Scripts > Run Script File...
 *
 * Relinks footage that AE2EC_Import.jsx could not import and replaced with placeholders.
 * Each such placeholder carries its original path in its comment ("ae2ec:<path>").
 *
 * Optional: define AE2EC_RELINK_FOLDER = "D:/new/footage/folder" before this file
 * (tools\build-script.ps1 does not need to be involved) to also look for each missing
 * item by file name in that folder, e.g. after moving a project to another machine.
 */
(function () {
    var folder = (typeof AE2EC_RELINK_FOLDER !== "undefined" && AE2EC_RELINK_FOLDER) ? String(AE2EC_RELINK_FOLDER).replace(/\\/g, "/") : null;
    var done = [], failed = [], i, it, path, comment, tried;

    function tryReplace(item, p) {
        try { item.replace(new File(p)); return !item.footageMissing; } catch (e) { return false; }
    }

    app.beginUndoGroup("Relink footage (ae2ec)");
    for (i = 1; i <= app.project.numItems; i++) {
        it = app.project.item(i);
        if (!(it instanceof FootageItem)) { continue; }
        comment = "";
        try { comment = String(it.comment || ""); } catch (e0) { }
        var missing = false;
        try { missing = it.footageMissing; } catch (e1) { }
        if (comment.indexOf("ae2ec:") !== 0 && !missing) { continue; }

        tried = [];
        var ok = false;
        if (comment.indexOf("ae2ec:") === 0) {
            path = comment.substring(6);
            tried.push(path);
            ok = tryReplace(it, path);
        }
        if (!ok && folder) {
            var base = comment.indexOf("ae2ec:") === 0 ? path.replace(/\\/g, "/").replace(/^.*\//, "") : it.name;
            tried.push(folder + "/" + base);
            ok = tryReplace(it, folder + "/" + base);
        }
        if (ok) {
            try { if (String(it.comment || "").indexOf("ae2ec:") === 0) { it.comment = ""; } } catch (e2) { }
            done.push(it.name);
        } else if (tried.length) {
            failed.push(it.name + "  (tried " + tried.join(", ") + ")");
        }
    }
    app.endUndoGroup();

    var msg = "Relinked " + done.length + " item(s)." + (failed.length ? "\nStill missing:\n  " + failed.join("\n  ") : "");
    try { writeLn(msg); } catch (e3) { }
    return JSON.stringify({ relinked: done, missing: failed }, null, 1);
})();
