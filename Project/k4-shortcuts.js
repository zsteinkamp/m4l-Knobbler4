"use strict";
// 8 device-shortcut slots (replaces the native [poly~ shortcutPoly 8]).
// Press an unmapped shortcut -> maps the currently-selected device. Press a
// mapped one -> focuses Live on that device (recall). Each slot persists the
// device PATH in ctx.settings; a single shared Task re-resolves the live paths
// every second (device/track reorders change paths, and the path must be
// current whenever the Set is saved so shortcuts restore to the right device).
//
// Inbound (router OUTLET_PRESETS): shortcut(slot) [/mapshortcut], unmap(slot)
// [/unmapshortcut]. Outbound: /shortcutName{N}, /shortcut{N}Color (RRGGBBAA),
// plus the device-UI label via OUTLET_SHORTCUT_NAME. Recall navigates through
// ctx.gotoDevice (bluhand).
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.routes = void 0;
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(config_1.default);
var NUM_SHORTCUTS = 8;
var RESET_NAME = '- - -';
var RESET_COLOR = '990000ff';
var CHECK_PATH_MS = 1000;
var ctx = null;
var slots = [];
var scratchApi = null; // resolve selected_device / restore paths
var checkPathTask = null;
function pathKey(slot) {
    return 'shortcut_' + slot + '_path';
}
function emitName(slot, name) {
    (0, utils_1.osc)('/shortcutName' + slot, name);
    // device-side UI label (bluShortcutUI) — [slot, name]
    outlet(consts_1.OUTLET_SHORTCUT_NAME, slot, name);
}
function emitColor(slot, colorHex) {
    (0, utils_1.osc)('/shortcut' + slot + 'Color', colorHex);
}
function onName(slot) {
    var s = slots[slot - 1];
    if (!s.mapped) {
        return;
    }
    emitName(slot, (0, utils_1.dequote)(s.nameApi.get('name')[0]));
}
function onColor(slot) {
    var s = slots[slot - 1];
    if (!s.mapped) {
        return;
    }
    emitColor(slot, (0, utils_1.colorToString)(s.colorApi.get('color').toString()).toLowerCase() + 'ff');
}
function makeCb(slot, prop, fn) {
    return function (args) {
        if (args[0] !== prop) {
            return;
        }
        fn(slot);
    };
}
function bindDevice(slot, deviceId) {
    var s = slots[slot - 1];
    if (!s.deviceApi) {
        s.deviceApi = new LiveAPI(consts_1.noFn, 'id ' + deviceId);
        s.nameApi = new LiveAPI(makeCb(slot, 'name', onName), 'id ' + deviceId);
        s.nameApi.property = 'name';
        s.colorApi = new LiveAPI(makeCb(slot, 'color', onColor), 'id ' + deviceId);
        s.colorApi.property = 'color';
    }
    else {
        s.deviceApi.id = deviceId;
        s.nameApi.id = deviceId;
        s.colorApi.id = deviceId;
    }
    s.mapped = true;
    onName(slot);
    onColor(slot);
    ensureCheckPath();
}
function resetSlot(slot) {
    emitName(slot, RESET_NAME);
    emitColor(slot, RESET_COLOR);
}
// --- inbound -----------------------------------------------------------------
// /mapshortcut{N}: map the selected device when empty, else recall it.
function shortcut(slot) {
    var s = slots[slot - 1];
    if (s.mapped) {
        recall(slot);
        return;
    }
    if (!scratchApi) {
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    scratchApi.path = 'live_set view selected_track view selected_device';
    var id = parseInt(scratchApi.id);
    if (id === 0) {
        return; // nothing selected
    }
    ctx.settings.set(pathKey(slot), scratchApi.unquotedpath);
    bindDevice(slot, id);
}
function recall(slot) {
    var s = slots[slot - 1];
    if (!s.mapped || !s.deviceApi || +s.deviceApi.id === 0) {
        return;
    }
    ctx.gotoDevice(s.deviceApi.id.toString());
}
// /unmapshortcut{N}
function unmap(slot) {
    var s = slots[slot - 1];
    ctx.settings.set(pathKey(slot), '');
    if (s.deviceApi) {
        s.deviceApi.id = 0;
        s.nameApi.id = 0;
        s.colorApi.id = 0;
    }
    s.mapped = false;
    resetSlot(slot);
}
// --- path revalidation (one shared poll for all mapped slots) ----------------
function ensureCheckPath() {
    if (checkPathTask) {
        return;
    }
    checkPathTask = new Task(function () {
        for (var i = 1; i <= NUM_SHORTCUTS; i++) {
            var s = slots[i - 1];
            if (s.mapped && s.deviceApi && +s.deviceApi.id !== 0) {
                ctx.settings.set(pathKey(i), s.deviceApi.unquotedpath);
            }
        }
        checkPathTask.schedule(CHECK_PATH_MS);
    });
    checkPathTask.schedule(CHECK_PATH_MS);
}
// --- lifecycle ---------------------------------------------------------------
function refresh() {
    for (var i = 1; i <= NUM_SHORTCUTS; i++) {
        if (slots[i - 1].mapped) {
            onName(i);
            onColor(i);
        }
        else {
            resetSlot(i);
        }
    }
}
function init(c) {
    ctx = c;
    if (!slots.length) {
        for (var i = 0; i < NUM_SHORTCUTS; i++) {
            slots.push({
                deviceApi: null,
                nameApi: null,
                colorApi: null,
                mapped: false,
            });
        }
    }
    if (!scratchApi) {
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    // Restore from persisted paths (kept current by the checkPath poll at save).
    for (var i = 1; i <= NUM_SHORTCUTS; i++) {
        var p = ctx.settings.get(pathKey(i));
        if (p && typeof p === 'string' && p.length) {
            scratchApi.path = p;
            var id = parseInt(scratchApi.id);
            if (id !== 0) {
                bindDevice(i, id);
                continue;
            }
        }
        slots[i - 1].mapped = false;
        resetSlot(i);
    }
}
exports.init = init;
log('reloaded k4-shortcuts');
var routes = [
    { prefix: '/mapshortcut', parse: 'slot', fn: shortcut },
    { prefix: '/unmapshortcut', parse: 'slot', fn: unmap },
];
exports.routes = routes;
