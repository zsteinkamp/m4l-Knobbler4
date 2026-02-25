"use strict";
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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Module-level scratchpad for one-off lookups (reuse via .path is fastest)
var scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
var CHUNK_MAX_BYTES = 1024;
var DEFAULT_VISIBLE_COUNT = 18;
var MAX_STRIP_IDX = 128;
// Pre-computed OSC address strings for mixer strips
var SA_VOL = [];
var SA_VOLSTR = [];
var SA_PAN = [];
var SA_PANSTR = [];
var SA_MUTE = [];
var SA_SOLO = [];
var SA_ARM = [];
var SA_INPUT = [];
var SA_HASOUTPUT = [];
var SA_XFADEA = [];
var SA_XFADEB = [];
var SA_XFADEASSIGN = [];
var SA_NAME = [];
var SA_COLOR = [];
var SA_TYPE = [];
var SA_SEND = [];
for (var _i = 0; _i < MAX_STRIP_IDX; _i++) {
    var _p = '/mixer/' + _i + '/';
    SA_VOL[_i] = _p + 'vol';
    SA_VOLSTR[_i] = _p + 'volStr';
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
    for (var _j = 0; _j < consts_1.MAX_SENDS; _j++) {
        SA_SEND[_i][_j] = _p + 'send' + (_j + 1);
    }
}
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var trackList = [];
var leftIndex = -1;
var visibleCount = 0;
// Observers keyed by track ID — survives window slides if the track stays visible
var observersByTrackId = {};
// Window slots: maps position index -> track ID currently at that position
var windowSlots = [];
var metersEnabled = false;
var onMixerPage = false;
var meterBuffer = [];
var meterDirty = false;
var meterFlushTask = null;
var mixerViewTask = null;
// Track list watchers
var visibleTracksWatcher = null;
var returnTracksWatcher = null;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clientHasCapability(cap) {
    var caps = (0, utils_1.loadSetting)('clientCapabilities');
    if (!caps) {
        return false;
    }
    return (' ' + caps.toString() + ' ').indexOf(' ' + cap + ' ') !== -1;
}
function sendChunkedData(prefix, items) {
    var chunked = clientHasCapability('cNav');
    if (chunked) {
        outlet(consts_1.OUTLET_OSC, [prefix + '/start', items.length]);
        var chunk = [];
        var chunkSize = 2;
        for (var i = 0; i < items.length; i++) {
            var itemJson = JSON.stringify(items[i]);
            var added = (chunk.length > 0 ? 1 : 0) + itemJson.length;
            if (chunk.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
                outlet(consts_1.OUTLET_OSC, [prefix + '/chunk', JSON.stringify(chunk)]);
                chunk = [];
                chunkSize = 2;
            }
            chunk.push(items[i]);
            chunkSize += added;
        }
        if (chunk.length > 0) {
            outlet(consts_1.OUTLET_OSC, [prefix + '/chunk', JSON.stringify(chunk)]);
        }
        outlet(consts_1.OUTLET_OSC, [prefix + '/end']);
    }
    if (!chunked) {
        outlet(consts_1.OUTLET_OSC, [prefix, JSON.stringify(items)]);
    }
}
function stripPause(strip, key) {
    if (!strip.pause[key]) {
        strip.pause[key] = { paused: false, task: null };
    }
    (0, utils_1.pauseUnpause)(strip.pause[key], consts_1.PAUSE_MS);
}
// ---------------------------------------------------------------------------
// Track List Builder
// ---------------------------------------------------------------------------
function buildTrackList() {
    var ret = [];
    // visible tracks only (respects group folding)
    scratchApi.path = 'live_set';
    var trackIds = (0, utils_1.cleanArr)(scratchApi.get('visible_tracks'));
    for (var _a = 0, trackIds_1 = trackIds; _a < trackIds_1.length; _a++) {
        var id = trackIds_1[_a];
        scratchApi.id = id;
        var isFoldable = parseInt(scratchApi.get('is_foldable').toString());
        var parentId = (0, utils_1.cleanArr)(scratchApi.get('group_track'))[0] || 0;
        ret.push({
            id: id,
            type: isFoldable ? consts_1.TYPE_GROUP : consts_1.TYPE_TRACK,
            name: (0, utils_1.truncate)(scratchApi.get('name').toString(), consts_1.MAX_NAME_LEN),
            color: (0, utils_1.colorToString)(scratchApi.get('color').toString()),
            parentId: parentId,
        });
    }
    // return tracks (always visible)
    scratchApi.path = 'live_set';
    var returnIds = (0, utils_1.cleanArr)(scratchApi.get('return_tracks'));
    for (var _b = 0, returnIds_1 = returnIds; _b < returnIds_1.length; _b++) {
        var id = returnIds_1[_b];
        scratchApi.id = id;
        ret.push({
            id: id,
            type: consts_1.TYPE_RETURN,
            name: (0, utils_1.truncate)(scratchApi.get('name').toString(), consts_1.MAX_NAME_LEN),
            color: (0, utils_1.colorToString)(scratchApi.get('color').toString()),
            parentId: 0,
        });
    }
    // master track
    scratchApi.path = 'live_set';
    var mainId = (0, utils_1.cleanArr)(scratchApi.get('master_track'))[0];
    scratchApi.id = mainId;
    ret.push({
        id: mainId,
        type: consts_1.TYPE_MAIN,
        name: (0, utils_1.truncate)(scratchApi.get('name').toString(), consts_1.MAX_NAME_LEN),
        color: (0, utils_1.colorToString)(scratchApi.get('color').toString()),
        parentId: 0,
    });
    return ret;
}
function sendVisibleTracks() {
    var items = trackList.map(function (t) {
        return [t.type, t.id, t.name, t.color, null, null, t.parentId];
    });
    sendChunkedData('/visibleTracks', items);
}
// ---------------------------------------------------------------------------
// Track List Watchers
// ---------------------------------------------------------------------------
function onVisibleTracksChange(args) {
    if (args[0] !== 'visible_tracks') {
        return;
    }
    if (visibleCount <= 0) {
        return;
    }
    trackList = buildTrackList();
    sendVisibleTracks();
    applyWindow();
}
function sendReturnTrackColors() {
    scratchApi.path = 'live_set';
    var returnIds = (0, utils_1.cleanArr)(scratchApi.get('return_tracks'));
    var colors = [];
    for (var i = 0; i < consts_1.MAX_SENDS; i++) {
        if (returnIds[i]) {
            scratchApi.id = returnIds[i];
            colors.push('#' + (0, utils_1.colorToString)(scratchApi.get('color').toString()));
        }
        else {
            colors.push('#' + consts_1.DEFAULT_COLOR);
        }
    }
    outlet(consts_1.OUTLET_OSC, ['/mixer/returnTrackColors', JSON.stringify(colors)]);
}
function onReturnTracksChange(args) {
    if (args[0] !== 'return_tracks') {
        return;
    }
    if (visibleCount <= 0) {
        return;
    }
    trackList = buildTrackList();
    sendVisibleTracks();
    sendReturnTrackColors();
    applyWindow();
}
// ---------------------------------------------------------------------------
// Meter Observers
// ---------------------------------------------------------------------------
function createMeterObservers(strip, trackPath) {
    var baseOffset = (strip.stripIndex - leftIndex) * 3;
    strip.meterLeftApi = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_left') {
            var v = (0, utils_1.meterVal)(args[1]);
            if (v !== meterBuffer[baseOffset]) {
                meterBuffer[baseOffset] = v;
                meterDirty = true;
            }
        }
    }, trackPath);
    strip.meterLeftApi.property = 'output_meter_left';
    strip.meterRightApi = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_right') {
            var v = (0, utils_1.meterVal)(args[1]);
            if (v !== meterBuffer[baseOffset + 1]) {
                meterBuffer[baseOffset + 1] = v;
                meterDirty = true;
            }
        }
    }, trackPath);
    strip.meterRightApi.property = 'output_meter_right';
    strip.meterLevelApi = new LiveAPI(function (args) {
        if (args[0] === 'output_meter_level') {
            var v = (0, utils_1.meterVal)(args[1]);
            if (v !== meterBuffer[baseOffset + 2]) {
                meterBuffer[baseOffset + 2] = v;
                meterDirty = true;
            }
        }
    }, trackPath);
    strip.meterLevelApi.property = 'output_meter_level';
}
function teardownMeterObservers(strip) {
    if (strip.meterLeftApi) {
        strip.meterLeftApi.id = 0;
        strip.meterLeftApi = null;
    }
    if (strip.meterRightApi) {
        strip.meterRightApi.id = 0;
        strip.meterRightApi = null;
    }
    if (strip.meterLevelApi) {
        strip.meterLevelApi.id = 0;
        strip.meterLevelApi = null;
    }
    // Zero out this strip's slots in the buffer
    var baseOffset = (strip.stripIndex - leftIndex) * 3;
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
    outlet(consts_1.OUTLET_OSC, ['/mixer/meters', JSON.stringify(meterBuffer)]);
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
    var strip = {
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
        panApi: null,
        sendApis: [],
        pause: {},
        stripIndex: stripIdx,
        canBeArmed: false,
        hasOutput: false,
        isMain: false,
    };
    // Get the track's path so we can build full paths for children
    scratchApi.id = trackId;
    var trackPath = scratchApi.unquotedpath;
    var mixerPath = trackPath + ' mixer_device';
    strip.isMain = trackPath.indexOf('master_track') > -1;
    // Color API — separate observer for track color changes
    strip.colorApi = new LiveAPI(function (args) {
        if (args[0] === 'color') {
            trackList = buildTrackList();
            sendVisibleTracks();
        }
    }, trackPath);
    strip.colorApi.property = 'color';
    // Track API — used for querying properties (no observer)
    strip.trackApi = new LiveAPI(consts_1.noFn, trackPath);
    // Mute, solo, arm — separate observers (master track lacks these)
    if (!strip.isMain) {
        strip.muteApi = new LiveAPI(function (args) {
            if (args[0] === 'mute') {
                (0, utils_1.osc)(SA_MUTE[strip.stripIndex], parseInt(args[1].toString()));
            }
        }, trackPath);
        strip.muteApi.property = 'mute';
        strip.soloApi = new LiveAPI(function (args) {
            if (args[0] === 'solo') {
                (0, utils_1.osc)(SA_SOLO[strip.stripIndex], parseInt(args[1].toString()));
            }
        }, trackPath);
        strip.soloApi.property = 'solo';
    }
    strip.canBeArmed =
        !strip.isMain && !!parseInt(strip.trackApi.get('can_be_armed').toString());
    if (strip.canBeArmed) {
        strip.armApi = new LiveAPI(function (args) {
            if (args[0] === 'arm') {
                (0, utils_1.osc)(SA_ARM[strip.stripIndex], parseInt(args[1].toString()));
            }
        }, trackPath);
        strip.armApi.property = 'arm';
    }
    // Check has_audio_output
    var trackInfo = strip.trackApi.info.toString();
    strip.hasOutput =
        trackInfo.indexOf('has_audio_output') > -1
            ? !!parseInt(strip.trackApi.get('has_audio_output').toString())
            : false;
    // Output level meters (only if enabled and track has audio output)
    if (metersEnabled && strip.hasOutput) {
        createMeterObservers(strip, trackPath);
    }
    // Mixer API — observe crossfade_assign (master track lacks this)
    strip.mixerApi = new LiveAPI(function (args) {
        //log('OMG', args)
        if (args[0] === 'crossfade_assign') {
            var xVal = parseInt(args[1].toString());
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
        if (args[0] !== 'value')
            return;
        if (!strip.pause['vol'] || !strip.pause['vol'].paused) {
            var fVal = parseFloat(args[1]) || 0;
            (0, utils_1.osc)(SA_VOL[strip.stripIndex], fVal);
            var str = strip.volApi.call('str_for_value', fVal);
            (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '');
        }
    }, mixerPath + ' volume');
    strip.volApi.property = 'value';
    // Pan observer
    strip.panApi = new LiveAPI(function (args) {
        if (args[0] !== 'value')
            return;
        if (!strip.pause['pan'] || !strip.pause['pan'].paused) {
            var fVal = parseFloat(args[1]) || 0;
            (0, utils_1.osc)(SA_PAN[strip.stripIndex], fVal);
            var str = strip.panApi.call('str_for_value', fVal);
            (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], str ? str.toString() : '');
        }
    }, mixerPath + ' panning');
    strip.panApi.property = 'value';
    // Send observers
    scratchApi.path = mixerPath;
    var sendIds = (0, utils_1.cleanArr)(scratchApi.get('sends'));
    var numSends = Math.min(sendIds.length, consts_1.MAX_SENDS);
    var _loop_1 = function (i) {
        var sendIdx = i;
        var sendApi = new LiveAPI(function (args) {
            if (args[0] !== 'value')
                return;
            if (!strip.pause['send'] || !strip.pause['send'].paused) {
                (0, utils_1.osc)(SA_SEND[strip.stripIndex][sendIdx], args[1] || 0);
            }
        }, 'id ' + sendIds[i]);
        sendApi.property = 'value';
        strip.sendApis.push(sendApi);
    };
    for (var i = 0; i < numSends; i++) {
        _loop_1(i);
    }
    return strip;
}
function teardownStripObservers(strip) {
    if (strip.trackApi) {
        strip.trackApi.id = 0;
    }
    if (strip.colorApi) {
        strip.colorApi.id = 0;
    }
    if (strip.muteApi) {
        strip.muteApi.id = 0;
    }
    if (strip.soloApi) {
        strip.soloApi.id = 0;
    }
    if (strip.armApi) {
        strip.armApi.id = 0;
    }
    teardownMeterObservers(strip);
    if (strip.mixerApi) {
        strip.mixerApi.id = 0;
    }
    if (strip.volApi) {
        strip.volApi.id = 0;
    }
    if (strip.panApi) {
        strip.panApi.id = 0;
    }
    for (var i = 0; i < strip.sendApis.length; i++) {
        strip.sendApis[i].id = 0;
    }
    // Cancel all pause tasks
    for (var key in strip.pause) {
        if (strip.pause[key].task) {
            strip.pause[key].task.cancel();
            strip.pause[key].task.freepeer();
        }
    }
}
function teardownAll() {
    stopMeterFlush();
    for (var trackIdStr in observersByTrackId) {
        teardownStripObservers(observersByTrackId[trackIdStr]);
    }
    observersByTrackId = {};
    windowSlots = [];
    trackList = [];
    meterBuffer = [];
}
// ---------------------------------------------------------------------------
// Send Strip State
// ---------------------------------------------------------------------------
function sendStripState(n, strip) {
    // Find the track info
    var info = null;
    for (var i = 0; i < trackList.length; i++) {
        if (trackList[i].id === strip.trackId) {
            info = trackList[i];
            break;
        }
    }
    if (info) {
        (0, utils_1.osc)(SA_NAME[n], info.name);
        (0, utils_1.osc)(SA_COLOR[n], info.color);
        (0, utils_1.osc)(SA_TYPE[n], info.type);
    }
    // Volume
    var volVal = strip.volApi.get('value');
    var fVolVal = parseFloat(volVal.toString()) || 0;
    (0, utils_1.osc)(SA_VOL[n], fVolVal);
    var volStr = strip.volApi.call('str_for_value', fVolVal);
    (0, utils_1.osc)(SA_VOLSTR[n], volStr ? volStr.toString() : '');
    // Pan
    var panVal = strip.panApi.get('value');
    var fPanVal = parseFloat(panVal.toString()) || 0;
    (0, utils_1.osc)(SA_PAN[n], fPanVal);
    var panStr = strip.panApi.call('str_for_value', fPanVal);
    (0, utils_1.osc)(SA_PANSTR[n], panStr ? panStr.toString() : '');
    // Mute / Solo (master track lacks these)
    if (!strip.isMain) {
        (0, utils_1.osc)(SA_MUTE[n], parseInt(strip.trackApi.get('mute').toString()));
        (0, utils_1.osc)(SA_SOLO[n], parseInt(strip.trackApi.get('solo').toString()));
    }
    else {
        (0, utils_1.osc)(SA_MUTE[n], 0);
        (0, utils_1.osc)(SA_SOLO[n], 0);
    }
    // Arm / Input
    if (strip.canBeArmed) {
        (0, utils_1.osc)(SA_ARM[n], parseInt(strip.trackApi.get('arm').toString()));
        var inputStatus = (0, toggleInput_1.getTrackInputStatus)(strip.trackApi);
        (0, utils_1.osc)(SA_INPUT[n], inputStatus && inputStatus.inputEnabled ? 1 : 0);
    }
    else {
        (0, utils_1.osc)(SA_ARM[n], 0);
        (0, utils_1.osc)(SA_INPUT[n], 0);
    }
    // Has output
    (0, utils_1.osc)(SA_HASOUTPUT[n], strip.hasOutput ? 1 : 0);
    // Crossfade assign (master track lacks this)
    if (!strip.isMain) {
        (0, utils_1.osc)(SA_XFADEASSIGN[n], parseInt(strip.mixerApi.get('crossfade_assign').toString()));
    }
    else {
        (0, utils_1.osc)(SA_XFADEASSIGN[n], 0);
    }
    // Sends
    for (var i = 0; i < strip.sendApis.length; i++) {
        var sendVal = strip.sendApis[i].get('value');
        (0, utils_1.osc)(SA_SEND[n][i], parseFloat(sendVal.toString()) || 0);
    }
}
// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------
function applyWindow() {
    if (leftIndex < 0 || visibleCount <= 0) {
        return;
    }
    // Build new window slots
    var newSlots = [];
    for (var i = 0; i < visibleCount; i++) {
        var trackIdx = leftIndex + i;
        if (trackIdx < trackList.length) {
            newSlots.push(trackList[trackIdx].id);
        }
    }
    // Resize meter buffer if visible count changed
    var requiredLen = visibleCount * 3;
    if (meterBuffer.length !== requiredLen) {
        var wasRunning = !!meterFlushTask;
        if (wasRunning)
            stopMeterFlush();
        var newBuf = [];
        for (var i = 0; i < requiredLen; i++)
            newBuf.push(0);
        meterBuffer = newBuf;
        if (wasRunning && metersEnabled)
            startMeterFlush();
    }
    // Compute keep/remove/add sets
    var oldSet = {};
    for (var i = 0; i < windowSlots.length; i++) {
        oldSet[windowSlots[i]] = true;
    }
    var newSet = {};
    for (var i = 0; i < newSlots.length; i++) {
        newSet[newSlots[i]] = true;
    }
    // Remove: in old but not in new
    for (var i = 0; i < windowSlots.length; i++) {
        var tid = windowSlots[i];
        if (!newSet[tid] && observersByTrackId[tid]) {
            teardownStripObservers(observersByTrackId[tid]);
            delete observersByTrackId[tid];
        }
    }
    // Add: in new but not in old
    for (var i = 0; i < newSlots.length; i++) {
        var tid = newSlots[i];
        if (!oldSet[tid]) {
            observersByTrackId[tid] = createStripObservers(tid, leftIndex + i);
        }
    }
    // Update strip indices for all observers (positions may have shifted)
    for (var i = 0; i < newSlots.length; i++) {
        var tid = newSlots[i];
        if (observersByTrackId[tid]) {
            observersByTrackId[tid].stripIndex = leftIndex + i;
        }
    }
    windowSlots = newSlots;
    // Send initial state only for newly added strips
    for (var i = 0; i < windowSlots.length; i++) {
        var tid = windowSlots[i];
        if (!oldSet[tid] && observersByTrackId[tid]) {
            sendStripState(leftIndex + i, observersByTrackId[tid]);
        }
    }
}
// ---------------------------------------------------------------------------
// Refresh — called on /btnRefresh to invalidate stale observers
// ---------------------------------------------------------------------------
function mixerRefresh() {
    teardownAll();
}
// ---------------------------------------------------------------------------
// Incoming: mixerView
// ---------------------------------------------------------------------------
function setupWindow(left, count) {
    var firstSetup = trackList.length === 0;
    leftIndex = left;
    visibleCount = count;
    // Set up track list watchers on first activation
    if (!visibleTracksWatcher) {
        visibleTracksWatcher = new LiveAPI(onVisibleTracksChange, 'live_set');
        visibleTracksWatcher.property = 'visible_tracks';
    }
    if (!returnTracksWatcher) {
        returnTracksWatcher = new LiveAPI(onReturnTracksChange, 'live_set');
        returnTracksWatcher.property = 'return_tracks';
    }
    if (firstSetup) {
        scratchApi.path = 'live_set';
        var numSends = Math.min((0, utils_1.cleanArr)(scratchApi.get('return_tracks')).length, consts_1.MAX_SENDS);
        //log('SENDING numSends', numSends)
        outlet(consts_1.OUTLET_OSC, ['/mixer/numSends', numSends]);
        sendReturnTrackColors();
        trackList = buildTrackList();
        sendVisibleTracks();
    }
    applyWindow();
}
function mixerView() {
    var parsed = JSON.parse(arguments[0].toString());
    var left = parseInt(parsed[0].toString());
    var count = parseInt(parsed[1].toString());
    if (count === 0) {
        if (mixerViewTask) {
            mixerViewTask.cancel();
            mixerViewTask.freepeer();
            mixerViewTask = null;
        }
        teardownAll();
        leftIndex = -1;
        visibleCount = 0;
        return;
    }
    if (mixerViewTask) {
        mixerViewTask.cancel();
        mixerViewTask.freepeer();
    }
    mixerViewTask = new Task(function () {
        setupWindow(left, count);
    });
    mixerViewTask.schedule(500);
}
function mixerMeters(val) {
    var enabled = !!parseInt(val.toString());
    metersEnabled = enabled;
    outlet(consts_1.OUTLET_OSC, ['/mixerMeters', metersEnabled ? 1 : 0]);
    if (metersEnabled) {
        for (var trackIdStr in observersByTrackId) {
            var strip = observersByTrackId[trackIdStr];
            if (strip.hasOutput) {
                var trackPath = strip.trackApi.unquotedpath;
                createMeterObservers(strip, trackPath);
            }
        }
        if (onMixerPage && windowSlots.length > 0)
            startMeterFlush();
    }
    else {
        stopMeterFlush();
        for (var trackIdStr in observersByTrackId) {
            teardownMeterObservers(observersByTrackId[trackIdStr]);
        }
    }
}
function page() {
    var pageName = arguments[0].toString();
    var wasMixerPage = onMixerPage;
    onMixerPage = pageName === 'mixer';
    if (onMixerPage && !wasMixerPage) {
        if (metersEnabled && windowSlots.length > 0)
            startMeterFlush();
    }
    else if (!onMixerPage && wasMixerPage) {
        stopMeterFlush();
    }
}
function init() {
    setupWindow(0, DEFAULT_VISIBLE_COUNT);
}
// ---------------------------------------------------------------------------
// Helpers: resolve strip from incoming index
// ---------------------------------------------------------------------------
function getStrip(stripIdx) {
    var rel = stripIdx - leftIndex;
    if (rel < 0 || rel >= windowSlots.length) {
        return null;
    }
    var tid = windowSlots[rel];
    return observersByTrackId[tid] || null;
}
// ---------------------------------------------------------------------------
// Incoming Commands (App -> Device)
// ---------------------------------------------------------------------------
function vol(stripIdx, val) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    stripPause(strip, 'vol');
    var fVal = parseFloat(val.toString());
    strip.volApi.set('value', fVal);
    var str = strip.volApi.call('str_for_value', fVal);
    (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '');
}
function pan(stripIdx, val) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    stripPause(strip, 'pan');
    var fVal = parseFloat(val.toString());
    strip.panApi.set('value', fVal);
    var str = strip.panApi.call('str_for_value', fVal);
    (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], str ? str.toString() : '');
}
function volDefault(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var defVal = parseFloat(strip.volApi.get('default_value').toString());
    strip.volApi.set('value', defVal);
    (0, utils_1.osc)(SA_VOL[strip.stripIndex], defVal);
    var str = strip.volApi.call('str_for_value', defVal);
    (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '');
}
function panDefault(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var defVal = parseFloat(strip.panApi.get('default_value').toString());
    strip.panApi.set('value', defVal);
    var str = strip.panApi.call('str_for_value', defVal);
    (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], str ? str.toString() : '');
}
// Send handlers — send1 through send12
function handleSend(stripIdx, sendNum, val) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var idx = sendNum - 1;
    if (idx < 0 || idx >= strip.sendApis.length)
        return;
    stripPause(strip, 'send');
    strip.sendApis[idx].set('value', parseFloat(val.toString()));
}
function handleSendDefault(stripIdx, sendNum) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var idx = sendNum - 1;
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
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var curr = parseInt(strip.trackApi.get('mute').toString());
    var newState = curr ? 0 : 1;
    strip.trackApi.set('mute', newState);
    (0, utils_1.osc)(SA_MUTE[strip.stripIndex], newState);
}
function toggleSolo(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var curr = parseInt(strip.trackApi.get('solo').toString());
    var newState = curr ? 0 : 1;
    if (newState) {
        scratchApi.path = 'live_set';
        if (parseInt(scratchApi.get('exclusive_solo').toString()) === 1) {
            var tracks = (0, utils_1.cleanArr)(scratchApi.get('tracks'));
            var returns = (0, utils_1.cleanArr)(scratchApi.get('return_tracks'));
            for (var _a = 0, _b = tracks.concat(returns); _a < _b.length; _a++) {
                var tid = _b[_a];
                if (tid === strip.trackId)
                    continue;
                scratchApi.id = tid;
                scratchApi.set('solo', 0);
            }
        }
    }
    strip.trackApi.set('solo', newState);
    (0, utils_1.osc)(SA_SOLO[strip.stripIndex], newState);
}
function enableRecord(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip || !strip.canBeArmed)
        return;
    (0, toggleInput_1.enableTrackInput)(strip.trackApi);
    strip.trackApi.set('arm', 1);
    scratchApi.path = 'live_set';
    if (parseInt(scratchApi.get('exclusive_arm').toString()) === 1) {
        var tracks = (0, utils_1.cleanArr)(scratchApi.get('tracks'));
        for (var _a = 0, tracks_1 = tracks; _a < tracks_1.length; _a++) {
            var tid = tracks_1[_a];
            if (tid === strip.trackId)
                continue;
            scratchApi.id = tid;
            if (parseInt(scratchApi.get('can_be_armed').toString())) {
                scratchApi.set('arm', 0);
            }
        }
    }
    sendRecordStatusForStrip(strip);
}
function disableRecord(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip || !strip.canBeArmed)
        return;
    strip.trackApi.set('arm', 0);
    sendRecordStatusForStrip(strip);
}
function disableInput(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    (0, toggleInput_1.disableTrackInput)(strip.trackApi);
    sendRecordStatusForStrip(strip);
}
function sendRecordStatusForStrip(strip) {
    var n = strip.stripIndex;
    var armStatus = strip.canBeArmed && parseInt(strip.trackApi.get('arm').toString());
    var inputStatus = (0, toggleInput_1.getTrackInputStatus)(strip.trackApi);
    (0, utils_1.osc)(SA_ARM[n], armStatus ? 1 : 0);
    (0, utils_1.osc)(SA_INPUT[n], inputStatus && inputStatus.inputEnabled ? 1 : 0);
}
function toggleXFadeA(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var curr = parseInt(strip.mixerApi.get('crossfade_assign').toString());
    strip.mixerApi.set('crossfade_assign', curr === 0 ? 1 : 0);
}
function toggleXFadeB(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var curr = parseInt(strip.mixerApi.get('crossfade_assign').toString());
    strip.mixerApi.set('crossfade_assign', curr === 2 ? 1 : 2);
}
// ---------------------------------------------------------------------------
// anything() dispatcher — receives (subCmd, stripIdx, val) from router
// ---------------------------------------------------------------------------
// anything() dispatcher — Max calls this with messagename = subCmd,
// arguments = [stripIdx, val] (from router outlet)
function anything() {
    var subCmd = messagename;
    var stripIdx = parseInt(arguments[0].toString());
    var val = arguments[1];
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
log('reloaded k4-multiMixer');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
