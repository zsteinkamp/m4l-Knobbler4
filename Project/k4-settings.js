"use strict";
// Per-instance persistence service. ONE Dict reference to the device's
// `---settingsDict` (a parameter-enabled [dict] in the patcher, so it persists
// with the Live set and is unique per device instance via the `---` scope).
//
// Owned by the orchestrator and handed to modules as ctx.settings — there must
// be exactly one Dict reference (creating another reference to a
// parameter-enabled dict can reset its contents), which is why no module builds
// its own and why this is not in per-module `utils`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.set = exports.get = exports.open = void 0;
var dict = null;
// name = the resolved `---settingsDict`, delivered by the patcher via the
// entry's settingsDictName message on load (before init). Created once.
function open(name) {
    if (!dict) {
        dict = new Dict(name);
    }
}
exports.open = open;
function get(key) {
    return dict ? dict.get(key) : null;
}
exports.get = get;
function set(key, value) {
    if (dict) {
        dict.set(key, value);
    }
}
exports.set = set;
