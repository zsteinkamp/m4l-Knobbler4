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
var MAX_LEN = 32;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setinletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
var state = {
    api: null,
    periodicTask: null,
    deviceDepth: {},
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
function cleanArr(arr) {
    if (!arr || arr.length === 0) {
        return [];
    }
    return arr.filter(function (e) {
        return parseInt(e).toString() === e.toString();
    });
}
function getTracksFor(trackIds) {
    var ret = [];
    for (var _i = 0, trackIds_1 = trackIds; _i < trackIds_1.length; _i++) {
        var trackId = trackIds_1[_i];
        state.api.id = trackId;
        var trackObj = [
            trackId,
            (0, utils_1.truncate)(state.api.get('name').toString(), MAX_LEN),
            (0, utils_1.colorToString)(state.api.get('color').toString()),
        ];
        ret.push(trackObj);
    }
    return ret;
}
function getDevicesFor(deviceIds) {
    var ret = [];
    for (var _i = 0, deviceIds_1 = deviceIds; _i < deviceIds_1.length; _i++) {
        var deviceId = deviceIds_1[_i];
        state.api.id = deviceId;
        var deviceObj = [
            deviceId,
            (0, utils_1.truncate)(state.api.get('name').toString(), MAX_LEN),
            state.deviceDepth[deviceId] || 0,
        ];
        ret.push(deviceObj);
    }
    return ret;
}
function updateTypePeriodic(type) {
    var stateObj = state[type];
    if (!stateObj) {
        //log('EARLY UPDATE PERIODIC ' + type)
        return;
    }
    var objFn = type === 'device' ? getDevicesFor : getTracksFor;
    stateObj.objs = objFn(stateObj.ids.slice(0, 128)); // limit
    var strVal = JSON.stringify(stateObj.objs);
    // no change, return
    if (strVal == stateObj.last) {
        //log('NOCHG UPDATE PERIODIC ' + type)
        return;
    }
    //log(
    //  type.toUpperCase() +
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
function checkAndDescend(stateObj, objId, depth) {
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
        //log('DESCENDING FROM ' + objId)
        var chains = cleanArr(state.api.get('chains'));
        //log('>> GOT CHAINS ' + JSON.stringify(chains))
        for (var _i = 0, chains_1 = chains; _i < chains_1.length; _i++) {
            var chainId = chains_1[_i];
            state.api.id = chainId;
            var devices = cleanArr(state.api.get('devices'));
            for (var _a = 0, devices_1 = devices; _a < devices_1.length; _a++) {
                var deviceId = devices_1[_a];
                checkAndDescend(stateObj, deviceId, depth + 1);
            }
        }
        var returnChains = cleanArr(rawReturnChains || []);
        //log('>> GOT RETURN_CHAINS ' + JSON.stringify(returnChains))
        for (var _b = 0, returnChains_1 = returnChains; _b < returnChains_1.length; _b++) {
            var returnChainId = returnChains_1[_b];
            state.api.id = returnChainId;
            var devices = cleanArr(state.api.get('devices'));
            for (var _c = 0, devices_2 = devices; _c < devices_2.length; _c++) {
                var deviceId = devices_2[_c];
                checkAndDescend(stateObj, deviceId, depth + 1);
            }
        }
    }
}
function updateGeneric(type, val) {
    var stateObj = state[type];
    stateObj.ids = [];
    var idArr = cleanArr(val);
    if (type === 'device') {
        for (var _i = 0, idArr_1 = idArr; _i < idArr_1.length; _i++) {
            var objId = idArr_1[_i];
            //log('>>> OBJID ' + objId)
            checkAndDescend(stateObj, objId, 0);
        }
    }
    else {
        stateObj.ids = __spreadArray([], idArr, true);
    }
    updateTypePeriodic(type);
}
function updateTracks(val) {
    //log('HERE TRACKS ' + JSON.stringify(val))
    if (val[0] !== 'visible_tracks') {
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
    //log('HERE DEVICES')
    if (val[0] !== 'devices') {
        //log('DEVICES EARLY')
        return;
    }
    updateGeneric('device', val);
}
function init() {
    //log('INIT')
    state.deviceDepth = {};
    state.track = { watch: null, ids: [], objs: [], last: null };
    state.return = { watch: null, ids: [], objs: [], last: null };
    state.main = { watch: null, ids: [], objs: [], last: null };
    state.device = { watch: null, ids: [], objs: [], last: null };
    // general purpose API obj to do lookups, etc
    state.api = new LiveAPI(consts_1.noFn, 'live_set');
    // set up track watcher, calls function to assemble and send tracks when changes
    state.track.watch = new LiveAPI(updateTracks, 'live_set');
    state.track.watch.property = 'visible_tracks';
    state.return.watch = new LiveAPI(updateReturns, 'live_set');
    state.return.watch.property = 'return_tracks';
    state.main.watch = new LiveAPI(updateMain, 'live_set master_track');
    state.main.watch.property = 'id';
    state.device.watch = new LiveAPI(updateDevices, 'live_set view selected_track');
    state.device.watch.mode = 1; // follow path, not object
    state.device.watch.property = 'devices';
    if (state.periodicTask) {
        state.periodicTask.cancel();
    }
    // just poll for name/color changes rather than attaching potentially many
    // hundreds of property listeners
    state.periodicTask = new Task(function () {
        //log('TOP TASK')
        for (var _i = 0, _a = ['track', 'return', 'main', 'device']; _i < _a.length; _i++) {
            var type = _a[_i];
            updateTypePeriodic(type);
        }
    });
    state.periodicTask.interval = 1000;
    state.periodicTask.repeat(-1);
}
log('reloaded k4-tracksDevices');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
