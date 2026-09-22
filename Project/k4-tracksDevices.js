"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.routes = void 0;
var utils_1 = require("./utils");
var liveApi_1 = require("./liveApi");
var k4_config_1 = require("./k4-config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
var ctx = null;
var state = {
    api: null,
    currDeviceId: 0,
    currDeviceWatcher: null,
    currTrackId: 0,
    currTrackWatcher: null,
    // Non-observing handles reused by every nav rebuild. They used to be
    // `new LiveAPI(noFn, 'id ' + id)` per call — a fresh object AND a permanent
    // interned symbol per distinct device, on every device change.
    currDeviceApi: null,
    parentApi: null,
};
// One reusable Task per debounce, cancelled and rescheduled. Allocating a Task
// per event (the old shape) never freepeer()s the one it replaces.
var deviceChangeDebounce = null;
function onCurrDeviceChange(val) {
    if (val[0] !== 'id') {
        return;
    }
    var newId = (0, utils_1.cleanArr)(val)[0];
    if (state.currDeviceId === newId) {
        return;
    }
    state.currDeviceId = newId;
    if (!deviceChangeDebounce) {
        deviceChangeDebounce = new Task(updateDeviceNav);
    }
    deviceChangeDebounce.cancel();
    deviceChangeDebounce.schedule(40);
}
// Only Track/Chain objects have a `devices` list — Song/Device do not. Observer
// timing on device add can transiently resolve a focus path to the Song (e.g.
// `live_set view selected_track` before Live finishes wiring up `view`, which
// collapses to its valid prefix `live_set`), so guard every devices read by the
// resolved object's type rather than trusting the path. The next watcher fire
// rebuilds with the correct target. Prevents "'Song' object has no attribute
// 'devices'" on initial load.
var HAS_DEVICES = { Track: 1, Chain: 1, DrumChain: 1 };
function devicesOf(api) {
    return HAS_DEVICES[api.type] ? (0, utils_1.cleanArr)(api.get('devices')) : [];
}
function updateDeviceNav() {
    //log('DEVICE ID=' + state.currDeviceId + ' TRACKID=' + state.currTrackId)
    if (+state.currDeviceId === 0) {
        // if no device is selected, null out the devices list
        (0, utils_1.osc)('/nav/currDeviceId', -1);
        //log('/nav/devices=' + JSON.stringify([]))
        (0, utils_1.osc)('/nav/devices', []);
        return;
    }
    //log('NEW CURR DEVICE ID=' + state.currDeviceId)
    (0, utils_1.osc)('/nav/currDeviceId', state.currDeviceId);
    var ret = [];
    var utilObj = state.api;
    utilObj.path = 'live_set';
    var currDeviceObj = state.currDeviceApi;
    currDeviceObj.id = state.currDeviceId;
    // Guard: the track/device watchers are independently debounced, so state can
    // be transiently inconsistent during a focus retarget. If the id resolved to
    // a Track/Song instead of a device, skip this pass — the next watcher fire
    // builds the correct tree. Prevents walking parents up to the Song.
    var currType = currDeviceObj.type;
    if (!(0, liveApi_1.apiValid)(currDeviceObj) || currType === 'Track' || currType === 'Song') {
        (0, utils_1.osc)('/nav/currDeviceId', -1);
        (0, utils_1.osc)('/nav/devices', []);
        return;
    }
    var currIsSupported = (0, utils_1.isDeviceSupported)(currDeviceObj);
    var parentObj = state.parentApi;
    parentObj.id = currIsSupported
        ? (0, utils_1.cleanArr)(currDeviceObj.get('canonical_parent'))[0] || 0
        : state.currTrackId;
    // handle cases where the device has an incomplete jsliveapi implementation, e.g. CC Control
    var parentChildIds = devicesOf(parentObj);
    var parentId = (0, liveApi_1.apiId)(parentObj);
    // Device rows are drawn in this parent's color; rebuild when it changes.
    watchParentColor(parentId);
    // first, self and siblings (with chain children under self)
    for (var _i = 0, parentChildIds_1 = parentChildIds; _i < parentChildIds_1.length; _i++) {
        var childDeviceId = parentChildIds_1[_i];
        utilObj.id = childDeviceId;
        var objIsSupported = (0, utils_1.isDeviceSupported)(utilObj);
        ret.push([
            /* TYPE   */ objIsSupported && parseInt(utilObj.get('can_have_chains'))
                ? consts_1.TYPE_RACK
                : consts_1.TYPE_DEVICE,
            /* ID     */ childDeviceId,
            /* NAME   */ objIsSupported
                ? (0, utils_1.truncate)(utilObj.get('name').toString(), consts_1.MAX_NAME_LEN)
                : '? Unsupported',
            /* COLOR  */ (0, utils_1.colorToString)(parentObj.get('color').toString()),
            /* INDENT */ 0,
            /* USE INDENT */ 0,
            /* PARENT */ parentId,
            // Live's Device.type: 1 instrument, 2 audio effect, 4 MIDI effect (0 when
            // unknown). The app keeps a dragged device among its own kind.
            /* DEVICE TYPE */ objIsSupported ? parseInt(utilObj.get('type')) : 0,
        ]);
        if (childDeviceId === state.currDeviceId) {
            // add child chains below the current item
            if (objIsSupported && parseInt(currDeviceObj.get('can_have_chains'))) {
                var chainIds = (0, utils_1.cleanArr)(utilObj.get('chains'));
                for (var _a = 0, chainIds_1 = chainIds; _a < chainIds_1.length; _a++) {
                    var chainId = chainIds_1[_a];
                    utilObj.id = chainId;
                    ret.push([
                        /* TYPE   */ consts_1.TYPE_CHILD_CHAIN,
                        /* ID     */ chainId,
                        /* NAME   */ (0, utils_1.truncate)(utilObj.get('name').toString(), consts_1.MAX_NAME_LEN),
                        /* COLOR  */ (0, utils_1.colorToString)(utilObj.get('color').toString()),
                        /* INDENT */ 1,
                        /* USE INDENT */ 1,
                        /* PARENT */ parentId,
                    ]);
                }
                if (currDeviceObj.info.toString().match('return_chains')) {
                    // drum racks have return chains
                    var returnChainIds = (0, utils_1.cleanArr)(currDeviceObj.get('return_chains'));
                    for (var _b = 0, returnChainIds_1 = returnChainIds; _b < returnChainIds_1.length; _b++) {
                        var chainId = returnChainIds_1[_b];
                        utilObj.id = chainId;
                        ret.push([
                            /* TYPE   */ consts_1.TYPE_CHILD_CHAIN,
                            /* ID     */ chainId,
                            /* NAME   */ (0, utils_1.truncate)(utilObj.get('name').toString(), consts_1.MAX_NAME_LEN),
                            /* COLOR  */ (0, utils_1.colorToString)(utilObj.get('color').toString()),
                            /* INDENT */ 1,
                            /* USE INDENT */ 1,
                            /* PARENT */ parentId,
                        ]);
                    }
                }
            }
        }
    }
    // now add hierarchy, up to when the parent is a track
    var indent = 0;
    var watchdog = 0;
    while (parentObj.type !== 'Track' && watchdog < 20) {
        // Stop if the chain ran off the end (invalid object / no canonical_parent)
        // rather than dereferencing undefined and crashing.
        if (!(0, liveApi_1.apiValid)(parentObj))
            break;
        var parentObjParentRaw = (0, utils_1.cleanArr)(parentObj.get('canonical_parent'))[0];
        if (parentObjParentRaw === undefined)
            break;
        var isChain = parentObj.type === 'Chain' || parentObj.type === 'DrumChain';
        var color = null;
        if (isChain) {
            color = (0, utils_1.colorToString)(parentObj.get('color').toString());
        }
        else {
            var grandparentId = (0, utils_1.cleanArr)(parentObj.get('canonical_parent'))[0];
            utilObj.id = grandparentId;
            color = (0, utils_1.colorToString)(utilObj.get('color').toString());
        }
        var parentObjParentId = parentObjParentRaw;
        ret.unshift([
            /* TYPE   */ isChain ? consts_1.TYPE_CHAIN : consts_1.TYPE_RACK,
            /* ID     */ (0, liveApi_1.apiId)(parentObj),
            /* NAME   */ (0, utils_1.truncate)(parentObj.get('name').toString(), consts_1.MAX_NAME_LEN),
            /* COLOR  */ color,
            /* INDENT */ --indent,
            /* USEINDENT */ --indent,
            /* PARENT */ parseInt(parentObjParentId.toString()),
        ]);
        // needs to be after
        parentObj.id = parentObjParentId;
        //log('CP=' + parentObjParentId)
        //log('NEWTYPE=' + parentObj.type)
        watchdog++;
    }
    // now normalize device indentation ... the first item in the ret[] list needs
    // to become zero, but may be negative
    if (ret.length > 0) {
        var baseIndent = ret[0][consts_1.FIELD_INDENT];
        for (var _c = 0, ret_1 = ret; _c < ret_1.length; _c++) {
            var maxObj = ret_1[_c];
            maxObj[consts_1.FIELD_INDENT] -= baseIndent;
        }
    }
    //log('/nav/devices=' + JSON.stringify(ret))
    (0, utils_1.osc)('/nav/devices', ret);
}
var trackChangeDebounce = null;
function onCurrTrackChange(val) {
    if (val[0] !== 'id' && val[1].toString() !== 'id') {
        return;
    }
    var newId = (0, utils_1.cleanArr)(val)[0];
    if (state.currTrackId === newId) {
        return;
    }
    if (newId === 0) {
        return;
    }
    state.currTrackId = newId;
    if (!trackChangeDebounce) {
        trackChangeDebounce = new Task(pushCurrTrack);
    }
    trackChangeDebounce.cancel();
    trackChangeDebounce.schedule(40);
}
function pushCurrTrack() {
    (0, utils_1.osc)('/nav/currTrackId', state.currTrackId);
    // Ensure the current (focus) device exists; if the focus track has none yet,
    // adopt its first device. Routed through focus, so it writes Live's
    // selection only when locked — unlocked it just retargets Knobbler.
    var dp = ctx.focus.devicePath();
    state.api.path = dp || 'live_set';
    if (!dp || !(0, liveApi_1.apiValid)(state.api)) {
        state.api.id = state.currTrackId;
        var devices = devicesOf(state.api);
        if (devices.length > 0) {
            ctx.focus.selectDevice(parseInt(devices[0]));
        }
    }
}
// Focus changed: re-point the nav-tree watchers at Knobbler's current
// track/device so the navigation panel shows the right devices/chains. Dormant
// in locked mode (focus doesn't emit) — the watchers path-follow Live there.
function rebindNavHandles() {
    (0, liveApi_1.repointPath)(state.currTrackWatcher, ctx.focus.trackPath(), 'id');
    (0, liveApi_1.repointPath)(state.currDeviceWatcher, ctx.focus.devicePath(), 'id');
}
// ---------------------------------------------------------------------------
// Nav panel edits
// ---------------------------------------------------------------------------
// None of these changes the selected device's id, the only thing the nav
// watchers observe, so each rebuilds the nav tree itself once Live settles.
var navRefreshTask = null;
function scheduleNavRefresh() {
    if (!navRefreshTask) {
        navRefreshTask = new Task(updateDeviceNav);
    }
    navRefreshTask.cancel();
    navRefreshTask.schedule(40);
}
// Device rows are drawn in their parent's color (the track, or the chain they
// sit in), and nothing else rebuilds the tree when that color changes, whether
// from /nav/colorTrack or in Live. One pooled observer follows the current
// parent: re-pointed by id on each rebuild, never recreated (observer churn
// leaks; see CLAUDE.md). Re-arming fires the callback with the current value,
// which is not a change, so that callback is ignored.
var parentColorApi = null;
var parentColorId = 0;
var parentColorRearming = false;
function onParentColor(args) {
    if (parentColorRearming || args[0] !== 'color')
        return;
    scheduleNavRefresh();
}
function watchParentColor(id) {
    if (!id || id === parentColorId)
        return;
    parentColorId = id;
    parentColorRearming = true;
    if (!parentColorApi) {
        parentColorApi = new LiveAPI(onParentColor, 'live_set');
    }
    parentColorApi.property = '';
    parentColorApi.id = id;
    parentColorApi.property = 'color';
    parentColorRearming = false;
}
var CHAIN_TYPES = { Chain: 1, DrumChain: 1 };
// Point state.api at a LOM id; false if the object no longer exists.
function pointAt(id) {
    state.api.id = id;
    return (0, liveApi_1.apiValid)(state.api);
}
// /nav/renameDevice '[id, name]' — a device or a chain; both have a settable name.
function renameDevice(jsonStr) {
    var edit = (0, utils_1.parseIdValue)(jsonStr);
    if (!edit || !pointAt(edit.id))
        return;
    var type = state.api.type;
    if (!CHAIN_TYPES[type] &&
        (HAS_DEVICES[type] || !(0, utils_1.isDeviceSupported)(state.api))) {
        return;
    }
    state.api.set('name', edit.value.toString());
    scheduleNavRefresh();
}
// /nav/colorChain '[chainId, "RRGGBB"]' — Live snaps to its nearest chooser color.
function colorChain(jsonStr) {
    var edit = (0, utils_1.parseIdValue)(jsonStr);
    if (!edit || !pointAt(edit.id) || !CHAIN_TYPES[state.api.type]) {
        return;
    }
    state.api.set('color', parseInt(edit.value.toString(), 16));
    scheduleNavRefresh();
}
// /nav/moveDevice '[deviceId, index]' — reorder within the device's own chain
// (the nav panel only offers siblings). `index` is where the device should END
// UP. Song.move_device counts its position in the chain as it is BEFORE the
// device is removed, so a move down has to ask for one slot further: in
// 0 1 2 3 4, putting 2 after 4 (final index 4) takes position 5 — asking for 4
// lands it before 4. Moves up are the same either way. Live also takes the
// nearest legal position when the requested one isn't allowed, e.g. a MIDI
// effect after an instrument; the refresh shows where it really landed.
function moveDevice(jsonStr) {
    var edit = (0, utils_1.parseIdValue)(jsonStr);
    if (!edit || !pointAt(edit.id) || !(0, utils_1.isDeviceSupported)(state.api))
        return;
    var parentId = (0, utils_1.cleanArr)(state.api.get('canonical_parent'))[0];
    var index = parseInt(edit.value.toString());
    if (!parentId || isNaN(index) || index < 0)
        return;
    state.api.id = parentId;
    var siblingIds = devicesOf(state.api);
    var current = -1;
    for (var i = 0; i < siblingIds.length; i++) {
        if (parseInt(siblingIds[i]) === edit.id) {
            current = i;
            break;
        }
    }
    var position = current > -1 && index > current ? index + 1 : index;
    state.api.path = 'live_set';
    state.api.call('move_device', [
        'id',
        edit.id,
        'id',
        parentId,
        position,
    ]);
    scheduleNavRefresh();
}
function init(c) {
    (0, utils_1.setOscSink)(c.osc);
    ctx = c;
    if (!state.api) {
        // One-time setup: reset client info and create the focus-driven observers.
        (0, utils_1.saveSetting)('clientVersion', '');
        (0, utils_1.saveSetting)('clientCapabilities', '');
        state.api = new LiveAPI(consts_1.noFn, 'live_set');
        state.currDeviceApi = new LiveAPI(consts_1.noFn, 'live_set');
        state.parentApi = new LiveAPI(consts_1.noFn, 'live_set');
        state.currTrackWatcher = new LiveAPI(onCurrTrackChange, 'live_set');
        state.currDeviceWatcher = new LiveAPI(onCurrDeviceChange, 'live_set');
        // Point them at the current focus target (fires the callbacks → initial nav
        // push) and re-point on every focus change.
        c.focus.onChange(rebindNavHandles);
        rebindNavHandles();
        return;
    }
    // Refresh (e.g. app reconnect): re-push current nav without recreating
    // observers or clobbering the connected client's version/capabilities.
    if (state.currTrackId) {
        (0, utils_1.osc)('/nav/currTrackId', state.currTrackId);
    }
    updateDeviceNav();
}
exports.init = init;
log('reloaded k4-tracksDevices');
var routes = [
    { prefix: '/nav/renameDevice', parse: 'val', fn: renameDevice },
    { prefix: '/nav/colorChain', parse: 'val', fn: colorChain },
    { prefix: '/nav/moveDevice', parse: 'val', fn: moveDevice },
];
exports.routes = routes;
