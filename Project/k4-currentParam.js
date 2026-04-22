"use strict";
var config_1 = require("./config");
var utils_1 = require("./utils");
var consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Messages from router');
setoutletassist(consts_1.OUTLET_OSC, 'OSC messages to [udpsend]');
// Extract track path from a device canonical path
// e.g. "live_set tracks 3 devices 1" → "live_set tracks 3"
var TRACK_PATH_RE = /^(live_set (?:tracks \d+|return_tracks \d+|master_track))/;
var active = false;
var paramSelObj = null; // mode=1, follows selected_parameter
var paramValObj = null; // observes value on current param
var trackColorObj = null; // observes color on current track
var scratchApi = null; // throwaway lookups (device name, track name, etc.)
var valScratchApi = null; // separate scratchpad for onValueChange
var pause = { paused: false, task: null };
var currentParamId = 0;
var locked = false;
function ensureApis() {
    if (!scratchApi)
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
    if (!valScratchApi)
        valScratchApi = new LiveAPI(consts_1.noFn, 'live_set');
}
function show() {
    if (active)
        return;
    active = true;
    ensureApis();
    // Tear down and recreate observers fresh each time.
    // This avoids stale state from detach() leaving objects at id 0.
    teardownObservers();
    paramValObj = new LiveAPI(onValueChange, '');
    trackColorObj = new LiveAPI(onTrackColorChange, '');
    // paramSelObj follows live_set view selected_parameter (mode=1)
    // Created last because setting property fires the callback immediately
    paramSelObj = new LiveAPI(onParamSelected, 'live_set view selected_parameter');
    paramSelObj.mode = 1;
    paramSelObj.property = 'id';
}
function hide() {
    if (!active)
        return;
    active = false;
    teardownObservers();
    currentParamId = 0;
}
function teardownObservers() {
    if (paramSelObj) {
        (0, utils_1.detach)(paramSelObj);
        paramSelObj = null;
    }
    if (paramValObj) {
        (0, utils_1.detach)(paramValObj);
        paramValObj = null;
    }
    if (trackColorObj) {
        (0, utils_1.detach)(trackColorObj);
        trackColorObj = null;
    }
}
function lock(val) {
    locked = !!val;
    if (!locked && active && paramSelObj) {
        onParamSelected();
    }
}
var paramSelectDebounce = null;
function onParamSelected() {
    if (!active || locked || !paramSelObj)
        return;
    var paramId = parseInt(paramSelObj.id);
    if (!paramId || paramId === 0) {
        currentParamId = 0;
        return;
    }
    currentParamId = paramId;
    if (paramSelectDebounce) {
        paramSelectDebounce.cancel();
    }
    paramSelectDebounce = new Task(function () {
        sendAllParamInfo(currentParamId);
    });
    paramSelectDebounce.schedule(40);
}
function sendAllParamInfo(paramId) {
    ensureApis();
    // Point scratchApi at the parameter
    scratchApi.id = paramId;
    if (scratchApi.type !== 'DeviceParameter')
        return;
    var paramName = (0, utils_1.dequote)(scratchApi.get('name').toString());
    var paramMin = parseFloat(scratchApi.get('min').toString());
    var paramMax = parseFloat(scratchApi.get('max').toString());
    var paramVal = parseFloat(scratchApi.get('value').toString());
    // Get the min/max display strings
    var minStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', (0, utils_1.fixFloat)(paramMin)).toString());
    var maxStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', (0, utils_1.fixFloat)(paramMax)).toString());
    var valStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', (0, utils_1.fixFloat)(paramVal)).toString());
    // Scale value to 0-1
    var scaledVal = paramMax > paramMin ? (paramVal - paramMin) / (paramMax - paramMin) : 0;
    // Navigate to the parent device
    var paramPath = scratchApi.unquotedpath;
    var devicePath = paramPath.replace(/ parameters \d+$/, '');
    scratchApi.path = devicePath;
    var deviceName = '';
    if (scratchApi.type === 'MixerDevice') {
        deviceName = 'Mixer';
    }
    else {
        deviceName = (0, utils_1.dequote)(scratchApi.get('name').toString());
    }
    // Navigate to the track
    var trackMatch = devicePath.match(TRACK_PATH_RE);
    var trackName = '';
    var trackColor = '#000000';
    if (trackMatch) {
        scratchApi.path = trackMatch[1];
        trackName = (0, utils_1.dequote)(scratchApi.get('name').toString());
        trackColor = '#' + ('000000' + parseInt(scratchApi.get('color').toString()).toString(16)).slice(-6);
        // Set up track color observer
        if (trackColorObj) {
            trackColorObj.property = '';
            trackColorObj.path = trackMatch[1];
            trackColorObj.property = 'color';
        }
    }
    // Set up value observer on the parameter
    if (paramValObj) {
        paramValObj.property = '';
        paramValObj.id = paramId;
        paramValObj.property = 'value';
    }
    // Send all info to the app
    (0, utils_1.osc)('/currentParam/name', paramName);
    (0, utils_1.osc)('/currentParam/deviceName', deviceName);
    (0, utils_1.osc)('/currentParam/trackName', trackName);
    (0, utils_1.osc)('/currentParam/trackColor', trackColor);
    (0, utils_1.osc)('/currentParam/minStr', minStr);
    (0, utils_1.osc)('/currentParam/maxStr', maxStr);
    (0, utils_1.osc)('/currentParam/valStr', valStr);
    (0, utils_1.osc)('/currentParam/val', scaledVal);
}
function onValueChange() {
    if (!active || !currentParamId || pause.paused)
        return;
    // Use separate scratchpad to avoid re-entrancy with scratchApi
    valScratchApi.id = currentParamId;
    if (valScratchApi.type !== 'DeviceParameter')
        return;
    var paramVal = parseFloat(valScratchApi.get('value').toString());
    var paramMin = parseFloat(valScratchApi.get('min').toString());
    var paramMax = parseFloat(valScratchApi.get('max').toString());
    var valStr = (0, utils_1.dequote)(valScratchApi.call('str_for_value', (0, utils_1.fixFloat)(paramVal)).toString());
    var scaledVal = paramMax > paramMin ? (paramVal - paramMin) / (paramMax - paramMin) : 0;
    (0, utils_1.osc)('/currentParam/val', scaledVal);
    (0, utils_1.osc)('/currentParam/valStr', valStr);
}
function onTrackColorChange() {
    if (!active || !currentParamId || !trackColorObj)
        return;
    var color = '#' + ('000000' + parseInt(trackColorObj.get('color').toString()).toString(16)).slice(-6);
    (0, utils_1.osc)('/currentParam/trackColor', color);
}
// Called from router when user moves the current param slider
function currentParamVal(val) {
    if (!currentParamId)
        return;
    ensureApis();
    scratchApi.id = currentParamId;
    if (scratchApi.type !== 'DeviceParameter')
        return;
    var paramMin = parseFloat(scratchApi.get('min').toString());
    var paramMax = parseFloat(scratchApi.get('max').toString());
    // Scale from 0-1 to param range
    var rawVal = paramMin + val * (paramMax - paramMin);
    (0, utils_1.pauseUnpause)(pause, consts_1.PAUSE_MS);
    scratchApi.set('value', rawVal);
    var valStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', (0, utils_1.fixFloat)(rawVal)).toString());
    (0, utils_1.osc)('/currentParam/valStr', valStr);
}
// Called from router when user taps "default" button
function currentParamDefault() {
    if (!currentParamId)
        return;
    ensureApis();
    scratchApi.id = currentParamId;
    if (scratchApi.type !== 'DeviceParameter')
        return;
    var defaultVal = parseFloat(scratchApi.get('default_value').toString());
    var paramMin = parseFloat(scratchApi.get('min').toString());
    var paramMax = parseFloat(scratchApi.get('max').toString());
    (0, utils_1.pauseUnpause)(pause, consts_1.PAUSE_MS);
    scratchApi.set('value', defaultVal);
    var scaledVal = paramMax > paramMin ? (defaultVal - paramMin) / (paramMax - paramMin) : 0;
    var valStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', (0, utils_1.fixFloat)(defaultVal)).toString());
    (0, utils_1.osc)('/currentParam/val', scaledVal);
    (0, utils_1.osc)('/currentParam/valStr', valStr);
}
function refresh() {
    if (!active || !currentParamId)
        return;
    sendAllParamInfo(currentParamId);
}
log('reloaded k4-currentParam');
// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
