"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = void 0;
var utils_1 = require("./utils");
var k4_config_1 = require("./k4-config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
var ctx = null;
var state = {
    api: null,
    currDeviceId: null,
    currDeviceWatcher: null,
    currTrackId: null,
    currTrackWatcher: null,
};
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
    if (deviceChangeDebounce) {
        deviceChangeDebounce.cancel();
    }
    deviceChangeDebounce = new Task(function () {
        updateDeviceNav();
    });
    deviceChangeDebounce.schedule(40);
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
    var currDeviceObj = new LiveAPI(consts_1.noFn, 'id ' + state.currDeviceId);
    // Guard: the track/device watchers are independently debounced, so state can
    // be transiently inconsistent during a focus retarget. If the id resolved to
    // a Track/Song instead of a device, skip this pass — the next watcher fire
    // builds the correct tree. Prevents walking parents up to the Song.
    var currType = currDeviceObj.type;
    if (+currDeviceObj.id === 0 || currType === 'Track' || currType === 'Song') {
        (0, utils_1.osc)('/nav/currDeviceId', -1);
        (0, utils_1.osc)('/nav/devices', []);
        return;
    }
    var currIsSupported = (0, utils_1.isDeviceSupported)(currDeviceObj);
    var parentObj = new LiveAPI(consts_1.noFn, currIsSupported
        ? currDeviceObj.get('canonical_parent')
        : 'id ' + state.currTrackId);
    // handle cases where the device has an incomplete jsliveapi implementation, e.g. CC Control
    var parentChildIds = (0, utils_1.cleanArr)(parentObj.get('devices'));
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
            /* PARENT */ parentObj.id,
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
                        /* PARENT */ parentObj.id,
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
                            /* PARENT */ parentObj.id,
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
        if (+parentObj.id === 0)
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
            /* ID     */ parentObj.id,
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
    if (trackChangeDebounce) {
        trackChangeDebounce.cancel();
    }
    trackChangeDebounce = new Task(function () {
        (0, utils_1.osc)('/nav/currTrackId', state.currTrackId);
        // Ensure the current (focus) device exists; if the focus track has none yet,
        // adopt its first device. Routed through focus, so it writes Live's
        // selection only when locked — unlocked it just retargets Knobbler.
        var dp = ctx.focus.devicePath();
        state.api.path = dp || 'live_set';
        if (!dp || +state.api.id === 0) {
            state.api.id = state.currTrackId;
            var devices = (0, utils_1.cleanArr)(state.api.get('devices'));
            if (devices.length > 0) {
                ctx.focus.selectDevice(parseInt(devices[0]));
            }
        }
    });
    trackChangeDebounce.schedule(40);
}
// Re-point a mode-1 'id' observer at a new canonical path; an empty target
// (focus track with no device) detaches it. Re-setting property re-fires the
// callback, pushing fresh nav state.
function repoint(api, target) {
    if (!api)
        return;
    api.property = '';
    if (target) {
        api.path = target;
        api.mode = 1;
        api.property = 'id';
    }
    else {
        api.id = 0;
    }
}
// Focus changed: re-point the nav-tree watchers at Knobbler's current
// track/device so the navigation panel shows the right devices/chains. Dormant
// in locked mode (focus doesn't emit) — the watchers path-follow Live there.
function rebindNavHandles() {
    repoint(state.currTrackWatcher, ctx.focus.trackPath());
    repoint(state.currDeviceWatcher, ctx.focus.devicePath());
}
function init(c) {
    (0, utils_1.setOscSink)(c.osc);
    ctx = c;
    if (!state.api) {
        // One-time setup: reset client info and create the focus-driven observers.
        (0, utils_1.saveSetting)('clientVersion', '');
        (0, utils_1.saveSetting)('clientCapabilities', '');
        state.api = new LiveAPI(consts_1.noFn, 'live_set');
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
