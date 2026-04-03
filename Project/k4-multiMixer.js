"use strict";
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
const utils_1 = require("./utils");
const config_1 = require("./config");
const consts_1 = require("./consts");
const mixerUtils_1 = require("./mixerUtils");
autowatch = 1;
inlets = 2;
outlets = 1;
const log = (0, utils_1.logFactory)(config_1.default);
const INLET_PAGE = 1;
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setinletassist(INLET_PAGE, 'Page change messages');
setoutletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Module-level scratchpads for one-off lookups (reuse via .path is fastest)
// Lazily initialized to avoid "Live API is not initialized" at load time
let scratchApi = null;
function ensureApis() {
    if (!scratchApi)
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
}
const DEFAULT_VISIBLE_COUNT = 18;
const MAX_STRIP_IDX = 128;
const OBSERVER_BUFFER = 2;
// Pre-computed OSC address strings for mixer strips
const SA_VOL = [];
const SA_VOLSTR = [];
const SA_VOLAUTO = [];
const SA_PAN = [];
const SA_PANSTR = [];
const SA_MUTE = [];
const SA_SOLO = [];
const SA_ARM = [];
const SA_INPUT = [];
const SA_HASOUTPUT = [];
const SA_XFADEA = [];
const SA_XFADEB = [];
const SA_XFADEASSIGN = [];
const SA_NAME = [];
const SA_COLOR = [];
const SA_TYPE = [];
const SA_SEND = [];
for (let _i = 0; _i < MAX_STRIP_IDX; _i++) {
    const _p = '/mixer/' + _i + '/';
    SA_VOL[_i] = _p + 'vol';
    SA_VOLSTR[_i] = _p + 'volStr';
    SA_VOLAUTO[_i] = _p + 'volAuto';
    SA_PAN[_i] = _p + 'pan';
    SA_PANSTR[_i] = _p + 'panStr';
    SA_MUTE[_i] = _p + 'mute';
    SA_SOLO[_i] = _p + 'solo';
    SA_ARM[_i] = _p + 'recordArm';
    SA_INPUT[_i] = _p + 'inputEnabled';
    SA_HASOUTPUT[_i] = _p + 'hasOutput';
    SA_XFADEA[_i] = _p + 'xFadeA';
    SA_XFADEB[_i] = _p + 'xFadeB';
    SA_XFADEASSIGN[_i] = _p + 'xFadeAssign';
    SA_NAME[_i] = _p + 'name';
    SA_COLOR[_i] = _p + 'color';
    SA_TYPE[_i] = _p + 'type';
    SA_SEND[_i] = [];
    for (let _j = 0; _j < consts_1.MAX_SENDS; _j++) {
        SA_SEND[_i][_j] = _p + 'send' + (_j + 1);
    }
}
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let trackList = [];
let leftIndex = -1;
let visibleCount = 0;
// Observers keyed by track ID — survives window slides if the track stays visible
let observersByTrackId = {};
// Observer slots: track IDs in the wider observer window (visible + buffer)
let observerSlots = [];
// Track IDs for which sendStripState has been called in the current visible window.
// Rebuilt each applyWindow so strips leaving the visible range get state re-sent
// if they scroll back in (observer callbacks don't fire while !isVisible).
let visibleStateSet = {};
let metersEnabled = false;
let onMixerPage = false;
let meterBuffer = [];
let meterDirty = false;
let meterFlushTask = null;
let mixerViewTask = null;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isVisible(strip) {
    return strip.stripIndex >= leftIndex && strip.stripIndex < leftIndex + visibleCount;
}
function stripPause(strip, key) {
    if (!strip.pause[key]) {
        strip.pause[key] = { paused: false, task: null };
    }
    (0, utils_1.pauseUnpause)(strip.pause[key], consts_1.PAUSE_MS);
}
function sendSoloCount() {
    ensureApis();
    let count = 0;
    scratchApi.path = 'live_set';
    const tracks = (0, utils_1.cleanArr)(scratchApi.get('tracks'));
    const returns = (0, utils_1.cleanArr)(scratchApi.get('return_tracks'));
    const all = tracks.concat(returns);
    for (let i = 0; i < all.length; i++) {
        scratchApi.id = all[i];
        if (parseInt(scratchApi.get('solo').toString())) {
            count++;
        }
    }
    (0, utils_1.osc)('/mixer/soloCount', count);
}
function sendReturnTrackColors() {
    const returns = trackList.filter(function (t) {
        return t.type === consts_1.TYPE_RETURN;
    });
    const colors = [];
    for (let i = 0; i < consts_1.MAX_SENDS; i++) {
        if (returns[i]) {
            colors.push('#' + returns[i].color);
        }
        else {
            colors.push('#' + consts_1.DEFAULT_COLOR);
        }
    }
    outlet(consts_1.OUTLET_OSC, ['/mixer/returnTrackColors', JSON.stringify(colors)]);
}
// ---------------------------------------------------------------------------
// Meter Observers
// ---------------------------------------------------------------------------
function createMeterObservers(strip, trackPath) {
    strip.meterLeftApi = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_left') {
            const v = (0, utils_1.meterVal)(args[1]);
            const off = strip.stripIndex * 3;
            if (v !== meterBuffer[off]) {
                meterBuffer[off] = v;
                meterDirty = true;
            }
        }
    }, trackPath);
    strip.meterLeftApi.property = 'output_meter_left';
    strip.meterRightApi = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_right') {
            const v = (0, utils_1.meterVal)(args[1]);
            const off = strip.stripIndex * 3 + 1;
            if (v !== meterBuffer[off]) {
                meterBuffer[off] = v;
                meterDirty = true;
            }
        }
    }, trackPath);
    strip.meterRightApi.property = 'output_meter_right';
    strip.meterLevelApi = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_level') {
            const v = (0, utils_1.meterVal)(args[1]);
            const off = strip.stripIndex * 3 + 2;
            if (v !== meterBuffer[off]) {
                meterBuffer[off] = v;
                meterDirty = true;
            }
        }
    }, trackPath);
    strip.meterLevelApi.property = 'output_meter_level';
}
function teardownMeterObservers(strip) {
    if (strip.meterLeftApi) {
        (0, utils_1.detach)(strip.meterLeftApi);
        strip.meterLeftApi = null;
    }
    if (strip.meterRightApi) {
        (0, utils_1.detach)(strip.meterRightApi);
        strip.meterRightApi = null;
    }
    if (strip.meterLevelApi) {
        (0, utils_1.detach)(strip.meterLevelApi);
        strip.meterLevelApi = null;
    }
    // Zero out this strip's slots in the buffer
    const baseOffset = strip.stripIndex * 3;
    if (baseOffset + 2 < meterBuffer.length) {
        meterBuffer[baseOffset] = 0;
        meterBuffer[baseOffset + 1] = 0;
        meterBuffer[baseOffset + 2] = 0;
    }
}
// ---------------------------------------------------------------------------
// Meter Flush Timer
// ---------------------------------------------------------------------------
function flushMeters() {
    if (!meterDirty)
        return;
    meterDirty = false;
    outlet(consts_1.OUTLET_OSC, ['/mixer/meters', (0, utils_1.numArrToJson)(meterBuffer)]);
}
function startMeterFlush() {
    if (meterFlushTask)
        return;
    meterFlushTask = new Task(function () {
        flushMeters();
        meterFlushTask.schedule(consts_1.METER_FLUSH_MS);
    });
    meterFlushTask.schedule(consts_1.METER_FLUSH_MS);
}
function stopMeterFlush() {
    if (!meterFlushTask)
        return;
    meterFlushTask.cancel();
    meterFlushTask.freepeer();
    meterFlushTask = null;
}
// ---------------------------------------------------------------------------
// Observer Creation / Teardown
// ---------------------------------------------------------------------------
function createStripObservers(trackId, stripIdx) {
    const strip = {
        trackId: trackId,
        trackApi: null,
        colorApi: null,
        muteApi: null,
        soloApi: null,
        armApi: null,
        meterLeftApi: null,
        meterRightApi: null,
        meterLevelApi: null,
        mixerApi: null,
        volApi: null,
        volAutoApi: null,
        panApi: null,
        sendApis: [],
        pause: {},
        stripIndex: stripIdx,
        canBeArmed: false,
        hasOutput: false,
        isMain: false,
        initialized: false,
    };
    // Get the track's path so we can build full paths for children
    scratchApi.id = trackId;
    const trackPath = scratchApi.unquotedpath;
    const mixerPath = trackPath + ' mixer_device';
    strip.isMain = trackPath.indexOf('master_track') > -1;
    // Color API — separate observer for track color changes
    strip.colorApi = new LiveAPI(function (args) {
        if (args[0] === 'color') {
            const newColor = (0, utils_1.colorToString)(args[1].toString());
            for (let j = 0; j < trackList.length; j++) {
                if (trackList[j].id === strip.trackId) {
                    trackList[j].color = newColor;
                    break;
                }
            }
        }
    }, trackPath);
    strip.colorApi.property = 'color';
    // Track API — used for querying properties (no observer)
    strip.trackApi = new LiveAPI(consts_1.noFn, trackPath);
    // Mute, solo, arm — separate observers (master track lacks these)
    if (!strip.isMain) {
        strip.muteApi = new LiveAPI(function (args) {
            if (args[0] === 'mute' && strip.initialized && isVisible(strip)) {
                (0, utils_1.osc)(SA_MUTE[strip.stripIndex], parseInt(args[1].toString()));
            }
        }, trackPath);
        strip.muteApi.property = 'mute';
        strip.soloApi = new LiveAPI(function (args) {
            if (args[0] === 'solo' && strip.initialized && isVisible(strip)) {
                (0, utils_1.osc)(SA_SOLO[strip.stripIndex], parseInt(args[1].toString()));
                sendSoloCount();
            }
        }, trackPath);
        strip.soloApi.property = 'solo';
    }
    strip.canBeArmed =
        !strip.isMain && !!parseInt(strip.trackApi.get('can_be_armed').toString());
    if (strip.canBeArmed) {
        strip.armApi = new LiveAPI(function (args) {
            if (args[0] === 'arm' && strip.initialized && isVisible(strip)) {
                (0, utils_1.osc)(SA_ARM[strip.stripIndex], parseInt(args[1].toString()));
            }
        }, trackPath);
        strip.armApi.property = 'arm';
    }
    // Check has_audio_output
    const trackInfo = strip.trackApi.info.toString();
    strip.hasOutput =
        trackInfo.indexOf('has_audio_output') > -1
            ? !!parseInt(strip.trackApi.get('has_audio_output').toString())
            : false;
    // Meter observers are managed separately by applyWindow (visible tracks only)
    // Mixer API — observe crossfade_assign (master track lacks this)
    strip.mixerApi = new LiveAPI(function (args) {
        if (args[0] === 'crossfade_assign' && strip.initialized && isVisible(strip)) {
            const xVal = parseInt(args[1].toString());
            (0, utils_1.osc)(SA_XFADEA[strip.stripIndex], xVal === 0 ? 1 : 0);
            (0, utils_1.osc)(SA_XFADEB[strip.stripIndex], xVal === 2 ? 1 : 0);
        }
    }, mixerPath);
    if (!strip.isMain) {
        strip.mixerApi.property = 'crossfade_assign';
    }
    // Volume observer
    //log('vol observer path: ' + mixerPath + ' volume' + ' isMain=' + strip.isMain)
    strip.volApi = new LiveAPI(function (args) {
        if (args[0] !== 'value' || !strip.initialized || !isVisible(strip))
            return;
        if (!strip.pause['vol'] || !strip.pause['vol'].paused) {
            const fVal = parseFloat(args[1]) || 0;
            (0, utils_1.osc)(SA_VOL[strip.stripIndex], fVal);
            const str = strip.volApi.call('str_for_value', fVal);
            (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '');
        }
    }, mixerPath + ' volume');
    strip.volApi.property = 'value';
    // Volume automation state observer
    strip.volAutoApi = new LiveAPI(function (args) {
        if (args[0] === 'automation_state' && strip.initialized && isVisible(strip)) {
            (0, utils_1.osc)(SA_VOLAUTO[strip.stripIndex], parseInt(args[1].toString()));
        }
    }, mixerPath + ' volume');
    strip.volAutoApi.property = 'automation_state';
    // Pan observer
    strip.panApi = new LiveAPI(function (args) {
        if (args[0] !== 'value' || !strip.initialized || !isVisible(strip))
            return;
        if (!strip.pause['pan'] || !strip.pause['pan'].paused) {
            const fVal = parseFloat(args[1]) || 0;
            (0, utils_1.osc)(SA_PAN[strip.stripIndex], fVal);
            const str = strip.panApi.call('str_for_value', fVal);
            (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], str ? str.toString() : '');
        }
    }, mixerPath + ' panning');
    strip.panApi.property = 'value';
    // Send observers
    scratchApi.path = mixerPath;
    const sendIds = (0, utils_1.cleanArr)(scratchApi.get('sends'));
    const numSends = Math.min(sendIds.length, consts_1.MAX_SENDS);
    for (let i = 0; i < numSends; i++) {
        const sendIdx = i;
        const sendApi = new LiveAPI(function (args) {
            if (args[0] !== 'value' || !strip.initialized || !isVisible(strip))
                return;
            if (!strip.pause['send'] || !strip.pause['send'].paused) {
                (0, utils_1.osc)(SA_SEND[strip.stripIndex][sendIdx], args[1] || 0);
            }
        }, 'id ' + sendIds[i]);
        sendApi.property = 'value';
        strip.sendApis.push(sendApi);
    }
    strip.initialized = true;
    return strip;
}
function teardownStripObservers(strip) {
    (0, utils_1.detach)(strip.colorApi);
    (0, utils_1.detach)(strip.muteApi);
    (0, utils_1.detach)(strip.soloApi);
    (0, utils_1.detach)(strip.armApi);
    teardownMeterObservers(strip);
    (0, utils_1.detach)(strip.mixerApi);
    (0, utils_1.detach)(strip.volApi);
    (0, utils_1.detach)(strip.volAutoApi);
    (0, utils_1.detach)(strip.panApi);
    for (let i = 0; i < strip.sendApis.length; i++) {
        (0, utils_1.detach)(strip.sendApis[i]);
    }
    (0, utils_1.detach)(strip.trackApi);
    // Cancel all pause tasks
    for (const key in strip.pause) {
        if (strip.pause[key].task) {
            strip.pause[key].task.cancel();
            strip.pause[key].task.freepeer();
        }
    }
}
function teardownAll() {
    stopMeterFlush();
    for (const trackIdStr in observersByTrackId) {
        teardownStripObservers(observersByTrackId[trackIdStr]);
    }
    observersByTrackId = {};
    observerSlots = [];
    visibleStateSet = {};
    trackList = [];
    meterBuffer = [];
}
// ---------------------------------------------------------------------------
// Send Strip State
// ---------------------------------------------------------------------------
function sendStripState(n, strip) {
    let info = null;
    for (let i = 0; i < trackList.length; i++) {
        if (trackList[i].id === strip.trackId) {
            info = trackList[i];
            break;
        }
    }
    (0, utils_1.osc)(SA_NAME[n], info ? info.name : '');
    (0, utils_1.osc)(SA_COLOR[n], info ? info.color : consts_1.DEFAULT_COLOR);
    (0, utils_1.osc)(SA_TYPE[n], info ? info.type : consts_1.TYPE_TRACK);
    const volVal = parseFloat(strip.volApi.get('value').toString()) || 0;
    const volStr = strip.volApi.call('str_for_value', volVal);
    (0, utils_1.osc)(SA_VOL[n], volVal);
    (0, utils_1.osc)(SA_VOLSTR[n], volStr ? volStr.toString() : '');
    (0, utils_1.osc)(SA_VOLAUTO[n], parseInt(strip.volAutoApi.get('automation_state').toString()));
    const panVal = parseFloat(strip.panApi.get('value').toString()) || 0;
    const panStr = strip.panApi.call('str_for_value', panVal);
    (0, utils_1.osc)(SA_PAN[n], panVal);
    (0, utils_1.osc)(SA_PANSTR[n], panStr ? panStr.toString() : '');
    (0, utils_1.osc)(SA_MUTE[n], !strip.isMain ? parseInt(strip.trackApi.get('mute').toString()) : 0);
    (0, utils_1.osc)(SA_SOLO[n], !strip.isMain ? parseInt(strip.trackApi.get('solo').toString()) : 0);
    (0, utils_1.osc)(SA_ARM[n], strip.canBeArmed ? parseInt(strip.trackApi.get('arm').toString()) : 0);
    const recordStatus = (0, mixerUtils_1.getRecordStatus)(strip.trackApi);
    (0, utils_1.osc)(SA_INPUT[n], strip.canBeArmed && recordStatus.inputEnabled ? 1 : 0);
    (0, utils_1.osc)(SA_HASOUTPUT[n], strip.hasOutput ? 1 : 0);
    if (!strip.isMain) {
        const xFadeAssign = parseInt(strip.mixerApi.get('crossfade_assign').toString());
        (0, utils_1.osc)(SA_XFADEA[n], xFadeAssign === 0 ? 1 : 0);
        (0, utils_1.osc)(SA_XFADEB[n], xFadeAssign === 2 ? 1 : 0);
    }
    for (let i = 0; i < strip.sendApis.length; i++) {
        (0, utils_1.osc)(SA_SEND[n][i], parseFloat(strip.sendApis[i].get('value').toString()) || 0);
    }
}
// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------
function applyWindow() {
    if (leftIndex < 0 || visibleCount <= 0) {
        return;
    }
    // Compute wider observer window (visible + buffer on each side)
    const obsLeft = Math.max(0, leftIndex - OBSERVER_BUFFER);
    const obsRight = Math.min(trackList.length, leftIndex + visibleCount + OBSERVER_BUFFER);
    // Build new observer slots for the wider window
    const newSlots = [];
    for (let i = obsLeft; i < obsRight; i++) {
        newSlots.push(trackList[i].id);
    }
    // Resize meter buffer if track count changed
    const requiredLen = trackList.length * 3;
    if (meterBuffer.length !== requiredLen) {
        const wasRunning = !!meterFlushTask;
        if (wasRunning)
            stopMeterFlush();
        const newBuf = [];
        for (let i = 0; i < requiredLen; i++)
            newBuf.push(0);
        meterBuffer = newBuf;
        if (wasRunning && metersEnabled)
            startMeterFlush();
    }
    // Compute keep/remove/add sets
    const oldSet = {};
    for (let i = 0; i < observerSlots.length; i++) {
        oldSet[observerSlots[i]] = true;
    }
    const newSet = {};
    for (let i = 0; i < newSlots.length; i++) {
        newSet[newSlots[i]] = true;
    }
    // Remove: in old but not in new
    for (let i = 0; i < observerSlots.length; i++) {
        const tid = observerSlots[i];
        if (!newSet[tid] && observersByTrackId[tid]) {
            teardownStripObservers(observersByTrackId[tid]);
            delete observersByTrackId[tid];
        }
    }
    // Add: in new but not in old
    for (let i = 0; i < newSlots.length; i++) {
        const tid = newSlots[i];
        if (!oldSet[tid]) {
            observersByTrackId[tid] = createStripObservers(tid, obsLeft + i);
        }
    }
    // Update strip indices for all observers (positions may have shifted)
    for (let i = 0; i < newSlots.length; i++) {
        const tid = newSlots[i];
        if (observersByTrackId[tid]) {
            observersByTrackId[tid].stripIndex = obsLeft + i;
        }
    }
    observerSlots = newSlots;
    // Manage meter observers for visible tracks only (not buffer)
    const visRight = Math.min(leftIndex + visibleCount, trackList.length);
    if (metersEnabled) {
        // Teardown meters on buffer-only tracks
        for (let i = obsLeft; i < leftIndex; i++) {
            const tid = trackList[i].id;
            if (observersByTrackId[tid])
                teardownMeterObservers(observersByTrackId[tid]);
        }
        for (let i = visRight; i < obsRight; i++) {
            const tid = trackList[i].id;
            if (observersByTrackId[tid])
                teardownMeterObservers(observersByTrackId[tid]);
        }
        // Create meters on visible tracks that don't have them
        for (let i = leftIndex; i < visRight; i++) {
            const tid = trackList[i].id;
            const strip = observersByTrackId[tid];
            if (strip && strip.hasOutput && !strip.meterLeftApi) {
                createMeterObservers(strip, strip.trackApi.unquotedpath);
            }
        }
        if (onMixerPage && !meterFlushTask)
            startMeterFlush();
    }
    // Send state for strips that are newly visible (weren't in the previous visible set).
    // This catches both newly created strips and buffer-zone strips scrolling into view.
    const newVisibleSet = {};
    for (let i = leftIndex; i < visRight; i++) {
        const tid = trackList[i].id;
        const strip = observersByTrackId[tid];
        if (strip) {
            newVisibleSet[tid] = true;
            if (!visibleStateSet[tid]) {
                sendStripState(i, strip);
            }
        }
    }
    visibleStateSet = newVisibleSet;
    sendSoloCount();
}
// ---------------------------------------------------------------------------
// Refresh — called on /btnRefresh to invalidate stale observers
// ---------------------------------------------------------------------------
function mixerRefresh() {
    teardownAll();
    sendMetersState();
    (0, utils_1.osc)('/sendMixerView', 1);
}
// ---------------------------------------------------------------------------
// Incoming: mixerView
// ---------------------------------------------------------------------------
function setupWindow(left, count) {
    ensureApis();
    leftIndex = left;
    visibleCount = count;
    applyWindow();
}
function mixerView() {
    const parsed = JSON.parse(arguments[0].toString());
    const left = parseInt(parsed[0].toString());
    const count = parseInt(parsed[1].toString());
    if (count === 0) {
        if (mixerViewTask) {
            mixerViewTask.cancel();
            mixerViewTask.freepeer();
            mixerViewTask = null;
        }
        // Don't teardown observers — keep them alive so sliders work immediately
        // when the user returns to the mixer page. Only stop meters.
        stopMeterFlush();
        return;
    }
    if (mixerViewTask) {
        mixerViewTask.cancel();
        mixerViewTask.freepeer();
    }
    mixerViewTask = new Task(function () {
        setupWindow(left, count);
    });
    mixerViewTask.schedule(250);
}
function mixerMeters(val) {
    const enabled = !!parseInt(val.toString());
    if (enabled === metersEnabled)
        return;
    metersEnabled = enabled;
    (0, utils_1.saveSetting)('metersEnabled', metersEnabled ? 1 : 0);
    sendMetersState();
    if (metersEnabled) {
        // Only create meter observers for visible tracks, not buffer
        const visRight = Math.min(leftIndex + visibleCount, trackList.length);
        for (let i = leftIndex; i < visRight; i++) {
            const tid = trackList[i].id;
            const strip = observersByTrackId[tid];
            if (strip && strip.hasOutput && !strip.meterLeftApi) {
                createMeterObservers(strip, strip.trackApi.unquotedpath);
            }
        }
        if (onMixerPage && observerSlots.length > 0)
            startMeterFlush();
    }
    else {
        stopMeterFlush();
        for (const trackIdStr in observersByTrackId) {
            teardownMeterObservers(observersByTrackId[trackIdStr]);
        }
    }
}
var sidebarMixerObj = null;
function getSidebarMixer() {
    if (sidebarMixerObj)
        return sidebarMixerObj;
    patcher.apply(function (obj) {
        if (obj.getattr && obj.getattr('filename') === 'k4-sidebarMixer.js') {
            sidebarMixerObj = obj;
            return false;
        }
        return true;
    });
    return sidebarMixerObj;
}
function sendMetersState() {
    (0, utils_1.osc)('/mixerMeters', metersEnabled ? 1 : 0);
    var chk = patcher.getnamed('chkMeters');
    if (chk)
        chk.message('set', metersEnabled ? 1 : 0);
    var sb = getSidebarMixer();
    if (sb)
        sb.message('sidebarMeters', metersEnabled ? 1 : 0);
}
function page() {
    const pageName = arguments[0].toString();
    const wasMixerPage = onMixerPage;
    onMixerPage = pageName === 'mixer' || pageName === 'session';
    if (onMixerPage && !wasMixerPage) {
        if (metersEnabled && observerSlots.length > 0)
            startMeterFlush();
    }
    else if (!onMixerPage && wasMixerPage) {
        stopMeterFlush();
    }
}
function init() {
    ensureApis();
    metersEnabled = !!(0, utils_1.loadSetting)('metersEnabled');
    sendMetersState();
    setupWindow(0, DEFAULT_VISIBLE_COUNT);
}
// ---------------------------------------------------------------------------
// Helpers: resolve strip from incoming index
// ---------------------------------------------------------------------------
function getStrip(stripIdx) {
    const rel = stripIdx - leftIndex;
    if (rel < 0 || rel >= visibleCount)
        return null;
    if (stripIdx >= trackList.length)
        return null;
    const tid = trackList[stripIdx].id;
    return observersByTrackId[tid] || null;
}
// ---------------------------------------------------------------------------
// Incoming Commands (App -> Device)
// ---------------------------------------------------------------------------
function vol(stripIdx, val) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    stripPause(strip, 'vol');
    const fVal = parseFloat(val.toString());
    strip.volApi.set('value', fVal);
    const str = strip.volApi.call('str_for_value', fVal);
    (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '');
}
function pan(stripIdx, val) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    stripPause(strip, 'pan');
    const fVal = parseFloat(val.toString());
    strip.panApi.set('value', fVal);
    const str = strip.panApi.call('str_for_value', fVal);
    (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], str ? str.toString() : '');
}
function volDefault(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    const defVal = parseFloat(strip.volApi.get('default_value').toString());
    strip.volApi.set('value', defVal);
    (0, utils_1.osc)(SA_VOL[strip.stripIndex], defVal);
    const str = strip.volApi.call('str_for_value', defVal);
    (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '');
}
function panDefault(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    const defVal = parseFloat(strip.panApi.get('default_value').toString());
    strip.panApi.set('value', defVal);
    const str = strip.panApi.call('str_for_value', defVal);
    (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], str ? str.toString() : '');
}
// Send handlers — send1 through send12
function handleSend(stripIdx, sendNum, val) {
    if (val === undefined)
        return;
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    const idx = sendNum - 1;
    if (idx < 0 || idx >= strip.sendApis.length)
        return;
    stripPause(strip, 'send');
    strip.sendApis[idx].set('value', parseFloat(val.toString()));
}
function handleSendDefault(stripIdx, sendNum) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    const idx = sendNum - 1;
    if (idx < 0 || idx >= strip.sendApis.length)
        return;
    strip.sendApis[idx].set('value', parseFloat(strip.sendApis[idx].get('default_value').toString()));
}
function send1(stripIdx, val) {
    handleSend(stripIdx, 1, val);
}
function send2(stripIdx, val) {
    handleSend(stripIdx, 2, val);
}
function send3(stripIdx, val) {
    handleSend(stripIdx, 3, val);
}
function send4(stripIdx, val) {
    handleSend(stripIdx, 4, val);
}
function send5(stripIdx, val) {
    handleSend(stripIdx, 5, val);
}
function send6(stripIdx, val) {
    handleSend(stripIdx, 6, val);
}
function send7(stripIdx, val) {
    handleSend(stripIdx, 7, val);
}
function send8(stripIdx, val) {
    handleSend(stripIdx, 8, val);
}
function send9(stripIdx, val) {
    handleSend(stripIdx, 9, val);
}
function send10(stripIdx, val) {
    handleSend(stripIdx, 10, val);
}
function send11(stripIdx, val) {
    handleSend(stripIdx, 11, val);
}
function send12(stripIdx, val) {
    handleSend(stripIdx, 12, val);
}
function sendDefault1(stripIdx) {
    handleSendDefault(stripIdx, 1);
}
function sendDefault2(stripIdx) {
    handleSendDefault(stripIdx, 2);
}
function sendDefault3(stripIdx) {
    handleSendDefault(stripIdx, 3);
}
function sendDefault4(stripIdx) {
    handleSendDefault(stripIdx, 4);
}
function sendDefault5(stripIdx) {
    handleSendDefault(stripIdx, 5);
}
function sendDefault6(stripIdx) {
    handleSendDefault(stripIdx, 6);
}
function sendDefault7(stripIdx) {
    handleSendDefault(stripIdx, 7);
}
function sendDefault8(stripIdx) {
    handleSendDefault(stripIdx, 8);
}
function sendDefault9(stripIdx) {
    handleSendDefault(stripIdx, 9);
}
function sendDefault10(stripIdx) {
    handleSendDefault(stripIdx, 10);
}
function sendDefault11(stripIdx) {
    handleSendDefault(stripIdx, 11);
}
function sendDefault12(stripIdx) {
    handleSendDefault(stripIdx, 12);
}
function toggleMute(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    const curr = parseInt(strip.trackApi.get('mute').toString());
    const newState = curr ? 0 : 1;
    strip.trackApi.set('mute', newState);
    (0, utils_1.osc)(SA_MUTE[strip.stripIndex], newState);
}
function toggleSolo(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    const curr = parseInt(strip.trackApi.get('solo').toString());
    const newState = curr ? 0 : 1;
    if (newState) {
        (0, mixerUtils_1.handleExclusiveSolo)(strip.trackId, scratchApi);
    }
    strip.trackApi.set('solo', newState);
    (0, utils_1.osc)(SA_SOLO[strip.stripIndex], newState);
    sendSoloCount();
}
function enableRecord(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip || !strip.canBeArmed)
        return;
    (0, mixerUtils_1.enableArm)(strip.trackApi, scratchApi);
    sendRecordStatusForStrip(strip);
}
function disableRecord(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip || !strip.canBeArmed)
        return;
    (0, mixerUtils_1.disableArm)(strip.trackApi);
    sendRecordStatusForStrip(strip);
}
function disableInput(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    (0, mixerUtils_1.disableTrackInput)(strip.trackApi);
    sendRecordStatusForStrip(strip);
}
function sendRecordStatusForStrip(strip) {
    const n = strip.stripIndex;
    const status = (0, mixerUtils_1.getRecordStatus)(strip.trackApi);
    (0, utils_1.osc)(SA_ARM[n], strip.canBeArmed ? status.armStatus : 0);
    (0, utils_1.osc)(SA_INPUT[n], status.inputEnabled ? 1 : 0);
}
function toggleXFadeA(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    (0, mixerUtils_1.toggleXFade)(strip.mixerApi, 0);
}
function toggleXFadeB(stripIdx) {
    const strip = getStrip(stripIdx);
    if (!strip)
        return;
    (0, mixerUtils_1.toggleXFade)(strip.mixerApi, 2);
}
// ---------------------------------------------------------------------------
// anything() dispatcher — receives (subCmd, stripIdx, val) from router
// ---------------------------------------------------------------------------
// anything() dispatcher — Max calls this with messagename = subCmd,
// arguments = [stripIdx, val] (from router outlet)
function anything() {
    const subCmd = messagename;
    const stripIdx = parseInt(arguments[0].toString());
    const val = arguments[1];
    if (subCmd === 'vol')
        vol(stripIdx, val);
    else if (subCmd === 'pan')
        pan(stripIdx, val);
    else if (subCmd === 'volDefault')
        volDefault(stripIdx);
    else if (subCmd === 'panDefault')
        panDefault(stripIdx);
    else if (subCmd === 'toggleMute')
        toggleMute(stripIdx);
    else if (subCmd === 'toggleSolo')
        toggleSolo(stripIdx);
    else if (subCmd === 'enableRecord')
        enableRecord(stripIdx);
    else if (subCmd === 'disableRecord')
        disableRecord(stripIdx);
    else if (subCmd === 'disableInput')
        disableInput(stripIdx);
    else if (subCmd === 'toggleXFadeA')
        toggleXFadeA(stripIdx);
    else if (subCmd === 'toggleXFadeB')
        toggleXFadeB(stripIdx);
    else if (subCmd === 'send1')
        send1(stripIdx, val);
    else if (subCmd === 'send2')
        send2(stripIdx, val);
    else if (subCmd === 'send3')
        send3(stripIdx, val);
    else if (subCmd === 'send4')
        send4(stripIdx, val);
    else if (subCmd === 'send5')
        send5(stripIdx, val);
    else if (subCmd === 'send6')
        send6(stripIdx, val);
    else if (subCmd === 'send7')
        send7(stripIdx, val);
    else if (subCmd === 'send8')
        send8(stripIdx, val);
    else if (subCmd === 'send9')
        send9(stripIdx, val);
    else if (subCmd === 'send10')
        send10(stripIdx, val);
    else if (subCmd === 'send11')
        send11(stripIdx, val);
    else if (subCmd === 'send12')
        send12(stripIdx, val);
    else if (subCmd === 'sendDefault1')
        sendDefault1(stripIdx);
    else if (subCmd === 'sendDefault2')
        sendDefault2(stripIdx);
    else if (subCmd === 'sendDefault3')
        sendDefault3(stripIdx);
    else if (subCmd === 'sendDefault4')
        sendDefault4(stripIdx);
    else if (subCmd === 'sendDefault5')
        sendDefault5(stripIdx);
    else if (subCmd === 'sendDefault6')
        sendDefault6(stripIdx);
    else if (subCmd === 'sendDefault7')
        sendDefault7(stripIdx);
    else if (subCmd === 'sendDefault8')
        sendDefault8(stripIdx);
    else if (subCmd === 'sendDefault9')
        sendDefault9(stripIdx);
    else if (subCmd === 'sendDefault10')
        sendDefault10(stripIdx);
    else if (subCmd === 'sendDefault11')
        sendDefault11(stripIdx);
    else if (subCmd === 'sendDefault12')
        sendDefault12(stripIdx);
}
function visibleTracks() {
    const d = new Dict('visibleTracksDict');
    trackList = JSON.parse(d.get('tracks').toString());
    // Clamp leftIndex if track list shrank
    if (leftIndex >= trackList.length) {
        leftIndex = Math.max(0, trackList.length - visibleCount);
    }
    sendReturnTrackColors();
    if (visibleCount > 0) {
        applyWindow();
    }
}
log('reloaded k4-multiMixer');
module.exports = {};
