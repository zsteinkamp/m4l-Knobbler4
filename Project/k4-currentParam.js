"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.routes = void 0;
var k4_config_1 = require("./k4-config");
var utils_1 = require("./utils");
var liveApi_1 = require("./liveApi");
var deviceParam_1 = require("./deviceParam");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
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
var observersBuilt = false;
// Build the 3 observers once and keep them alive; show/hide toggle their
// subscription (property '') rather than detach+recreate. Detach leaks ~6 symbols
// each (see CLAUDE.md observer lifecycle), and re-arming is free.
function ensureObservers() {
    ensureApis();
    if (observersBuilt)
        return;
    paramValObj = new LiveAPI(onValueChange, '');
    trackColorObj = new LiveAPI(onTrackColorChange, '');
    // paramSelObj follows live_set view selected_parameter (mode=1)
    paramSelObj = new LiveAPI(onParamSelected, 'live_set view selected_parameter');
    paramSelObj.mode = 1;
    observersBuilt = true;
}
function show() {
    if (active)
        return;
    active = true;
    ensureObservers();
    // Setting paramSelObj.property re-arms it AND fires onParamSelected immediately,
    // which re-points paramValObj/trackColorObj at the current selection.
    paramSelObj.property = 'id';
}
function hide() {
    if (!active)
        return;
    active = false;
    // Disable (property='') instead of detach — keeps the objects for reuse and
    // retains their ids (the stale-id-0 issue the old detach path warned about).
    if (paramSelObj)
        paramSelObj.property = '';
    if (paramValObj)
        paramValObj.property = '';
    if (trackColorObj)
        trackColorObj.property = '';
    currentParamId = 0;
}
function lock(val) {
    locked = !!val;
    if (!locked && active && paramSelObj) {
        onParamSelected();
    }
}
// One reusable debounce Task — allocating one per selection never freed the
// previous peer.
var paramSelectDebounce = null;
function onParamSelected() {
    if (!active || locked || !paramSelObj)
        return;
    var paramId = (0, liveApi_1.apiId)(paramSelObj);
    if (paramId === 0) {
        currentParamId = 0;
        return;
    }
    currentParamId = paramId;
    if (!paramSelectDebounce) {
        paramSelectDebounce = new Task(function () {
            sendAllParamInfo(currentParamId);
        });
    }
    paramSelectDebounce.cancel();
    paramSelectDebounce.schedule(40);
}
function readParam(api, paramId) {
    api.id = paramId;
    if (api.type !== 'DeviceParameter')
        return null;
    return describe(api, parseFloat(api.get('value').toString()));
}
// The scaled proportion + display string for `value` on an already-pointed api.
function describe(api, value) {
    var min = parseFloat(api.get('min').toString());
    var max = parseFloat(api.get('max').toString());
    return {
        value: value,
        prop: (0, deviceParam_1.valueToProp)(value, min, max),
        str: (0, utils_1.dequote)((0, deviceParam_1.valueString)(api, value)),
    };
}
// #rrggbb for the app, from Live's packed integer color. Lower-cased to keep
// the wire format byte-identical to what this module emitted before it shared
// utils' colorToString (which upper-cases).
function colorHash(raw) {
    return '#' + (0, utils_1.colorToString)(raw ? raw.toString() : '').toLowerCase();
}
function sendAllParamInfo(paramId) {
    ensureApis();
    var read = readParam(scratchApi, paramId);
    if (!read)
        return;
    var paramName = (0, utils_1.dequote)(scratchApi.get('name').toString());
    var paramMin = parseFloat(scratchApi.get('min').toString());
    var paramMax = parseFloat(scratchApi.get('max').toString());
    var minStr = (0, utils_1.dequote)((0, deviceParam_1.valueString)(scratchApi, paramMin));
    var maxStr = (0, utils_1.dequote)((0, deviceParam_1.valueString)(scratchApi, paramMax));
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
        trackColor = colorHash(scratchApi.get('color'));
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
    (0, utils_1.osc)('/currentParam/valStr', read.str);
    (0, utils_1.osc)('/currentParam/val', read.prop);
}
function onValueChange() {
    if (!active || !currentParamId || pause.paused)
        return;
    // Use separate scratchpad to avoid re-entrancy with scratchApi
    var read = readParam(valScratchApi, currentParamId);
    if (!read)
        return;
    (0, utils_1.osc)('/currentParam/val', read.prop);
    (0, utils_1.osc)('/currentParam/valStr', read.str);
}
function onTrackColorChange() {
    if (!active || !currentParamId || !trackColorObj)
        return;
    (0, utils_1.osc)('/currentParam/trackColor', colorHash(trackColorObj.get('color')));
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
    var rawVal = (0, deviceParam_1.propToValue)(val, paramMin, paramMax);
    (0, utils_1.pauseUnpause)(pause, consts_1.PAUSE_MS);
    scratchApi.set('value', rawVal);
    (0, utils_1.osc)('/currentParam/valStr', (0, utils_1.dequote)((0, deviceParam_1.valueString)(scratchApi, rawVal)));
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
    (0, utils_1.pauseUnpause)(pause, consts_1.PAUSE_MS);
    scratchApi.set('value', defaultVal);
    var read = describe(scratchApi, defaultVal);
    (0, utils_1.osc)('/currentParam/val', read.prop);
    (0, utils_1.osc)('/currentParam/valStr', read.str);
}
function doRefresh(c) {
    (0, utils_1.setOscSink)(c.osc);
    if (!active || !currentParamId)
        return;
    sendAllParamInfo(currentParamId);
}
exports.init = doRefresh;
// --- Route table (dispatched by the [v8 knobbler] entry) -------------------
var routes = [
    {
        prefix: '/currentParam/val',
        parse: 'val',
        fn: currentParamVal,
        coalesce: true,
    },
    { prefix: '/currentParam/default', parse: 'bare', fn: currentParamDefault },
    { prefix: '/currentParam/lock', parse: 'val', fn: lock },
    { prefix: '/currentParam/show', parse: 'bare', fn: show },
    { prefix: '/currentParam/hide', parse: 'bare', fn: hide },
];
exports.routes = routes;
log('reloaded k4-currentParam');
