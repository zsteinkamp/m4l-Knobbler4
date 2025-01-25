"use strict";
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
    device: {
        watch: null,
        ids: [],
        objs: [],
        last: null,
    },
};
function cleanArr(arr) {
    return arr.filter(function (e) {
        return parseInt(e).toString() === e.toString();
    });
}
function getTracksFor(trackIds) {
    //log('HERE: ' + JSON.stringify(val))
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
            state.api.get('class_display_name').toString(),
        ];
        ret.push(deviceObj);
    }
    return ret;
}
function updateTypePeriodic(type) {
    var stateObj = state[type];
    var objFn = type === 'device' ? getDevicesFor : getTracksFor;
    stateObj.objs = objFn(stateObj.ids.slice(0, 200)); // limit 200 returns
    var strVal = JSON.stringify(stateObj.objs);
    // no change, return
    if (strVal == stateObj.last) {
        return;
    }
    //log(type.toUpperCase() + ': ' + strVal)
    outlet(consts_1.OUTLET_OSC, '/' + type + 'List', strVal);
    stateObj.last = strVal;
}
function updateGeneric(type, val) {
    var stateObj = state[type];
    stateObj.ids = cleanArr(val);
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
    state.track = { watch: null, ids: [], objs: [], last: null };
    state.return = { watch: null, ids: [], objs: [], last: null };
    state.device = { watch: null, ids: [], objs: [], last: null };
    // general purpose API obj to do lookups, etc
    state.api = new LiveAPI(consts_1.noFn, 'live_set');
    // set up track watcher, calls function to assemble and send tracks when changes
    state.track.watch = new LiveAPI(updateTracks, 'live_set');
    state.track.watch.property = 'visible_tracks';
    state.return.watch = new LiveAPI(updateReturns, 'live_set');
    state.return.watch.property = 'return_tracks';
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
        for (var _i = 0, _a = ['track', 'return', 'device']; _i < _a.length; _i++) {
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
