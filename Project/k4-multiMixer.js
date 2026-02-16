"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var toggleInput_1 = require("./toggleInput");
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setoutletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
var MAX_SENDS = 12;
var PAUSE_MS = 300;
var CHUNK_MAX_BYTES = 1024;
var DEFAULT_VISIBLE_COUNT = 12;
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
function pauseUnpause(strip, key) {
    if (!strip.pause[key]) {
        strip.pause[key] = { paused: false, task: null };
    }
    if (strip.pause[key].paused) {
        strip.pause[key].task.cancel();
        strip.pause[key].task.freepeer();
    }
    strip.pause[key].paused = true;
    strip.pause[key].task = new Task(function () {
        strip.pause[key].paused = false;
    });
    strip.pause[key].task.schedule(PAUSE_MS);
}
// ---------------------------------------------------------------------------
// Track List Builder
// ---------------------------------------------------------------------------
function buildTrackList() {
    var api = new LiveAPI(consts_1.noFn, 'live_set');
    var ret = [];
    // visible tracks only (respects group folding)
    var trackIds = (0, utils_1.cleanArr)(api.get('visible_tracks'));
    for (var _i = 0, trackIds_1 = trackIds; _i < trackIds_1.length; _i++) {
        var id = trackIds_1[_i];
        api.id = id;
        var isFoldable = parseInt(api.get('is_foldable').toString());
        ret.push({
            id: id,
            type: isFoldable ? consts_1.TYPE_GROUP : consts_1.TYPE_TRACK,
            name: (0, utils_1.truncate)(api.get('name').toString(), consts_1.MAX_NAME_LEN),
            color: (0, utils_1.colorToString)(api.get('color').toString()),
        });
    }
    // return tracks (always visible)
    api.path = 'live_set';
    var returnIds = (0, utils_1.cleanArr)(api.get('return_tracks'));
    for (var _a = 0, returnIds_1 = returnIds; _a < returnIds_1.length; _a++) {
        var id = returnIds_1[_a];
        api.id = id;
        ret.push({
            id: id,
            type: consts_1.TYPE_RETURN,
            name: (0, utils_1.truncate)(api.get('name').toString(), consts_1.MAX_NAME_LEN),
            color: (0, utils_1.colorToString)(api.get('color').toString()),
        });
    }
    // master track
    api.path = 'live_set';
    var mainId = (0, utils_1.cleanArr)(api.get('master_track'))[0];
    api.id = mainId;
    ret.push({
        id: mainId,
        type: consts_1.TYPE_MAIN,
        name: (0, utils_1.truncate)(api.get('name').toString(), consts_1.MAX_NAME_LEN),
        color: (0, utils_1.colorToString)(api.get('color').toString()),
    });
    return ret;
}
function sendVisibleTracks() {
    var items = trackList.map(function (t) {
        return [t.type, t.id, t.name, t.color];
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
function onReturnTracksChange(args) {
    if (args[0] !== 'return_tracks') {
        return;
    }
    if (visibleCount <= 0) {
        return;
    }
    trackList = buildTrackList();
    sendVisibleTracks();
    applyWindow();
}
// ---------------------------------------------------------------------------
// Observer Creation / Teardown
// ---------------------------------------------------------------------------
function createStripObservers(trackId, stripIdx) {
    var strip = {
        trackId: trackId,
        trackApi: null,
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
    var pathLookup = new LiveAPI(consts_1.noFn, 'id ' + trackId);
    var trackPath = pathLookup.unquotedpath;
    var mixerPath = trackPath + ' mixer_device';
    strip.isMain = trackPath.indexOf('master_track') > -1;
    // Track API — observe mute, solo, arm (master track lacks these)
    strip.trackApi = new LiveAPI(function (args) {
        var prop = args[0];
        if (prop === 'mute') {
            outlet(consts_1.OUTLET_OSC, [
                '/mixer/' + strip.stripIndex + '/mute',
                parseInt(args[1].toString()),
            ]);
        }
        else if (prop === 'solo') {
            outlet(consts_1.OUTLET_OSC, [
                '/mixer/' + strip.stripIndex + '/solo',
                parseInt(args[1].toString()),
            ]);
        }
        else if (prop === 'arm') {
            outlet(consts_1.OUTLET_OSC, [
                '/mixer/' + strip.stripIndex + '/recordArm',
                parseInt(args[1].toString()),
            ]);
        }
    }, trackPath);
    if (!strip.isMain) {
        strip.trackApi.property = 'mute';
        strip.trackApi.property = 'solo';
    }
    strip.canBeArmed = !strip.isMain && !!parseInt(strip.trackApi.get('can_be_armed').toString());
    if (strip.canBeArmed) {
        strip.trackApi.property = 'arm';
    }
    // Check has_audio_output
    var trackInfo = strip.trackApi.info.toString();
    strip.hasOutput =
        trackInfo.indexOf('has_audio_output') > -1
            ? !!parseInt(strip.trackApi.get('has_audio_output').toString())
            : false;
    // Mixer API — observe crossfade_assign (master track lacks this)
    strip.mixerApi = new LiveAPI(function (args) {
        if (args[0] === 'crossfade_assign') {
            outlet(consts_1.OUTLET_OSC, [
                '/mixer/' + strip.stripIndex + '/xFadeAssign',
                parseInt(args[1].toString()),
            ]);
        }
    }, mixerPath);
    if (!strip.isMain) {
        strip.mixerApi.property = 'crossfade_assign';
    }
    // Volume observer
    strip.volApi = new LiveAPI(function (args) {
        if (args[0] !== 'value')
            return;
        if (!strip.pause['vol'] || !strip.pause['vol'].paused) {
            outlet(consts_1.OUTLET_OSC, ['/mixer/' + strip.stripIndex + '/vol', args[1] || 0]);
        }
    }, mixerPath + ' volume');
    strip.volApi.property = 'value';
    // Pan observer
    strip.panApi = new LiveAPI(function (args) {
        if (args[0] !== 'value')
            return;
        if (!strip.pause['pan'] || !strip.pause['pan'].paused) {
            outlet(consts_1.OUTLET_OSC, ['/mixer/' + strip.stripIndex + '/pan', args[1] || 0]);
        }
    }, mixerPath + ' panning');
    strip.panApi.property = 'value';
    // Send observers
    var tempApi = new LiveAPI(consts_1.noFn, mixerPath);
    var sendIds = (0, utils_1.cleanArr)(tempApi.get('sends'));
    var numSends = Math.min(sendIds.length, MAX_SENDS);
    var _loop_1 = function (i) {
        var sendIdx = i;
        var sendApi = new LiveAPI(function (args) {
            if (args[0] !== 'value')
                return;
            if (!strip.pause['send'] || !strip.pause['send'].paused) {
                outlet(consts_1.OUTLET_OSC, [
                    '/mixer/' + strip.stripIndex + '/send' + (sendIdx + 1),
                    args[1] || 0,
                ]);
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
    for (var trackIdStr in observersByTrackId) {
        teardownStripObservers(observersByTrackId[trackIdStr]);
    }
    observersByTrackId = {};
    windowSlots = [];
    trackList = [];
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
        outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/name', info.name]);
        outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/color', info.color]);
        outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/type', info.type]);
    }
    // Volume
    var volVal = strip.volApi.get('value');
    outlet(consts_1.OUTLET_OSC, [
        '/mixer/' + n + '/vol',
        parseFloat(volVal.toString()) || 0,
    ]);
    var volStr = strip.volApi.call('str_for_value', parseFloat(volVal.toString()));
    outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/volStr', volStr ? volStr.toString() : '']);
    // Pan
    var panVal = strip.panApi.get('value');
    outlet(consts_1.OUTLET_OSC, [
        '/mixer/' + n + '/pan',
        parseFloat(panVal.toString()) || 0,
    ]);
    var panStr = strip.panApi.call('str_for_value', parseFloat(panVal.toString()));
    outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/panStr', panStr ? panStr.toString() : '']);
    // Mute / Solo (master track lacks these)
    if (!strip.isMain) {
        outlet(consts_1.OUTLET_OSC, [
            '/mixer/' + n + '/mute',
            parseInt(strip.trackApi.get('mute').toString()),
        ]);
        outlet(consts_1.OUTLET_OSC, [
            '/mixer/' + n + '/solo',
            parseInt(strip.trackApi.get('solo').toString()),
        ]);
    }
    else {
        outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/mute', 0]);
        outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/solo', 0]);
    }
    // Arm / Input
    if (strip.canBeArmed) {
        outlet(consts_1.OUTLET_OSC, [
            '/mixer/' + n + '/recordArm',
            parseInt(strip.trackApi.get('arm').toString()),
        ]);
        var inputStatus = (0, toggleInput_1.getTrackInputStatus)(strip.trackApi);
        outlet(consts_1.OUTLET_OSC, [
            '/mixer/' + n + '/inputEnabled',
            inputStatus && inputStatus.inputEnabled ? 1 : 0,
        ]);
    }
    else {
        outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/recordArm', 0]);
        outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/inputEnabled', 0]);
    }
    // Has output
    outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/hasOutput', strip.hasOutput ? 1 : 0]);
    // Crossfade assign (master track lacks this)
    if (!strip.isMain) {
        outlet(consts_1.OUTLET_OSC, [
            '/mixer/' + n + '/xFadeAssign',
            parseInt(strip.mixerApi.get('crossfade_assign').toString()),
        ]);
    }
    else {
        outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/xFadeAssign', 0]);
    }
    // Sends
    for (var i = 0; i < strip.sendApis.length; i++) {
        var sendVal = strip.sendApis[i].get('value');
        outlet(consts_1.OUTLET_OSC, [
            '/mixer/' + n + '/send' + (i + 1),
            parseFloat(sendVal.toString()) || 0,
        ]);
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
    // Send full initial state for all visible strips
    for (var i = 0; i < windowSlots.length; i++) {
        var tid = windowSlots[i];
        if (observersByTrackId[tid]) {
            sendStripState(leftIndex + i, observersByTrackId[tid]);
        }
    }
}
// ---------------------------------------------------------------------------
// Refresh — called on /btnRefresh to invalidate stale observers
// ---------------------------------------------------------------------------
function mixerRefresh() {
    teardownAll();
    setupWindow(0, DEFAULT_VISIBLE_COUNT);
}
// ---------------------------------------------------------------------------
// Incoming: mixerView
// ---------------------------------------------------------------------------
function setupWindow(left, count) {
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
    // Send numSends (= number of return tracks, same for all channels)
    var numSendsApi = new LiveAPI(consts_1.noFn, 'live_set');
    var numSends = Math.min((0, utils_1.cleanArr)(numSendsApi.get('return_tracks')).length, MAX_SENDS);
    outlet(consts_1.OUTLET_OSC, ['/mixer/numSends', numSends]);
    trackList = buildTrackList();
    sendVisibleTracks();
    applyWindow();
}
function mixerView() {
    var aargs = arrayfromargs(arguments);
    var parsed = JSON.parse(aargs[0].toString());
    var left = parseInt(parsed[0].toString());
    var count = parseInt(parsed[1].toString());
    if (count === 0) {
        // Tear down all
        teardownAll();
        leftIndex = -1;
        visibleCount = 0;
        return;
    }
    setupWindow(left, count);
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
    pauseUnpause(strip, 'vol');
    strip.volApi.set('value', parseFloat(val.toString()));
}
function pan(stripIdx, val) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    pauseUnpause(strip, 'pan');
    strip.panApi.set('value', parseFloat(val.toString()));
}
function volDefault(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    strip.volApi.set('value', parseFloat(strip.volApi.get('default_value').toString()));
}
function panDefault(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    strip.panApi.set('value', parseFloat(strip.panApi.get('default_value').toString()));
}
// Send handlers — send1 through send12
function handleSend(stripIdx, sendNum, val) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var idx = sendNum - 1;
    if (idx < 0 || idx >= strip.sendApis.length)
        return;
    pauseUnpause(strip, 'send');
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
    outlet(consts_1.OUTLET_OSC, ['/mixer/' + strip.stripIndex + '/mute', newState]);
}
function toggleSolo(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var curr = parseInt(strip.trackApi.get('solo').toString());
    var newState = curr ? 0 : 1;
    if (newState) {
        var api = new LiveAPI(consts_1.noFn, 'live_set');
        if (parseInt(api.get('exclusive_solo').toString()) === 1) {
            var tracks = (0, utils_1.cleanArr)(api.get('tracks'));
            var returns = (0, utils_1.cleanArr)(api.get('return_tracks'));
            for (var _i = 0, _a = tracks.concat(returns); _i < _a.length; _i++) {
                var tid = _a[_i];
                if (tid === strip.trackId)
                    continue;
                api.id = tid;
                api.set('solo', 0);
            }
        }
    }
    strip.trackApi.set('solo', newState);
    outlet(consts_1.OUTLET_OSC, ['/mixer/' + strip.stripIndex + '/solo', newState]);
}
function enableRecord(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip || !strip.canBeArmed)
        return;
    (0, toggleInput_1.enableTrackInput)(strip.trackApi);
    strip.trackApi.set('arm', 1);
    var api = new LiveAPI(consts_1.noFn, 'live_set');
    if (parseInt(api.get('exclusive_arm').toString()) === 1) {
        var tracks = (0, utils_1.cleanArr)(api.get('tracks'));
        for (var _i = 0, tracks_1 = tracks; _i < tracks_1.length; _i++) {
            var tid = tracks_1[_i];
            if (tid === strip.trackId)
                continue;
            api.id = tid;
            if (parseInt(api.get('can_be_armed').toString())) {
                api.set('arm', 0);
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
    outlet(consts_1.OUTLET_OSC, ['/mixer/' + n + '/recordArm', armStatus ? 1 : 0]);
    outlet(consts_1.OUTLET_OSC, [
        '/mixer/' + n + '/inputEnabled',
        inputStatus && inputStatus.inputEnabled ? 1 : 0,
    ]);
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
    var args = arrayfromargs(arguments);
    var subCmd = messagename;
    var stripIdx = parseInt(args[0].toString());
    var val = args[1];
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
