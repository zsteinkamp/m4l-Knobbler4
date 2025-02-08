"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 2;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setoutletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
setoutletassist(consts_1.OUTLET_MSGS, 'Output messages to other objects');
var state = {
    mixerObj: null,
    trackObj: null,
    lastTrackId: null,
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
    }
    state.pause[key].paused = true;
    state.pause[key].task = new Task(function () {
        state.pause[key].paused = false;
    });
    state.pause[key].task.schedule(300);
}
function updateSendVal(idx, val) {
    //log('UPDATESENDVAL ' + idx + ' v=' + val)
    idx -= 1;
    if (!state.watchers[idx]) {
        //log('EARLY ' + idx + ' v=' + val)
        return;
    }
    pauseUnpause('send');
    state.watchers[idx].set('value', val);
}
function handleSendDefault(idx) {
    idx = idx - 1;
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
function toggleRecordArm() {
    if (!state.trackObj || state.trackObj.id === 0) {
        return;
    }
    var currState = parseInt(state.trackObj.get('arm'));
    state.trackObj.set('arm', currState ? 0 : 1);
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
    state.trackObj.set('solo', currState ? 0 : 1);
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
    if (val[0] !== 'value') {
        return;
    }
    //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
    if (!state.pause.vol.paused) {
        outlet(consts_1.OUTLET_OSC, '/mixer/vol', [val[1] || 0]);
    }
};
var handlePanVal = function (val) {
    if (val[0] !== 'value') {
        return;
    }
    //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
    if (!state.pause.pan.paused) {
        outlet(consts_1.OUTLET_OSC, '/mixer/pan', [val[1] || 0]);
    }
};
var handleCrossfaderVal = function (val) {
    if (val[0] !== 'value') {
        return;
    }
    //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
    if (!state.pause.crossfader.paused) {
        outlet(consts_1.OUTLET_OSC, '/mixer/crossfader', [val[1] || 0]);
    }
};
var handleSendVal = function (idx, val) {
    if (val[0] !== 'value') {
        return;
    }
    //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
    if (!state.pause.send.paused) {
        outlet(consts_1.OUTLET_OSC, '/mixer/send' + (idx + 1), [val[1] || 0]);
    }
};
var MAX_SENDS = 12;
var onTrackChange = function (args) {
    if (!state.trackObj || state.trackObj.id === 0) {
        return;
    }
    var id = parseInt((0, utils_1.cleanArr)(args)[0]);
    if (id === state.lastTrackId) {
        return;
    }
    state.lastTrackId = id;
    // track type
    var path = state.trackObj.unquotedpath;
    var trackType = consts_1.TYPE_TRACK;
    if (path.indexOf('live_set master_track') === 0) {
        trackType = consts_1.TYPE_MAIN;
    }
    else if (path.indexOf('live_set return_tracks') === 0) {
        trackType = consts_1.TYPE_RETURN;
    }
    else if (parseInt(state.trackObj.get('is_foldable')) === 1) {
        trackType = consts_1.TYPE_GROUP;
    }
    outlet(consts_1.OUTLET_OSC, '/mixer/type', [trackType]);
    // disable volume/pan for MIDI tracks
    var hasOutput = parseInt(state.trackObj.get('has_audio_output'));
    outlet(consts_1.OUTLET_OSC, '/mixer/hasOutput', [hasOutput]);
    //log('ON TRACK CHANGE ' + trackType + ' => ' + path)
};
function refresh() {
    state.watchers = [];
    state.mixerObj = null;
    state.trackObj = null;
    state.volObj = null;
    state.panObj = null;
    state.crossfaderObj = null;
    state.lastTrackId = null;
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
    // mixer obj
    if (!state.mixerObj) {
        (state.mixerObj = new LiveAPI(consts_1.noFn, 'live_set view selected_track mixer_device')),
            (state.mixerObj.mode = 1);
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
        state.volObj.property = 'value';
        state.volObj.mode = 1;
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
}
function handleSends() {
    var sendArr = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        sendArr[_i] = arguments[_i];
    }
    var sendIds = (0, utils_1.cleanArr)(sendArr);
    for (var i = 0; i < MAX_SENDS; i++) {
        if (sendIds[i] !== undefined) {
            state.watchers[i].id = sendIds[i];
        }
        else {
            state.watchers[i].id = 0;
        }
    }
    outlet(consts_1.OUTLET_OSC, '/mixer/numSends', sendIds.length);
    init();
}
log('reloaded k4-mixerSends');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
