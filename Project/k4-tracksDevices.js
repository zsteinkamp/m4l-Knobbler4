"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
autowatch = 1;
inlets = 1;
outlets = 1;
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setinletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
var state = {
    api: null,
    deviceDepth: {},
    deviceType: {},
    trackType: {},
    track: {
        watch: null,
        ids: [],
        objs: [],
        last: null,
    },
    return: {
        watch: null,
        ids: [],
        objs: [],
        last: null,
    },
    main: {
        watch: null,
        ids: [],
        objs: [],
        last: null,
    },
    device: {
        watch: null,
        ids: [],
        objs: [],
        last: null,
    },
};
// make a tree so we can get depth
var getEmptyTreeNode = function () { return ({
    children: [],
    parent: null,
}); };
var makeTrackTree = function (trackIds) {
    var tree = {
        0: getEmptyTreeNode(),
    };
    for (var _i = 0, trackIds_1 = trackIds; _i < trackIds_1.length; _i++) {
        var trackId = trackIds_1[_i];
        state.api.id = trackId;
        var parentId = (0, utils_1.cleanArr)(state.api.get('group_track'))[0];
        //log(trackId + ' PARENT_ID ' + parentId)
        if (!tree[trackId]) {
            tree[trackId] = getEmptyTreeNode();
        }
        tree[trackId].parent = parentId;
        if (!tree[parentId]) {
            tree[parentId] = getEmptyTreeNode();
        }
        tree[parentId].children.push(trackId);
    }
    return tree;
};
function getDepthForId(trackId, tree) {
    var parentId = tree[trackId].parent;
    var depth = 0;
    while (parentId > 0) {
        depth++;
        parentId = tree[parentId].parent;
    }
    return depth;
}
function getTracksFor(trackIds) {
    var ret = [];
    var tree = makeTrackTree(trackIds);
    //log(JSON.stringify(tree))
    for (var _i = 0, trackIds_2 = trackIds; _i < trackIds_2.length; _i++) {
        var trackId = trackIds_2[_i];
        state.api.id = trackId;
        //const info = state.api.info
        var isTrack = state.api.info.toString().indexOf('type Track') > -1;
        //if (isTrack) {
        //  log('INFO FOR TRACK' + info)
        //}
        var isFoldable = isTrack && parseInt(state.api.get('is_foldable'));
        var trackObj = [
            /* TYPE   */ state.trackType[trackId] ||
                (isFoldable ? consts_1.TYPE_GROUP : consts_1.TYPE_TRACK),
            /* ID     */ trackId,
            /* NAME   */ (0, utils_1.truncate)(state.api.get('name').toString(), consts_1.MAX_NAME_LEN),
            /* COLOR  */ (0, utils_1.colorToString)(state.api.get('color').toString()),
            /* INDENT */ getDepthForId(trackId, tree),
        ];
        ret.push(trackObj);
    }
    return ret;
}
function getDevicesFor(deviceIds) {
    //log('GET DEVICES FOR ' + deviceIds.join(','))
    var ret = [];
    var parentColors = {};
    for (var _i = 0, deviceIds_1 = deviceIds; _i < deviceIds_1.length; _i++) {
        var deviceId = deviceIds_1[_i];
        state.api.id = deviceId;
        //log('GET DEVICES FOR type=' + state.api.type)
        if (state.api.type === 'Song') {
            // stale/invalid id
            continue;
        }
        var color = null;
        if (state.deviceType[deviceId] === consts_1.TYPE_CHAIN) {
            color = (0, utils_1.colorToString)(state.api.get('color').toString()) || consts_1.DEFAULT_COLOR;
        }
        else {
            var parentId = (0, utils_1.cleanArr)(state.api.get('canonical_parent'))[0];
            if (!parentColors[parentId]) {
                state.api.id = parentId;
                parentColors[parentId] =
                    (0, utils_1.colorToString)(state.api.get('color').toString()) || consts_1.DEFAULT_COLOR;
                state.api.id = deviceId;
            }
            color = parentColors[parentId];
        }
        var deviceObj = [
            state.deviceType[deviceId] || consts_1.TYPE_DEVICE,
            deviceId,
            (0, utils_1.truncate)(state.api.get('name').toString(), consts_1.MAX_NAME_LEN),
            color,
            state.deviceDepth[deviceId] || 0,
        ];
        ret.push(deviceObj);
    }
    //log('END DEVICES FOR ' + deviceIds.join(','))
    return ret;
}
function checkAndDescend(stateObj, objId, depth) {
    if (objId === 0) {
        //log('Zero ObjId')
        return;
    }
    stateObj.ids.push(objId);
    state.deviceDepth[objId] = depth;
    state.api.id = objId;
    var className = state.api.get('class_display_name').toString();
    //log('CLASS_NAME: ' + className)
    var rawReturnChains = [];
    if (className === 'Drum Rack') {
        rawReturnChains = state.api.get('return_chains');
        //log(
        //  '>> RAW RETURN_CHAINS ' +
        //    className +
        //    ' ' +
        //    JSON.stringify(rawReturnChains)
        //)
    }
    if (parseInt(state.api.get('can_have_chains'))) {
        state.deviceType[objId] = consts_1.TYPE_RACK;
        //log('DESCENDING FROM ' + objId)
        var chains = (0, utils_1.cleanArr)(state.api.get('chains'));
        //log('>> GOT CHAINS ' + JSON.stringify(chains))
        for (var _i = 0, chains_1 = chains; _i < chains_1.length; _i++) {
            var chainId = chains_1[_i];
            stateObj.ids.push(chainId);
            state.deviceType[chainId] = consts_1.TYPE_CHAIN;
            state.deviceDepth[chainId] = depth + 1;
            state.api.id = chainId;
            var devices = (0, utils_1.cleanArr)(state.api.get('devices'));
            for (var _a = 0, devices_1 = devices; _a < devices_1.length; _a++) {
                var deviceId = devices_1[_a];
                checkAndDescend(stateObj, deviceId, depth + 2);
            }
        }
        var returnChains = (0, utils_1.cleanArr)(rawReturnChains || []);
        //log('>> GOT RETURN_CHAINS ' + JSON.stringify(returnChains))
        for (var _b = 0, returnChains_1 = returnChains; _b < returnChains_1.length; _b++) {
            var returnChainId = returnChains_1[_b];
            stateObj.ids.push(returnChainId);
            state.deviceType[returnChainId] = consts_1.TYPE_CHAIN;
            state.deviceDepth[returnChainId] = depth + 1;
            state.api.id = returnChainId;
            var devices = (0, utils_1.cleanArr)(state.api.get('devices'));
            for (var _c = 0, devices_2 = devices; _c < devices_2.length; _c++) {
                var deviceId = devices_2[_c];
                checkAndDescend(stateObj, deviceId, depth + 2);
            }
        }
    }
}
function getObjs(type, val) {
    var stateObj = state[type];
    stateObj.ids = [];
    var idArr = (0, utils_1.cleanArr)(val);
    if (type === 'device') {
        for (var _i = 0, idArr_1 = idArr; _i < idArr_1.length; _i++) {
            var objId = idArr_1[_i];
            //log('>>> OBJID ' + objId)
            checkAndDescend(stateObj, objId, 0);
        }
    }
    else {
        for (var _a = 0, idArr_2 = idArr; _a < idArr_2.length; _a++) {
            var objId = idArr_2[_a];
            if (type === 'return') {
                state.trackType[objId] = consts_1.TYPE_RETURN;
            }
            else if (type === 'main') {
                state.trackType[objId] = consts_1.TYPE_MAIN;
            }
        }
        stateObj.ids = __spreadArray([], idArr, true);
    }
}
function updateGeneric(type, val) {
    //log('UPDATE GENERIC ' + type + ' vals=' + JSON.stringify(val))
    getObjs(type, val);
    var stateObj = state[type];
    if (!stateObj) {
        //log('EARLY UPDATE GENERIC ' + type)
        return;
    }
    var objFn = type === 'device' ? getDevicesFor : getTracksFor;
    stateObj.objs = objFn((stateObj.ids || []).slice(0, 128)); // limit
    var strVal = JSON.stringify(stateObj.objs);
    // no change, return
    if (strVal == stateObj.last) {
        //log('NOCHG UPDATE GENERIC ' + type)
        return;
    }
    //log(
    //  '/' +
    //    type +
    //    'List :: ' +
    //    type.toUpperCase() +
    //    ': ' +
    //    stateObj.objs.length +
    //    ' : ' +
    //    strVal.length +
    //    ' => ' +
    //    strVal
    //)
    outlet(consts_1.OUTLET_OSC, '/' + type + 'List', strVal);
    stateObj.last = strVal;
}
function updateTracks(val) {
    //log('HERE TRACKS ' + JSON.stringify(val))
    if (val[0] !== 'tracks') {
        //log('TRACKS EARLY')
        return;
    }
    updateGeneric('track', val);
}
function updateReturns(val) {
    //log('HERE RETURNS')
    if (val[0] !== 'return_tracks') {
        //log('RETURNS EARLY')
        return;
    }
    updateGeneric('return', val);
}
function updateMain(val) {
    //log('HERE MAIN ' + val.toString())
    if (val[0] !== 'id') {
        //log('MAIN EARLY')
        return;
    }
    updateGeneric('main', val);
}
function updateDevices(val) {
    //log('HERE DEVICES ' + JSON.stringify(val))
    if (val[0] !== 'devices') {
        //log('DEVICES EARLY')
        return;
    }
    updateGeneric('device', val);
}
function init() {
    //log('TRACKS DEVICES INIT')
    state.deviceDepth = {};
    state.track = { watch: null, ids: [], objs: [], last: null };
    state.return = { watch: null, ids: [], objs: [], last: null };
    state.main = { watch: null, ids: [], objs: [], last: null };
    state.device = { watch: null, ids: [], objs: [], last: null };
    state.deviceType = {};
    state.trackType = {};
    state.api = null;
    // general purpose API obj to do lookups, etc
    state.api = new LiveAPI(consts_1.noFn, 'live_set');
    // set up watchers for each type, calls function to assemble and send OSC
    // messages with the type lists when changes
    state.track.watch = new LiveAPI(updateTracks, 'live_set');
    state.track.watch.property = 'tracks';
    state.return.watch = new LiveAPI(updateReturns, 'live_set');
    state.return.watch.property = 'return_tracks';
    state.main.watch = new LiveAPI(updateMain, 'live_set master_track');
    state.main.watch.property = 'id';
    state.device.watch = new LiveAPI(updateDevices, 'live_set view selected_track');
    state.device.watch.mode = 1; // follow path, not object
    state.device.watch.property = 'devices';
}
log('reloaded k4-tracksDevices');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
