"use strict";
// Auto-open / auto-close plug-in editor windows (VST, VST3, AU) as the focused
// device changes — "the plug-in window follows the blue hand".
//
// Off by default; the app toggles it with /pluginWindows <0|1> and the setting
// persists per device instance. When on, every device change closes the
// previously focused plug-in's editor and opens the new one's. A device that
// is not a plug-in (stock Live devices, Max devices, racks) just closes the
// previous window and opens nothing.
//
// Driven by k4-bluhand's onParameterChange — the one place that knows the
// focused device actually changed, in both focus-lock modes.
Object.defineProperty(exports, "__esModule", { value: true });
exports.routes = exports.init = exports.pushState = exports.setEnabled = exports.deviceChanged = void 0;
var k4_config_1 = require("./k4-config");
var utils_1 = require("./utils");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
var KEY = 'pluginWindows';
// PluginDevice.is_editor_open arrived in Live 12.4.3. Older builds don't expose
// the property at all, so the feature is simply unavailable there.
var MIN_VERSION = [12, 4, 3];
var ctx = null;
var enabled = false;
var available = false;
// The device the surface currently points at (any type), used to make repeat
// notifications for the same device free.
var lastDeviceId = 0;
// The plug-in whose editor we last opened — the close target when focus moves.
var openPluginId = 0;
// The first device change after load is the set opening, not a user selecting
// something; seed the state from it without popping a window.
var seeded = false;
// Non-observing handle, re-pointed by id. `.id =` is numeric so it interns no
// symbols, unlike assigning `.path` (see CLAUDE.md).
var scratch = null;
function getScratch() {
    if (!scratch) {
        scratch = new LiveAPI(consts_1.noFn, '');
    }
    return scratch;
}
// Is Live new enough to expose is_editor_open at all? Read once at init so the
// app can grey out the toggle without waiting for a plug-in to be focused.
// (The per-device gate below is the one that actually guards the write.)
function liveSupportsEditorOpen() {
    var app = new LiveAPI(consts_1.noFn, 'live_app');
    if (+app.id === 0) {
        return false;
    }
    // @types/maxmsp types LiveAPI.call as void; it returns the result.
    var v = [
        parseInt(app.call('get_major_version')),
        parseInt(app.call('get_minor_version')),
        parseInt(app.call('get_bugfix_version')),
    ];
    for (var i = 0; i < 3; i++) {
        if (isNaN(v[i])) {
            return false;
        }
        if (v[i] !== MIN_VERSION[i]) {
            return v[i] > MIN_VERSION[i];
        }
    }
    return true;
}
// Point the scratch handle at `id` and report whether that object is a plug-in
// with a controllable editor.
//
// The test is the LOM description itself rather than class_name: only
// PluginDevice carries is_editor_open, and only on Live 12.4.3+, so one `.info`
// read covers both gates at once and never provokes a console error by
// probing a property the object doesn't have. (Same trick as
// utils.isDeviceSupported; string reads don't intern.)
function pointAtPlugin(id) {
    if (!id) {
        return false;
    }
    var api = getScratch();
    api.id = id;
    if (+api.id === 0) {
        return false; // deleted device
    }
    return /\bis_editor_open\b/.test(api.info);
}
// Returns true only if `id` was a plug-in and the write went out.
function setEditorOpen(id, open) {
    if (!pointAtPlugin(id)) {
        return false;
    }
    getScratch().set('is_editor_open', open ? 1 : 0);
    return true;
}
function applyFocus(deviceId) {
    if (openPluginId && openPluginId !== deviceId) {
        setEditorOpen(openPluginId, false);
        openPluginId = 0;
    }
    if (deviceId && setEditorOpen(deviceId, true)) {
        openPluginId = deviceId;
    }
}
// Called by k4-bluhand whenever the focused device changes. `deviceId` is 0
// when the focus landed on something with no device.
function deviceChanged(deviceId) {
    var next = +deviceId || 0;
    if (next === lastDeviceId) {
        return;
    }
    lastDeviceId = next;
    if (!seeded) {
        // Set load / JS reload: adopt the current device silently.
        seeded = true;
        return;
    }
    if (!enabled || !available) {
        return;
    }
    applyFocus(next);
}
exports.deviceChanged = deviceChanged;
// The toggle. Reached from the app as /pluginWindows <0|1> and from the
// device's own chkPluginWindows checkbox (`pluginWindows $1` -> the entry).
// Turning it on opens the currently focused plug-in right away (so the toggle
// has a visible effect); turning it off closes the window we opened and leaves
// everything else alone.
function setEnabled(val) {
    // The checkbox can fire before init(ctx) on load; init pushes the real state
    // back to it afterwards, so dropping the early one loses nothing.
    if (!ctx) {
        return;
    }
    if (!available) {
        log('pluginWindows: this Live has no is_editor_open (needs 12.4.3+)');
        pushState();
        return;
    }
    var next = !!+val;
    if (next !== enabled) {
        enabled = next;
        ctx.settings.set(KEY, enabled ? 1 : 0);
        if (enabled) {
            applyFocus(lastDeviceId);
        }
        else if (openPluginId) {
            setEditorOpen(openPluginId, false);
            openPluginId = 0;
        }
    }
    pushState();
}
exports.setEnabled = setEnabled;
// Echo the current state to the app and to the device's checkbox. Over OSC, -1
// means "this Live can't do it" so the app can disable the control rather than
// show a switch that does nothing; the checkbox just reads unchecked.
function pushState() {
    (0, utils_1.osc)('/pluginWindows', available ? (enabled ? 1 : 0) : -1);
    var chk = patcher.getnamed('chkPluginWindows');
    if (chk) {
        chk.message('set', available && enabled ? 1 : 0);
    }
}
exports.pushState = pushState;
function init(c) {
    (0, utils_1.setOscSink)(c.osc);
    ctx = c;
    available = liveSupportsEditorOpen();
    var stored = c.settings.get(KEY);
    enabled = stored === null || stored === undefined ? false : !!+stored;
    pushState();
}
exports.init = init;
var routes = [
    { prefix: '/pluginWindows', parse: 'val', fn: setEnabled },
];
exports.routes = routes;
log('reloaded k4-pluginWindow');
