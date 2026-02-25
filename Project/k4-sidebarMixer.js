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
inlets = 2;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
var INLET_PAGE = 1;
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setinletassist(INLET_PAGE, 'Page change messages');
setoutletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
var state = {
    trackLookupObj: null,
    returnsObj: null,
    mixerObj: null,
    trackObj: null,
    lastTrackId: 0,
    volObj: null,
    panObj: null,
    crossfaderObj: null,
    watchers: [],
    onMixerPage: false,
    metersEnabled: false,
    hasOutput: false,
    meterLeftObj: null,
    meterRightObj: null,
    meterLevelObj: null,
    meterBuffer: [0, 0, 0],
    meterDirty: false,
    meterFlushTask: null,
    pause: {
        send: { paused: false, task: null },
        vol: { paused: false, task: null },
        pan: { paused: false, task: null },
        crossfader: { paused: false, task: null },
    },
};
// ---------------------------------------------------------------------------
// Meter observers
// ---------------------------------------------------------------------------
function ensureMeterObservers() {
    if (state.meterLeftObj)
        return;
    state.meterLeftObj = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_left') {
            var v = (0, utils_1.meterVal)(args[1]);
            if (v !== state.meterBuffer[0]) {
                state.meterBuffer[0] = v;
                state.meterDirty = true;
            }
        }
    }, 'live_set');
    state.meterRightObj = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_right') {
            var v = (0, utils_1.meterVal)(args[1]);
            if (v !== state.meterBuffer[1]) {
                state.meterBuffer[1] = v;
                state.meterDirty = true;
            }
        }
    }, 'live_set');
    state.meterLevelObj = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_level') {
            var v = (0, utils_1.meterVal)(args[1]);
            if (v !== state.meterBuffer[2]) {
                state.meterBuffer[2] = v;
                state.meterDirty = true;
            }
        }
    }, 'live_set');
}
function pointMetersAt(trackPath) {
    ensureMeterObservers();
    state.meterLeftObj.path = trackPath;
    state.meterLeftObj.property = 'output_meter_left';
    state.meterRightObj.path = trackPath;
    state.meterRightObj.property = 'output_meter_right';
    state.meterLevelObj.path = trackPath;
    state.meterLevelObj.property = 'output_meter_level';
}
function disableMeters() {
    if (state.meterLeftObj)
        state.meterLeftObj.id = 0;
    if (state.meterRightObj)
        state.meterRightObj.id = 0;
    if (state.meterLevelObj)
        state.meterLevelObj.id = 0;
    state.meterBuffer[0] = 0;
    state.meterBuffer[1] = 0;
    state.meterBuffer[2] = 0;
}
function startMeterFlush() {
    if (state.meterFlushTask)
        return;
    state.meterFlushTask = new Task(function () {
        if (state.meterDirty) {
            state.meterDirty = false;
            outlet(consts_1.OUTLET_OSC, ['/mixer/meters', JSON.stringify(state.meterBuffer)]);
        }
        state.meterFlushTask.schedule(consts_1.METER_FLUSH_MS);
    });
    state.meterFlushTask.schedule(consts_1.METER_FLUSH_MS);
}
function stopMeterFlush() {
    if (!state.meterFlushTask)
        return;
    state.meterFlushTask.cancel();
    state.meterFlushTask.freepeer();
    state.meterFlushTask = null;
}
function sidebarMeters(val) {
    var enabled = !!parseInt(val.toString());
    state.metersEnabled = enabled;
    (0, utils_1.osc)('/sidebarMeters', state.metersEnabled ? 1 : 0);
    if (state.metersEnabled && state.hasOutput && state.trackLookupObj) {
        pointMetersAt(state.trackLookupObj.unquotedpath);
        if (!state.onMixerPage)
            startMeterFlush();
    }
    else {
        stopMeterFlush();
        disableMeters();
    }
}
function page() {
    var pageName = arguments[0].toString();
    var wasMixerPage = state.onMixerPage;
    state.onMixerPage = pageName === 'mixer';
    if (!state.onMixerPage && wasMixerPage) {
        if (state.metersEnabled && state.hasOutput)
            startMeterFlush();
    }
    else if (state.onMixerPage && !wasMixerPage) {
        stopMeterFlush();
    }
}
// ---------------------------------------------------------------------------
// Send watcher management
// ---------------------------------------------------------------------------
var setSendWatcherIds = function (sendIds) {
    for (var i = 0; i < consts_1.MAX_SENDS; i++) {
        if (sendIds[i] !== undefined) {
            state.watchers[i] && (state.watchers[i].id = sendIds[i]);
        }
        else {
            state.watchers[i] && (state.watchers[i].id = 0);
            (0, utils_1.osc)(utils_1.SEND_ADDR[i], 0);
        }
    }
};
// ---------------------------------------------------------------------------
// Command handlers (called by Max message dispatch)
// ---------------------------------------------------------------------------
function updateSendVal(slot, val) {
    var idx = slot - 1;
    if (!state.watchers[idx]) {
        return;
    }
    (0, utils_1.pauseUnpause)(state.pause['send'], consts_1.PAUSE_MS);
    state.watchers[idx].set('value', val);
}
function handleSendDefault(slot) {
    var idx = slot - 1;
    if (!state.watchers[idx]) {
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
        state.mixerObj.set('crossfade_assign', 1);
    }
    else {
        state.mixerObj.set('crossfade_assign', 0);
    }
}
function toggleXFadeB() {
    if (!state.mixerObj || state.mixerObj.id === 0) {
        return;
    }
    var currState = parseInt(state.mixerObj.get('crossfade_assign'));
    if (currState === 2) {
        state.mixerObj.set('crossfade_assign', 1);
    }
    else {
        state.mixerObj.set('crossfade_assign', 2);
    }
}
function sendRecordStatus(lookupObj) {
    var armStatus = parseInt(lookupObj.get('can_be_armed')) && parseInt(lookupObj.get('arm'));
    var trackInputStatus = (0, toggleInput_1.getTrackInputStatus)(lookupObj);
    var inputStatus = trackInputStatus && trackInputStatus.inputEnabled;
    (0, utils_1.osc)('/mixer/recordArm', armStatus ? 1 : 0);
    (0, utils_1.osc)('/mixer/inputEnabled', inputStatus ? 1 : 0);
}
var Intent;
(function (Intent) {
    Intent[Intent["Enable"] = 0] = "Enable";
    Intent[Intent["Disable"] = 1] = "Disable";
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
        var api = new LiveAPI(consts_1.noFn, 'live_set');
        if (parseInt(api.get('exclusive_arm')) === 1) {
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
    var newState = currState ? 0 : 1;
    state.trackObj.set('mute', newState);
    (0, utils_1.osc)('/mixer/mute', newState);
}
function toggleSolo() {
    if (!state.trackObj || state.trackObj.id === 0) {
        return;
    }
    var currState = parseInt(state.trackObj.get('solo'));
    var newState = currState ? 0 : 1;
    if (newState) {
        var api = new LiveAPI(consts_1.noFn, 'live_set');
        if (parseInt(api.get('exclusive_solo')) === 1) {
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
    (0, utils_1.osc)('/mixer/solo', newState);
}
function handleCrossfader(val) {
    if (!state.crossfaderObj || state.crossfaderObj.id === 0) {
        return;
    }
    (0, utils_1.pauseUnpause)(state.pause['crossfader'], consts_1.PAUSE_MS);
    state.crossfaderObj.set('value', parseFloat(val));
}
function handleCrossfaderDefault() {
    if (!state.crossfaderObj || state.crossfaderObj.id === 0) {
        return;
    }
    state.crossfaderObj.set('value', parseFloat(state.crossfaderObj.get('default_value')));
}
function handlePan(val) {
    if (!state.panObj || state.panObj.id === 0) {
        return;
    }
    (0, utils_1.pauseUnpause)(state.pause['pan'], consts_1.PAUSE_MS);
    var fVal = parseFloat(val);
    state.panObj.set('value', fVal);
    var str = state.panObj.call('str_for_value', fVal);
    (0, utils_1.osc)('/mixer/panStr', str ? str.toString() : '');
}
function handlePanDefault() {
    if (!state.panObj || state.panObj.id === 0) {
        return;
    }
    var defVal = parseFloat(state.panObj.get('default_value'));
    state.panObj.set('value', defVal);
    (0, utils_1.osc)('/mixer/pan', defVal);
    var str = state.panObj.call('str_for_value', defVal);
    (0, utils_1.osc)('/mixer/panStr', str ? str.toString() : '');
}
function handleVol(val) {
    if (!state.volObj || state.volObj.id === 0) {
        return;
    }
    (0, utils_1.pauseUnpause)(state.pause['vol'], consts_1.PAUSE_MS);
    var fVal = parseFloat(val);
    state.volObj.set('value', fVal);
    var str = state.volObj.call('str_for_value', fVal);
    (0, utils_1.osc)('/mixer/volStr', str ? str.toString() : '');
}
function handleVolDefault() {
    if (!state.volObj || state.volObj.id === 0) {
        return;
    }
    var defVal = parseFloat(state.volObj.get('default_value'));
    state.volObj.set('value', defVal);
    (0, utils_1.osc)('/mixer/vol', defVal);
    var str = state.volObj.call('str_for_value', defVal);
    (0, utils_1.osc)('/mixer/volStr', str ? str.toString() : '');
}
// ---------------------------------------------------------------------------
// Observer callbacks
// ---------------------------------------------------------------------------
var handleVolVal = function (val) {
    if (val[0] !== 'value') {
        return;
    }
    if (!state.pause.vol.paused) {
        var fVal = parseFloat(val[1].toString()) || 0;
        (0, utils_1.osc)('/mixer/vol', fVal);
        var str = state.volObj.call('str_for_value', fVal);
        (0, utils_1.osc)('/mixer/volStr', str ? str.toString() : '');
    }
};
var handlePanVal = function (val) {
    if (val[0] !== 'value') {
        return;
    }
    if (!state.pause.pan.paused) {
        var fVal = parseFloat(val[1].toString()) || 0;
        (0, utils_1.osc)('/mixer/pan', fVal);
        var str = state.panObj.call('str_for_value', fVal);
        (0, utils_1.osc)('/mixer/panStr', str ? str.toString() : '');
    }
};
var handleCrossfaderVal = function (val) {
    if (val[0] !== 'value') {
        return;
    }
    if (!state.pause.crossfader.paused) {
        (0, utils_1.osc)('/mixer/crossfader', val[1] || 0);
    }
};
var handleSendVal = function (idx, val) {
    if (val[0] !== 'value') {
        return;
    }
    if (!state.pause.send.paused) {
        (0, utils_1.osc)(utils_1.SEND_ADDR[idx], val[1] || 0);
    }
};
// ---------------------------------------------------------------------------
// Track change handler
// ---------------------------------------------------------------------------
var onTrackChange = function (args) {
    if (!state.trackObj) {
        return;
    }
    if (args[1].toString() !== 'id') {
        return;
    }
    var id = (0, utils_1.cleanArr)(args)[0];
    if (id === state.lastTrackId) {
        return;
    }
    state.lastTrackId = id;
    state.trackLookupObj.id = id;
    // track type
    var path = state.trackLookupObj.unquotedpath;
    var trackType = consts_1.TYPE_TRACK;
    var isMain = false;
    if (path.indexOf('live_set master_track') === 0) {
        trackType = consts_1.TYPE_MAIN;
        isMain = true;
    }
    else if (path.indexOf('live_set return_tracks') === 0) {
        trackType = consts_1.TYPE_RETURN;
    }
    else if (parseInt(state.trackLookupObj.get('is_foldable')) === 1) {
        trackType = consts_1.TYPE_GROUP;
    }
    (0, utils_1.osc)('/mixer/type', trackType);
    // record / input status
    sendRecordStatus(state.trackLookupObj);
    // mute / solo
    if (!isMain) {
        (0, utils_1.osc)('/mixer/mute', parseInt(state.trackLookupObj.get('mute')));
        (0, utils_1.osc)('/mixer/solo', parseInt(state.trackLookupObj.get('solo')));
    }
    else {
        (0, utils_1.osc)('/mixer/mute', 0);
        (0, utils_1.osc)('/mixer/solo', 0);
    }
    // has_audio_output
    var trackInfo = state.trackLookupObj.info.toString();
    state.hasOutput =
        trackInfo.indexOf('has_audio_output') > -1
            ? !!parseInt(state.trackLookupObj.get('has_audio_output'))
            : false;
    (0, utils_1.osc)('/mixer/hasOutput', state.hasOutput ? 1 : 0);
    // meters — repoint or disable
    if (state.metersEnabled && state.hasOutput) {
        pointMetersAt(path);
        if (!state.onMixerPage)
            startMeterFlush();
    }
    else {
        stopMeterFlush();
        disableMeters();
    }
    // crossfade assign
    if (!isMain) {
        var xfade = parseInt(state.mixerObj.get('crossfade_assign'));
        (0, utils_1.osc)('/mixer/xFadeA', xfade === 0 ? 1 : 0);
        (0, utils_1.osc)('/mixer/xFadeB', xfade === 2 ? 1 : 0);
    }
    else {
        (0, utils_1.osc)('/mixer/xFadeA', 0);
        (0, utils_1.osc)('/mixer/xFadeB', 0);
    }
    // track color
    (0, utils_1.osc)('/mixer/trackColor', parseInt(state.trackLookupObj.get('color')));
    // vol/pan str
    var volVal = parseFloat(state.volObj.get('value')) || 0;
    (0, utils_1.osc)('/mixer/vol', volVal);
    var volStr = state.volObj.call('str_for_value', volVal);
    (0, utils_1.osc)('/mixer/volStr', volStr ? volStr.toString() : '');
    var panVal = parseFloat(state.panObj.get('value')) || 0;
    (0, utils_1.osc)('/mixer/pan', panVal);
    var panStr = state.panObj.call('str_for_value', panVal);
    (0, utils_1.osc)('/mixer/panStr', panStr ? panStr.toString() : '');
};
var onReturnsChange = function (args) {
    if (!state.returnsObj || args[0] !== 'return_tracks') {
        return;
    }
    var returnIds = (0, utils_1.cleanArr)(args);
    setSendWatcherIds(returnIds);
};
// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
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
    if (state.watchers.length === consts_1.MAX_SENDS) {
        return;
    }
    var _loop_1 = function (i) {
        var watcher = new LiveAPI(function (val) { return handleSendVal(i, val); }, 'live_set');
        state.watchers.push(watcher);
        watcher.property = 'value';
    };
    // Send watchers
    for (var i = 0; i < consts_1.MAX_SENDS; i++) {
        _loop_1(i);
    }
    // Lookup obj for querying track properties on change
    if (!state.trackLookupObj) {
        state.trackLookupObj = new LiveAPI(consts_1.noFn, 'live_set');
    }
    // Return tracks watcher
    if (!state.returnsObj) {
        state.returnsObj = new LiveAPI(onReturnsChange, 'live_set');
        state.returnsObj.property = 'return_tracks';
        state.returnsObj.mode = 1;
    }
    // Mixer obj (follows selected track)
    if (!state.mixerObj) {
        state.mixerObj = new LiveAPI(consts_1.noFn, 'live_set view selected_track mixer_device');
        state.mixerObj.mode = 1;
    }
    // Volume obj (follows selected track)
    if (!state.volObj) {
        state.volObj = new LiveAPI(handleVolVal, 'live_set view selected_track mixer_device volume');
        state.volObj.mode = 1;
        state.volObj.property = 'value';
    }
    // Pan obj (follows selected track)
    if (!state.panObj) {
        state.panObj = new LiveAPI(handlePanVal, 'live_set view selected_track mixer_device panning');
        state.panObj.property = 'value';
        state.panObj.mode = 1;
    }
    // Track obj (follows selected track)
    // NOTE: must be created AFTER volObj, panObj, mixerObj because setting
    // trackObj.property = 'id' fires onTrackChange synchronously, which
    // reads from those objects.
    if (!state.trackObj) {
        state.trackObj = new LiveAPI(onTrackChange, 'live_set view selected_track');
        state.trackObj.mode = 1;
        state.trackObj.property = 'id';
    }
    // Crossfader obj (always master track)
    if (!state.crossfaderObj) {
        state.crossfaderObj = new LiveAPI(handleCrossfaderVal, 'live_set master_track mixer_device crossfader');
        state.crossfaderObj.property = 'value';
        state.crossfaderObj.mode = 1;
    }
}
log('reloaded k4-sidebarMixer');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
