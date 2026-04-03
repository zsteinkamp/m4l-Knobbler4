"use strict";
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
autowatch = 1;
inlets = 1;
outlets = 2;
const utils_1 = require("./utils");
const config_1 = require("./config");
const consts_1 = require("./consts");
const log = (0, utils_1.logFactory)(config_1.default);
const CHUNK_MAX_BYTES = 1024;
function clientHasCapability(cap) {
    const caps = (0, utils_1.loadSetting)('clientCapabilities');
    if (!caps) {
        return false;
    }
    return (' ' + caps.toString() + ' ').indexOf(' ' + cap + ' ') !== -1;
}
function sendNavData(prefix, items) {
    const chunked = clientHasCapability('cNav');
    if (chunked) {
        // chunked protocol: start, chunk(s), end
        outlet(consts_1.OUTLET_OSC, [prefix + '/start', items.length]);
        let chunkParts = [];
        let chunkSize = 2; // for the surrounding []
        for (let i = 0; i < items.length; i++) {
            const itemJson = JSON.stringify(items[i]);
            const added = (chunkParts.length > 0 ? 1 : 0) + itemJson.length; // comma + item
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
const state = {
    api: null,
    currDeviceId: null,
    currDeviceWatcher: null,
    currTrackId: null,
    currTrackWatcher: null,
};
let deviceChangeDebounce = null;
function onCurrDeviceChange(val) {
    if (val[0] !== 'id') {
        return;
    }
    const newId = (0, utils_1.cleanArr)(val)[0];
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
    const ret = [];
    const utilObj = state.api;
    utilObj.path = 'live_set';
    const currDeviceObj = new LiveAPI(consts_1.noFn, 'id ' + state.currDeviceId);
    const currIsSupported = (0, utils_1.isDeviceSupported)(currDeviceObj);
    const parentObj = new LiveAPI(consts_1.noFn, currIsSupported
        ? currDeviceObj.get('canonical_parent')
        : 'id ' + state.currTrackId);
    // handle cases where the device has an incomplete jsliveapi implementation, e.g. CC Control
    const parentChildIds = (0, utils_1.cleanArr)(parentObj.get('devices'));
    // first, self and siblings (with chain children under self)
    for (const childDeviceId of parentChildIds) {
        utilObj.id = childDeviceId;
        const objIsSupported = (0, utils_1.isDeviceSupported)(utilObj);
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
                const chainIds = (0, utils_1.cleanArr)(utilObj.get('chains'));
                for (const chainId of chainIds) {
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
                    const returnChainIds = (0, utils_1.cleanArr)(currDeviceObj.get('return_chains'));
                    for (const chainId of returnChainIds) {
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
    let indent = 0;
    let watchdog = 0;
    while (parentObj.type !== 'Track' && watchdog < 20) {
        const isChain = parentObj.type === 'Chain' || parentObj.type === 'DrumChain';
        let color = null;
        if (isChain) {
            color = (0, utils_1.colorToString)(parentObj.get('color').toString());
        }
        else {
            const grandparentId = (0, utils_1.cleanArr)(parentObj.get('canonical_parent'))[0];
            utilObj.id = grandparentId;
            color = (0, utils_1.colorToString)(utilObj.get('color').toString());
        }
        const parentObjParentId = (0, utils_1.cleanArr)(parentObj.get('canonical_parent'))[0];
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
        const baseIndent = ret[0][consts_1.FIELD_INDENT];
        for (const maxObj of ret) {
            maxObj[consts_1.FIELD_INDENT] -= baseIndent;
        }
    }
    //log('/nav/devices=' + JSON.stringify(ret))
    sendNavData('/nav/devices', ret);
}
let trackChangeDebounce = null;
function onCurrTrackChange(val) {
    if (val[0] !== 'id' && val[1].toString() !== 'id') {
        return;
    }
    const newId = (0, utils_1.cleanArr)(val)[0];
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
            const devices = (0, utils_1.cleanArr)(state.api.get('devices'));
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
module.exports = {};
