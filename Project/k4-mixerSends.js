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
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var toggleInput_1 = require("./toggleInput");
autowatch = 1;
inlets = 1;
outlets = 2;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setoutletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
setoutletassist(consts_1.OUTLET_MSGS, 'Output messages to other objects');
var state = {
    trackLookupObj: null,
    returnTrackColors: [],
    returnsObj: null,
    mixerObj: null,
    trackObj: null,
    lastTrackId: 0,
    volObj: null,
    panObj: null,
    crossfaderObj: null,
    watchers: [],
    pause: {
        send: { paused: false, task: null },
        vol: { paused: false, task: null },
        pan: { paused: false, task: null },
        crossfader: { paused: false, task: null },
    },
};
function pauseUnpause(key) {
    if (state.pause[key].paused) {
        state.pause[key].task.cancel();
        state.pause[key].task.freepeer();
    }
    state.pause[key].paused = true;
    state.pause[key].task = new Task(function () {
        state.pause[key].paused = false;
    });
    state.pause[key].task.schedule(300);
}
var setSendWatcherIds = function (sendIds) {
    for (var i = 0; i < MAX_SENDS; i++) {
        if (sendIds[i] !== undefined) {
            state.watchers[i] && (state.watchers[i].id = sendIds[i]);
        }
        else {
            state.watchers[i] && (state.watchers[i].id = 0);
            outlet(consts_1.OUTLET_OSC, ['/mixer/send' + (i + 1), 0]);
        }
    }
    outlet(consts_1.OUTLET_OSC, ['/mixer/numSends', sendIds.length]);
};
function updateSendVal(slot, val) {
    //log('UPDATESENDVAL ' + idx + ' v=' + val)
    var idx = slot - 1;
    if (!state.watchers[idx]) {
        //log('EARLY ' + idx + ' v=' + val)
        return;
    }
    pauseUnpause('send');
    state.watchers[idx].set('value', val);
}
function handleSendDefault(slot) {
    var idx = slot - 1;
    if (!state.watchers[idx]) {
        //log('EARLY ' + idx + ' v=' + val)
        return;
    }
    state.watchers[idx].set('value', state.watchers[idx].get('default_value'));
}
function toggleXFadeA() {
    if (!state.mixerObj || state.mixerObj.id === 0) {
        return;
    }
    var currState = parseInt(state.mixerObj.get('crossfade_assign'));
    if (currState === 0) {
        // currently enabled, so disable all
        state.mixerObj.set('crossfade_assign', 1);
    }
    else {
        // enable
        state.mixerObj.set('crossfade_assign', 0);
    }
}
function toggleXFadeB() {
    if (!state.mixerObj || state.mixerObj.id === 0) {
        return;
    }
    var currState = parseInt(state.mixerObj.get('crossfade_assign'));
    if (currState === 2) {
        // currently enabled, so disable all
        state.mixerObj.set('crossfade_assign', 1);
    }
    else {
        // enable
        state.mixerObj.set('crossfade_assign', 2);
    }
}
function sendRecordStatus(lookupObj) {
    var armStatus = parseInt(lookupObj.get('can_be_armed')) && parseInt(lookupObj.get('arm'));
    var trackInputStatus = (0, toggleInput_1.getTrackInputStatus)(lookupObj);
    var inputStatus = trackInputStatus && trackInputStatus.inputEnabled;
    outlet(consts_1.OUTLET_OSC, ['/mixer/recordArm', armStatus ? 1 : 0]);
    outlet(consts_1.OUTLET_OSC, ['/mixer/inputEnabled', inputStatus ? 1 : 0]);
}
var Intent;
(function (Intent) {
    Intent[Intent["Enable"] = 0] = "Enable";
    Intent[Intent["Disable"] = 1] = "Disable";
    Intent[Intent["Toggle"] = 2] = "Toggle";
})(Intent || (Intent = {}));
function disableInput() {
    (0, toggleInput_1.disableTrackInput)(state.trackObj);
    sendRecordStatus(state.trackObj);
}
function enableRecord() {
    handleRecordInternal(Intent.Enable);
}
function disableRecord() {
    handleRecordInternal(Intent.Disable);
}
function handleRecordInternal(intent) {
    if (!state.trackObj || state.trackObj.id === 0) {
        return;
    }
    if (intent === Intent.Enable) {
        (0, toggleInput_1.enableTrackInput)(state.trackObj);
        state.trackObj.set('arm', 1);
        // TODO handle exclusive
        var api = new LiveAPI(consts_1.noFn, 'live_set');
        if (parseInt(api.get('exclusive_arm')) === 1) {
            // disarm any other track
            var tracks = (0, utils_1.cleanArr)(api.get('tracks'));
            for (var _i = 0, tracks_1 = tracks; _i < tracks_1.length; _i++) {
                var trackId = tracks_1[_i];
                if (trackId === parseInt(state.trackObj.id.toString())) {
                    continue;
                }
                api.id = trackId;
                if (parseInt(api.get('can_be_armed'))) {
                    api.set('arm', 0);
                }
            }
        }
    }
    else if (intent === Intent.Disable) {
        state.trackObj.set('arm', 0);
    }
    sendRecordStatus(state.trackObj);
}
function toggleMute() {
    if (!state.trackObj || state.trackObj.id === 0) {
        return;
    }
    var currState = parseInt(state.trackObj.get('mute'));
    state.trackObj.set('mute', currState ? 0 : 1);
}
function toggleSolo() {
    if (!state.trackObj || state.trackObj.id === 0) {
        return;
    }
    var currState = parseInt(state.trackObj.get('solo'));
    var newState = currState ? 0 : 1;
    if (newState) {
        // enabling solo, look at exclusive
        var api = new LiveAPI(consts_1.noFn, 'live_set');
        if (parseInt(api.get('exclusive_solo')) === 1) {
            // un-solo any other track
            var tracks = (0, utils_1.cleanArr)(api.get('tracks'));
            var returns = (0, utils_1.cleanArr)(api.get('return_tracks'));
            for (var _i = 0, _a = __spreadArray(__spreadArray([], tracks, true), returns, true); _i < _a.length; _i++) {
                var trackId = _a[_i];
                if (trackId === parseInt(state.trackObj.id.toString())) {
                    continue;
                }
                api.id = trackId;
                api.set('solo', 0);
            }
        }
    }
    state.trackObj.set('solo', newState);
    // TODO handle exclusive
}
function handleCrossfader(val) {
    //log('PAN OVJ VAL=' + val + ' type=' + typeof val)
    if (!state.crossfaderObj || state.crossfaderObj.id === 0) {
        return;
    }
    pauseUnpause('crossfader');
    state.crossfaderObj.set('value', parseFloat(val));
}
function handleCrossfaderDefault() {
    //log('PAN OVJ VAL=' + val + ' type=' + typeof val)
    if (!state.crossfaderObj || state.crossfaderObj.id === 0) {
        return;
    }
    state.crossfaderObj.set('value', parseFloat(state.crossfaderObj.get('default_value')));
}
function handlePan(val) {
    //log('PAN OVJ VAL=' + val + ' type=' + typeof val)
    if (!state.panObj || state.panObj.id === 0) {
        return;
    }
    pauseUnpause('pan');
    state.panObj.set('value', parseFloat(val));
}
function handlePanDefault() {
    //log('PAN OVJ VAL=' + val + ' type=' + typeof val)
    if (!state.panObj || state.panObj.id === 0) {
        return;
    }
    state.panObj.set('value', parseFloat(state.panObj.get('default_value')));
}
function handleVol(val) {
    if (!state.volObj || state.volObj.id === 0) {
        return;
    }
    pauseUnpause('vol');
    state.volObj.set('value', parseFloat(val));
}
function handleVolDefault() {
    if (!state.volObj || state.volObj.id === 0) {
        return;
    }
    state.volObj.set('value', parseFloat(state.volObj.get('default_value')));
}
var handleVolVal = function (val) {
    //log('HANDLE_VOL_VAL val=' + val + ' paused=' + state.pause.vol.paused)
    if (val[0] !== 'value') {
        return;
    }
    if (!state.pause.vol.paused) {
        outlet(consts_1.OUTLET_OSC, ['/mixer/vol', val[1] || 0]);
    }
};
var handlePanVal = function (val) {
    if (val[0] !== 'value') {
        return;
    }
    //log('HANDLE_PAN_VAL i=' + idx + ' val=' + val)
    if (!state.pause.pan.paused) {
        outlet(consts_1.OUTLET_OSC, ['/mixer/pan', val[1] || 0]);
    }
};
var handleCrossfaderVal = function (val) {
    if (val[0] !== 'value') {
        return;
    }
    //log('HANDLE_XFAD_VAL i=' + idx + ' val=' + val)
    if (!state.pause.crossfader.paused) {
        outlet(consts_1.OUTLET_OSC, ['/mixer/crossfader', val[1] || 0]);
    }
};
var handleSendVal = function (idx, val) {
    if (val[0] !== 'value') {
        return;
    }
    //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
    if (!state.pause.send.paused) {
        outlet(consts_1.OUTLET_OSC, ['/mixer/send' + (idx + 1), val[1] || 0]);
    }
};
var MAX_SENDS = 12;
var onTrackChange = function (args) {
    if (!state.trackObj) {
        return;
    }
    if (args[1].toString() !== 'id') {
        return;
    }
    var id = (0, utils_1.cleanArr)(args)[0];
    //log('TRACK CHANGE ' + [id, state.lastTrackId].join(' '))
    if (id === state.lastTrackId) {
        //log('SAME AS LAST, eARLY ' + id)
        return;
    }
    state.lastTrackId = id;
    state.trackLookupObj.id = id;
    // track type
    var path = state.trackLookupObj.unquotedpath;
    var trackType = consts_1.TYPE_TRACK;
    if (path.indexOf('live_set master_track') === 0) {
        trackType = consts_1.TYPE_MAIN;
    }
    else if (path.indexOf('live_set return_tracks') === 0) {
        trackType = consts_1.TYPE_RETURN;
    }
    else if (parseInt(state.trackLookupObj.get('is_foldable')) === 1) {
        trackType = consts_1.TYPE_GROUP;
    }
    outlet(consts_1.OUTLET_OSC, ['/mixer/type', trackType]);
    //log('ON TRACK CHANGE ' + trackType + ' => ' + path)
    sendRecordStatus(state.trackLookupObj);
};
var sendReturnTrackColors = function () {
    outlet(consts_1.OUTLET_OSC, [
        '/mixer/returnTrackColors',
        JSON.stringify(state.returnTrackColors),
    ]);
};
var onReturnsChange = function (args) {
    if (!state.returnsObj || args[0] !== 'return_tracks') {
        return;
    }
    //log('ON RETURNS CHANGE ' + args)
    var api = new LiveAPI(consts_1.noFn, 'live_set');
    var returnIds = (0, utils_1.cleanArr)(args);
    for (var i = 0; i < MAX_SENDS; i++) {
        var color = consts_1.DEFAULT_COLOR;
        if (returnIds[i]) {
            api.id = returnIds[i];
            color = (0, utils_1.colorToString)(api.get('color').toString());
        }
        state.returnTrackColors[i] = '#' + color;
    }
    sendReturnTrackColors();
};
function refresh() {
    state.watchers = [];
    state.trackLookupObj = null;
    state.returnsObj = null;
    state.mixerObj = null;
    state.trackObj = null;
    state.volObj = null;
    state.panObj = null;
    state.crossfaderObj = null;
    state.lastTrackId = 0;
    init();
}
function init() {
    if (state.watchers.length === MAX_SENDS) {
        return;
    }
    var _loop_1 = function (i) {
        var watcher = new LiveAPI(function (val) { return handleSendVal(i, val); }, 'live_set');
        state.watchers.push(watcher);
        watcher.property = 'value';
    };
    for (var i = 0; i < MAX_SENDS; i++) {
        _loop_1(i);
    }
    if (!state.trackLookupObj) {
        state.trackLookupObj = new LiveAPI(consts_1.noFn, 'live_set');
    }
    // returns obj
    state.returnTrackColors = [];
    if (!state.returnsObj) {
        state.returnsObj = new LiveAPI(onReturnsChange, 'live_set');
        state.returnsObj.property = 'return_tracks';
        state.returnsObj.mode = 1;
    }
    // mixer obj
    if (!state.mixerObj) {
        state.mixerObj = new LiveAPI(consts_1.noFn, 'live_set view selected_track mixer_device');
        state.mixerObj.mode = 1;
    }
    // track obj
    if (!state.trackObj) {
        state.trackObj = new LiveAPI(onTrackChange, 'live_set view selected_track');
        state.trackObj.mode = 1;
        state.trackObj.property = 'id';
    }
    // volume obj
    if (!state.volObj) {
        state.volObj = new LiveAPI(handleVolVal, 'live_set view selected_track mixer_device volume');
        state.volObj.mode = 1;
        state.volObj.property = 'value';
    }
    // pan obj
    if (!state.panObj) {
        state.panObj = new LiveAPI(handlePanVal, 'live_set view selected_track mixer_device panning');
        state.panObj.property = 'value';
        state.panObj.mode = 1;
    }
    // crossfader obj
    if (!state.crossfaderObj) {
        state.crossfaderObj = new LiveAPI(handleCrossfaderVal, 'live_set master_track mixer_device crossfader');
        state.crossfaderObj.property = 'value';
        state.crossfaderObj.mode = 1;
    }
    outlet(consts_1.OUTLET_MSGS, ['gate', 1]);
}
function handleSends() {
    var sendArr = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        sendArr[_i] = arguments[_i];
    }
    //log('HANDLE SENDS ' + sendArr)
    var sendIds = (0, utils_1.cleanArr)(sendArr);
    setSendWatcherIds(sendIds);
}
log('reloaded k4-mixerSends');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
