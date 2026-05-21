"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.sidebarMeters = exports.page = exports.routes = void 0;
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var mixerUtils_1 = require("./mixerUtils");
var log = (0, utils_1.logFactory)(config_1.default);
// Orchestrator context (set in doRefresh/init) — per-instance persistence.
var ctx = null;
log('loaded k4-sidebarMixer');
var state = {
    trackLookupObj: null,
    returnTrackColors: [],
    returnsObj: null,
    mixerObj: null,
    trackObj: null,
    lastTrackId: 0,
    volObj: null,
    panObj: null,
    muteObj: null,
    mutedViaSoloObj: null,
    xfadeAssignObj: null,
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
            (0, utils_1.osc)('/mixer/meters', state.meterBuffer);
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
exports.sidebarMeters = sidebarMeters;
function page(pageNameArg) {
    var pageName = pageNameArg.toString();
    var wasMixerPage = state.onMixerPage;
    state.onMixerPage = pageName === 'mixer' || pageName === 'session';
    if (!state.onMixerPage && wasMixerPage) {
        if (state.metersEnabled && state.hasOutput)
            startMeterFlush();
    }
    else if (state.onMixerPage && !wasMixerPage) {
        stopMeterFlush();
    }
}
exports.page = page;
// ---------------------------------------------------------------------------
// Send watcher management
// ---------------------------------------------------------------------------
var setSendWatcherIds = function (sendIds) {
    for (var i = 0; i < consts_1.MAX_SENDS; i++) {
        if (!state.watchers[i])
            continue;
        state.watchers[i].property = '';
        if (sendIds[i] !== undefined) {
            state.watchers[i].id = sendIds[i];
            if (state.watchers[i].type === 'DeviceParameter') {
                state.watchers[i].property = 'value';
            }
            else {
                log('send watcher', i, 'expected DeviceParameter, got', state.watchers[i].type);
                state.watchers[i].id = 0;
                (0, utils_1.osc)(utils_1.SEND_ADDR[i], 0);
            }
        }
        else {
            state.watchers[i].id = 0;
            (0, utils_1.osc)(utils_1.SEND_ADDR[i], 0);
        }
    }
    (0, utils_1.osc)('/mixer/numSends', sendIds.length);
};
function updateSendsFromMixer() {
    if (!state.mixerObj || +state.mixerObj.id === 0)
        return;
    var sendIds = (0, utils_1.cleanArr)(state.mixerObj.get('sends'));
    setSendWatcherIds(sendIds);
}
var sendReturnTrackColors = function () {
    (0, utils_1.osc)('/mixer/returnTrackColors', state.returnTrackColors);
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
    (0, mixerUtils_1.toggleXFade)(state.mixerObj, 0);
}
function toggleXFadeB() {
    (0, mixerUtils_1.toggleXFade)(state.mixerObj, 2);
}
function sendRecordStatus(lookupObj) {
    var status = (0, mixerUtils_1.getRecordStatus)(lookupObj);
    (0, utils_1.osc)('/mixer/recordArm', status.armStatus);
    (0, utils_1.osc)('/mixer/inputEnabled', status.inputEnabled ? 1 : 0);
}
function disableInput() {
    (0, mixerUtils_1.disableTrackInput)(state.trackObj);
    sendRecordStatus(state.trackObj);
}
function enableRecord() {
    if (!state.trackObj || +state.trackObj.id === 0)
        return;
    (0, mixerUtils_1.enableArm)(state.trackObj, state.trackLookupObj);
    sendRecordStatus(state.trackObj);
}
function disableRecord() {
    if (!state.trackObj || +state.trackObj.id === 0)
        return;
    (0, mixerUtils_1.disableArm)(state.trackObj);
    sendRecordStatus(state.trackObj);
}
function toggleMute() {
    if (!state.trackObj || +state.trackObj.id === 0) {
        return;
    }
    (0, mixerUtils_1.toggleMute)(state.trackObj);
    emitEffectiveMute();
}
// Effective mute = mute || muted_via_solo (the user sees both as "muted").
// Reads via trackLookupObj since it always points at the currently-displayed
// track; toggleMute writes via trackObj but the result is the same row.
function emitEffectiveMute() {
    if (!state.trackLookupObj || +state.trackLookupObj.id === 0)
        return;
    (0, utils_1.osc)('/mixer/mute', (0, mixerUtils_1.effectiveMute)(state.trackLookupObj));
}
function handleMuteChange(args) {
    if (args[0] === 'mute' || args[0] === 'muted_via_solo') {
        emitEffectiveMute();
    }
}
function emitXfadeAssign() {
    if (!state.mixerObj || +state.mixerObj.id === 0)
        return;
    var _a = (0, mixerUtils_1.xfadeAB)(state.mixerObj), aOn = _a[0], bOn = _a[1];
    (0, utils_1.osc)('/mixer/xFadeA', aOn);
    (0, utils_1.osc)('/mixer/xFadeB', bOn);
}
function handleXfadeAssignChange(args) {
    if (args[0] === 'crossfade_assign') {
        emitXfadeAssign();
    }
}
function toggleSolo() {
    if (!state.trackObj || +state.trackObj.id === 0) {
        return;
    }
    var newState = (0, mixerUtils_1.toggleSolo)(state.trackObj, state.trackLookupObj);
    (0, utils_1.osc)('/mixer/solo', newState);
}
function handleCrossfader(val) {
    if (!state.crossfaderObj || +state.crossfaderObj.id === 0) {
        return;
    }
    (0, utils_1.pauseUnpause)(state.pause['crossfader'], consts_1.PAUSE_MS);
    state.crossfaderObj.set('value', parseFloat(val));
}
function handleCrossfaderDefault() {
    if (!state.crossfaderObj || +state.crossfaderObj.id === 0) {
        return;
    }
    state.crossfaderObj.set('value', parseFloat(state.crossfaderObj.get('default_value')));
}
function handlePan(val) {
    if (!state.panObj || +state.panObj.id === 0) {
        return;
    }
    (0, utils_1.pauseUnpause)(state.pause['pan'], consts_1.PAUSE_MS);
    (0, utils_1.osc)('/mixer/panStr', (0, mixerUtils_1.setParamValue)(state.panObj, val));
}
function handlePanDefault() {
    var res = (0, mixerUtils_1.resetParamValue)(state.panObj);
    if (!res)
        return;
    (0, utils_1.osc)('/mixer/pan', res.value);
    (0, utils_1.osc)('/mixer/panStr', res.str);
}
function handleVol(val) {
    if (!state.volObj || +state.volObj.id === 0) {
        return;
    }
    (0, utils_1.pauseUnpause)(state.pause['vol'], consts_1.PAUSE_MS);
    (0, utils_1.osc)('/mixer/volStr', (0, mixerUtils_1.setParamValue)(state.volObj, val));
}
function handleVolDefault() {
    var res = (0, mixerUtils_1.resetParamValue)(state.volObj);
    if (!res)
        return;
    (0, utils_1.osc)('/mixer/vol', res.value);
    (0, utils_1.osc)('/mixer/volStr', res.str);
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
        var str = state.volObj.call('str_for_value', (0, utils_1.fixFloat)(fVal));
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
        var str = state.panObj.call('str_for_value', (0, utils_1.fixFloat)(fVal));
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
var trackChangeDebounce = null;
var onTrackChange = function (args) {
    if (!state.trackObj) {
        return;
    }
    // Property name is at args[0] per the type declaration; the historical
    // `args[1] !== 'id'` check was accidentally correct in [js] (which used to
    // deliver args reversed) and broke under [v8].
    if (args[0] !== 'id') {
        return;
    }
    var id = (0, utils_1.cleanArr)(args)[0];
    if (id === state.lastTrackId) {
        return;
    }
    state.lastTrackId = id;
    if (trackChangeDebounce) {
        trackChangeDebounce.cancel();
    }
    trackChangeDebounce = new Task(function () {
        handleTrackChange(id);
    });
    trackChangeDebounce.schedule(40);
};
function handleTrackChange(id) {
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
    // mute / solo — master has neither property. Repoint the observers to the
    // selected track first, then attach the property (skip both on master to
    // avoid v8 warnings).
    if (!isMain) {
        state.muteObj.property = '';
        state.muteObj.path = path;
        state.muteObj.property = 'mute';
        state.mutedViaSoloObj.property = '';
        state.mutedViaSoloObj.path = path;
        state.mutedViaSoloObj.property = 'muted_via_solo';
        emitEffectiveMute();
        (0, utils_1.osc)('/mixer/solo', parseInt(state.trackLookupObj.get('solo')));
    }
    else {
        state.muteObj.property = '';
        state.mutedViaSoloObj.property = '';
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
    // crossfade assign — every track type except master has it (returns
    // included). Detach on master to avoid v8 warnings.
    if (!isMain) {
        state.xfadeAssignObj.property = '';
        state.xfadeAssignObj.path = path + ' mixer_device';
        state.xfadeAssignObj.property = 'crossfade_assign';
        emitXfadeAssign();
    }
    else {
        state.xfadeAssignObj.property = '';
        (0, utils_1.osc)('/mixer/xFadeA', 0);
        (0, utils_1.osc)('/mixer/xFadeB', 0);
    }
    // track color
    (0, utils_1.osc)('/mixer/trackColor', parseInt(state.trackLookupObj.get('color')));
    // vol/pan str
    var volVal = parseFloat(state.volObj.get('value')) || 0;
    (0, utils_1.osc)('/mixer/vol', volVal);
    var volStr = state.volObj.call('str_for_value', (0, utils_1.fixFloat)(volVal));
    (0, utils_1.osc)('/mixer/volStr', volStr ? volStr.toString() : '');
    var panVal = parseFloat(state.panObj.get('value')) || 0;
    (0, utils_1.osc)('/mixer/pan', panVal);
    var panStr = state.panObj.call('str_for_value', (0, utils_1.fixFloat)(panVal));
    (0, utils_1.osc)('/mixer/panStr', panStr ? panStr.toString() : '');
    // sends
    updateSendsFromMixer();
}
var onReturnsChange = function (args) {
    if (!state.returnsObj || args[0] !== 'return_tracks') {
        return;
    }
    var returnIds = (0, utils_1.cleanArr)(args);
    for (var i = 0; i < consts_1.MAX_SENDS; i++) {
        var color = consts_1.DEFAULT_COLOR;
        if (returnIds[i]) {
            state.trackLookupObj.id = returnIds[i];
            color = (0, utils_1.colorToString)(state.trackLookupObj.get('color').toString());
        }
        state.returnTrackColors[i] = '#' + color;
    }
    sendReturnTrackColors();
    // Return track count changed — re-query sends for the selected track
    updateSendsFromMixer();
};
// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
function doRefresh(c) {
    (0, utils_1.setOscSink)(c.osc);
    ctx = c;
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
exports.init = doRefresh;
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
    // Mute + muted_via_solo observers — NOT mode=1. Master track has neither
    // property, and a mode=1 observer would re-attach itself the instant the
    // selection changes (before handleTrackChange's debounced clear runs),
    // producing "Main track has no 'mute' property!" warnings. We manage path
    // and property explicitly from handleTrackChange instead.
    if (!state.muteObj) {
        state.muteObj = new LiveAPI(handleMuteChange, 'live_set');
    }
    if (!state.mutedViaSoloObj) {
        state.mutedViaSoloObj = new LiveAPI(handleMuteChange, 'live_set');
    }
    // Crossfade assign observer — lives on the track's mixer_device, not the
    // track itself. Master's mixer_device lacks crossfade_assign, so same
    // detach-on-master pattern as the mute observers.
    if (!state.xfadeAssignObj) {
        state.xfadeAssignObj = new LiveAPI(handleXfadeAssignChange, 'live_set');
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
    // Restore meters state from settings dict; carry forward from pre-[v8] sets
    // (old key "<--->_metersEnabled" in the shared [dict settingsDict]).
    var meters = ctx.settings.get('metersEnabled');
    if (meters === null || meters === undefined) {
        var legacy = ctx.settings.legacyGet('metersEnabled');
        if (legacy !== null && legacy !== undefined) {
            meters = legacy;
            ctx.settings.set('metersEnabled', legacy);
        }
    }
    state.metersEnabled = !!meters;
    (0, utils_1.osc)('/sidebarMeters', state.metersEnabled ? 1 : 0);
}
// Route table — the single-track mixer commands (old router OUTLET_MIXER).
var routes = [
    { prefix: '/mixer/volDefault', parse: 'val', fn: handleVolDefault },
    { prefix: '/mixer/panDefault', parse: 'bare', fn: handlePanDefault },
    { prefix: '/mixer/crossfaderDefault', parse: 'bare', fn: handleCrossfaderDefault },
    { prefix: '/mixer/sendDefault', parse: 'slot', fn: handleSendDefault },
    { prefix: '/mixer/send', parse: 'slotVal', fn: updateSendVal, coalesce: true },
    { prefix: '/mixer/toggleXFadeA', parse: 'bare', fn: toggleXFadeA },
    { prefix: '/mixer/toggleXFadeB', parse: 'bare', fn: toggleXFadeB },
    { prefix: '/mixer/disableInput', parse: 'bare', fn: disableInput },
    { prefix: '/mixer/enableRecord', parse: 'bare', fn: enableRecord },
    { prefix: '/mixer/disableRecord', parse: 'bare', fn: disableRecord },
    { prefix: '/mixer/toggleSolo', parse: 'bare', fn: toggleSolo },
    { prefix: '/mixer/toggleMute', parse: 'bare', fn: toggleMute },
    { prefix: '/mixer/pan', parse: 'val', fn: handlePan, coalesce: true },
    { prefix: '/mixer/vol', parse: 'val', fn: handleVol, coalesce: true },
    { prefix: '/mixer/crossfader', parse: 'val', fn: handleCrossfader, coalesce: true },
];
exports.routes = routes;
log('reloaded k4-sidebarMixer');
