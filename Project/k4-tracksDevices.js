"use strict";
autowatch = 1;
inlets = 1;
outlets = 2;
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(config_1.default);
var CHUNK_MAX_BYTES = 1024;
function clientHasCapability(cap) {
    var caps = (0, utils_1.loadSetting)('clientCapabilities');
    if (!caps) {
        return false;
    }
    return (' ' + caps.toString() + ' ').indexOf(' ' + cap + ' ') !== -1;
}
function sendNavData(prefix, items) {
    var chunked = clientHasCapability('cNav');
    if (chunked) {
        // chunked protocol: start, chunk(s), end
        outlet(consts_1.OUTLET_OSC, [prefix + '/start', items.length]);
        var chunkParts = [];
        var chunkSize = 2; // for the surrounding []
        for (var i = 0; i < items.length; i++) {
            var itemJson = JSON.stringify(items[i]);
            var added = (chunkParts.length > 0 ? 1 : 0) + itemJson.length; // comma + item
            if (chunkParts.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
                outlet(consts_1.OUTLET_OSC, [prefix + '/chunk', '[' + chunkParts.join(',') + ']']);
                chunkParts = [];
                chunkSize = 2;
            }
            chunkParts.push(itemJson);
            chunkSize += added;
        }
        if (chunkParts.length > 0) {
            outlet(consts_1.OUTLET_OSC, [prefix + '/chunk', '[' + chunkParts.join(',') + ']']);
        }
        outlet(consts_1.OUTLET_OSC, [prefix + '/end']);
    }
    // legacy: send full payload for old/unknown clients (may truncate on large sets)
    if (!chunked) {
        outlet(consts_1.OUTLET_OSC, [prefix, JSON.stringify(items)]);
    }
}
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setoutletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
setoutletassist(consts_1.OUTLET_MSGS, 'Messages');
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
        outlet(consts_1.OUTLET_OSC, ['/nav/currDeviceId', -1]);
        //log('/nav/devices=' + JSON.stringify([]))
        sendNavData('/nav/devices', []);
        return;
    }
    //log('NEW CURR DEVICE ID=' + state.currDeviceId)
    outlet(consts_1.OUTLET_OSC, ['/nav/currDeviceId', state.currDeviceId]);
    var ret = [];
    var utilObj = state.api;
    utilObj.path = 'live_set';
    var currDeviceObj = new LiveAPI(consts_1.noFn, 'id ' + state.currDeviceId);
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
        var parentObjParentId = (0, utils_1.cleanArr)(parentObj.get('canonical_parent'))[0];
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
    sendNavData('/nav/devices', ret);
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
        outlet(consts_1.OUTLET_OSC, ['/nav/currTrackId', state.currTrackId]);
        // ensure a device is selected if one exists
        state.api.path = 'live_set view selected_track view selected_device';
        if (+state.api.id === 0) {
            state.api.path = 'live_set view selected_track';
            var devices = (0, utils_1.cleanArr)(state.api.get('devices'));
            if (devices.length > 0) {
                state.api.path = 'live_set view';
                state.api.call('select_device', 'id ' + devices[0]);
            }
        }
    });
    trackChangeDebounce.schedule(40);
}
function init() {
    (0, utils_1.saveSetting)('clientVersion', '');
    (0, utils_1.saveSetting)('clientCapabilities', '');
    state.currDeviceId = null;
    state.currTrackId = null;
    state.api = new LiveAPI(consts_1.noFn, 'live_set');
    state.currTrackWatcher = new LiveAPI(onCurrTrackChange, 'live_set view selected_track');
    state.currTrackWatcher.mode = 1;
    state.currTrackWatcher.property = 'id';
    state.currDeviceWatcher = new LiveAPI(onCurrDeviceChange, 'live_set view selected_track view selected_device');
    state.currDeviceWatcher.mode = 1;
    state.currDeviceWatcher.property = 'id';
}
log('reloaded k4-tracksDevices');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
