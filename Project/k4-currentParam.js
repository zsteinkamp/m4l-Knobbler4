"use strict";
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
const config_1 = require("./config");
const utils_1 = require("./utils");
const consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 1;
const log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Messages from router');
setoutletassist(consts_1.OUTLET_OSC, 'OSC messages to [udpsend]');
// Extract track path from a device canonical path
// e.g. "live_set tracks 3 devices 1" → "live_set tracks 3"
const TRACK_PATH_RE = /^(live_set (?:tracks \d+|return_tracks \d+|master_track))/;
let active = false;
let paramSelObj = null; // mode=1, follows selected_parameter
let paramValObj = null; // observes value on current param
let trackColorObj = null; // observes color on current track
let scratchApi = null; // throwaway lookups (device name, track name, etc.)
let valScratchApi = null; // separate scratchpad for onValueChange
const pause = { paused: false, task: null };
let currentParamId = 0;
let locked = false;
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
let paramSelectDebounce = null;
function onParamSelected() {
    if (!active || locked || !paramSelObj)
        return;
    const paramId = parseInt(paramSelObj.id);
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
    const paramName = (0, utils_1.dequote)(scratchApi.get('name').toString());
    const paramMin = parseFloat(scratchApi.get('min').toString());
    const paramMax = parseFloat(scratchApi.get('max').toString());
    const paramVal = parseFloat(scratchApi.get('value').toString());
    // Get the min/max display strings
    const minStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', paramMin).toString());
    const maxStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', paramMax).toString());
    const valStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', paramVal).toString());
    // Scale value to 0-1
    const scaledVal = paramMax > paramMin ? (paramVal - paramMin) / (paramMax - paramMin) : 0;
    // Navigate to the parent device
    const paramPath = scratchApi.unquotedpath;
    const devicePath = paramPath.replace(/ parameters \d+$/, '');
    scratchApi.path = devicePath;
    let deviceName = '';
    if (scratchApi.type === 'MixerDevice') {
        deviceName = 'Mixer';
    }
    else {
        deviceName = (0, utils_1.dequote)(scratchApi.get('name').toString());
    }
    // Navigate to the track
    const trackMatch = devicePath.match(TRACK_PATH_RE);
    let trackName = '';
    let trackColor = '#000000';
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
    const paramVal = parseFloat(valScratchApi.get('value').toString());
    const paramMin = parseFloat(valScratchApi.get('min').toString());
    const paramMax = parseFloat(valScratchApi.get('max').toString());
    const valStr = (0, utils_1.dequote)(valScratchApi.call('str_for_value', paramVal).toString());
    const scaledVal = paramMax > paramMin ? (paramVal - paramMin) / (paramMax - paramMin) : 0;
    (0, utils_1.osc)('/currentParam/val', scaledVal);
    (0, utils_1.osc)('/currentParam/valStr', valStr);
}
function onTrackColorChange() {
    if (!active || !currentParamId || !trackColorObj)
        return;
    const color = '#' + ('000000' + parseInt(trackColorObj.get('color').toString()).toString(16)).slice(-6);
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
    const paramMin = parseFloat(scratchApi.get('min').toString());
    const paramMax = parseFloat(scratchApi.get('max').toString());
    // Scale from 0-1 to param range
    const rawVal = paramMin + val * (paramMax - paramMin);
    (0, utils_1.pauseUnpause)(pause, consts_1.PAUSE_MS);
    scratchApi.set('value', rawVal);
    const valStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', rawVal).toString());
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
    const defaultVal = parseFloat(scratchApi.get('default_value').toString());
    const paramMin = parseFloat(scratchApi.get('min').toString());
    const paramMax = parseFloat(scratchApi.get('max').toString());
    (0, utils_1.pauseUnpause)(pause, consts_1.PAUSE_MS);
    scratchApi.set('value', defaultVal);
    const scaledVal = paramMax > paramMin ? (defaultVal - paramMin) / (paramMax - paramMin) : 0;
    const valStr = (0, utils_1.dequote)(scratchApi.call('str_for_value', defaultVal).toString());
    (0, utils_1.osc)('/currentParam/val', scaledVal);
    (0, utils_1.osc)('/currentParam/valStr', valStr);
}
function refresh() {
    if (!active || !currentParamId)
        return;
    sendAllParamInfo(currentParamId);
}
log('reloaded k4-currentParam');
module.exports = {};
