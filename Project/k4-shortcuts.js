"use strict";
// 8 device-shortcut slots (replaces the native [poly~ shortcutPoly 8]).
// Press an unmapped shortcut -> maps the currently-selected device. Press a
// mapped one -> focuses Live on that device (recall). Each slot persists the
// device PATH in ctx.settings; a single shared Task re-resolves the live paths
// every second (device/track reorders change paths, and the path must be
// current whenever the Set is saved so shortcuts restore to the right device).
//
// Inbound (router OUTLET_PRESETS): shortcut(slot) [/mapshortcut], unmap(slot)
// [/unmapshortcut], swapShortcut(slot, other) [/swapshortcut].
// Outbound: /shortcutName{N}, /shortcut{N}Color (RRGGBBAA),
// plus the device-UI label via OUTLET_SHORTCUT_NAME. Recall navigates through
// ctx.gotoDevice (bluhand).
Object.defineProperty(exports, "__esModule", { value: true });
exports.unmap = exports.legacyShortcutPath = exports.init = exports.routes = void 0;
var utils_1 = require("./utils");
var liveApi_1 = require("./liveApi");
var k4_config_1 = require("./k4-config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
var NUM_SHORTCUTS = 8;
var RESET_NAME = '- - -';
var RESET_COLOR = '990000ff';
var CHECK_PATH_MS = 1000;
var ctx = null;
var slots = [];
var scratchApi = null; // resolve selected_device / restore paths
var checkPathTask = null;
// Carry-forward from pre-[v8] versions: those persisted each shortcut path in a
// parameter-enabled blob (longname N_shortcutPath, inside the old shortcutPoly).
// The .amxd now has 8 invisible blob params with matching longnames; on load
// each fires its restored value here so we can backfill ctx.settings for a slot
// that hasn't been migrated yet. legacyPaths is populated once per device load
// (the params fire on Live's parameter restore) and is read settings-first.
var legacyPaths = [];
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
// Bind by numeric id, never by an 'id N' path string — the latter is a STRING
// and interns a permanent Max symbol per distinct device (CLAUDE.md).
function bindDevice(slot, deviceId) {
    var s = slots[slot - 1];
    s.deviceApi = (0, liveApi_1.ensureObs)(s.deviceApi, deviceId, consts_1.noFn, '');
    // Devices have no 'color' — the shortcut color comes from the device's
    // canonical_parent (the track, or chain for rack devices).
    var parentId = parseInt(s.deviceApi.get('canonical_parent')[1]);
    s.nameApi = (0, liveApi_1.ensureObs)(s.nameApi, deviceId, makeCb(slot, 'name', onName), 'name');
    s.colorApi = (0, liveApi_1.ensureObs)(s.colorApi, parentId, makeCb(slot, 'color', onColor), 'color');
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
function getScratch() {
    if (!scratchApi) {
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    return scratchApi;
}
// /mapshortcut{N}: map the selected device when empty, else recall it.
function shortcut(slot) {
    var s = slots[slot - 1];
    if (s.mapped) {
        recall(slot);
        return;
    }
    var dp = ctx.focus.devicePath(); // current device (focus); Live's sel when locked
    if (!dp) {
        return; // no current device
    }
    var scratch = getScratch();
    scratch.path = dp;
    var id = (0, liveApi_1.apiId)(scratch);
    if (id === 0) {
        return; // nothing selected
    }
    ctx.settings.set(pathKey(slot), scratch.unquotedpath);
    bindDevice(slot, id);
}
function recall(slot) {
    var s = slots[slot - 1];
    if (!s.mapped || !(0, liveApi_1.apiValid)(s.deviceApi)) {
        return;
    }
    ctx.gotoDevice((0, liveApi_1.apiId)(s.deviceApi).toString());
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
exports.unmap = unmap;
// /swapshortcut{N} [m]: exchange the devices mapped to slots N and m (a move
// when one of them is empty). Driven by the app's map-mode "pick a shortcut,
// then pick another" gesture. The persisted path IS the mapping, so swapping
// the two paths and re-applying both is the whole operation.
function swapShortcut(slot, other) {
    if (!ctx || slot == null || other == null || slot === other) {
        return;
    }
    if (slot < 1 || slot > NUM_SHORTCUTS || other < 1 || other > NUM_SHORTCUTS) {
        return;
    }
    var a = storedPath(slot);
    var b = storedPath(other);
    applyPath(slot, b);
    applyPath(other, a);
}
// The slot's mapping as a path, settings-first with the legacy blob as backfill
// (same precedence restoreShortcut uses).
function storedPath(slot) {
    var p = ctx.settings.get(pathKey(slot));
    if (typeof p === 'string' && p.length) {
        return p;
    }
    return typeof legacyPaths[slot] === 'string' ? legacyPaths[slot] : '';
}
// Point a slot at a path (empty = unmapped) and re-bind it. Clearing legacyPaths
// matters: a deliberate reassignment must supersede the pre-[v8] carry-forward,
// or emptying a slot would let its old legacy path resurrect on the next restore.
function applyPath(slot, path) {
    legacyPaths[slot] = '';
    var id = resolvePath(path);
    if (id !== 0) {
        ctx.settings.set(pathKey(slot), path);
        bindDevice(slot, id);
        return;
    }
    unmap(slot); // clears the setting, unbinds the APIs, resets name/color
}
// A stored path -> the id it currently resolves to, 0 if it no longer exists.
function resolvePath(path) {
    if (!path || !path.length) {
        return 0;
    }
    var scratch = getScratch();
    scratch.path = path;
    return (0, liveApi_1.apiId)(scratch);
}
// --- path revalidation (one shared poll for all mapped slots) ----------------
function ensureCheckPath() {
    if (checkPathTask) {
        return;
    }
    checkPathTask = new Task(function () {
        for (var i = 1; i <= NUM_SHORTCUTS; i++) {
            var s = slots[i - 1];
            if (s.mapped && (0, liveApi_1.apiValid)(s.deviceApi)) {
                ctx.settings.set(pathKey(i), s.deviceApi.unquotedpath);
            }
        }
        checkPathTask.schedule(CHECK_PATH_MS);
    });
    checkPathTask.schedule(CHECK_PATH_MS);
}
// --- lifecycle ---------------------------------------------------------------
// Resolve one slot: ctx.settings wins; else backfill from the legacy blob param
// (carry-forward from pre-[v8] sets); else leave it unmapped. Idempotent — safe
// on every refresh()/reconnect (a value already applied re-binds to the same id).
function restoreShortcut(slot) {
    if (!ctx || !slots.length) {
        return;
    }
    var p = storedPath(slot);
    if (p && p !== ctx.settings.get(pathKey(slot))) {
        ctx.settings.set(pathKey(slot), p); // migrate the old mapping into settings
    }
    var id = resolvePath(p);
    if (id !== 0) {
        bindDevice(slot, id);
        return;
    }
    slots[slot - 1].mapped = false;
    resetSlot(slot);
}
// Max message from a legacy N_shortcutPath blob param (fires on load). Stash the
// value and apply it if we're ready; otherwise init() will pick it up.
function legacyShortcutPath(slot, path) {
    if (slot < 1 || slot > NUM_SHORTCUTS) {
        return;
    }
    legacyPaths[slot] = path == null ? '' : path.toString();
    restoreShortcut(slot);
}
exports.legacyShortcutPath = legacyShortcutPath;
function init(c) {
    (0, utils_1.setOscSink)(c.osc);
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
    // Restore from persisted paths (kept current by the checkPath poll at save),
    // backfilling from legacy blob params for sets saved before the [v8] port.
    for (var i = 1; i <= NUM_SHORTCUTS; i++) {
        restoreShortcut(i);
    }
}
exports.init = init;
log('reloaded k4-shortcuts');
var routes = [
    { prefix: '/mapshortcut', parse: 'slot', fn: shortcut },
    { prefix: '/unmapshortcut', parse: 'slot', fn: unmap },
    { prefix: '/swapshortcut', parse: 'slotVal', fn: swapShortcut },
];
exports.routes = routes;
