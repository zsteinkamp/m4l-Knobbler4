"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Messages from router');
setoutletassist(consts_1.OUTLET_OSC, 'OSC messages to [udpsend]');
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
var CLIP_EMPTY = 0;
var CLIP_STOPPED = 1;
var CLIP_PLAYING = 2;
var CLIP_TRIGGERED = 3;
var CLIP_RECORDING = 4;
var CLIP_ARMED = 5;
var OBSERVER_BUFFER = 2;
var VIEW_DEBOUNCE_MS = 250;
var UPDATE_FLUSH_MS = 50;
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var scratchApi = null;
var cellInitApi = null; // separate scratchpad for createCellObservers (avoids re-entrancy)
var viewApi = null;
// Track IDs in display order (visible_tracks, no return/master)
var trackIds = [];
var trackPaths = [];
var trackIsGroup = [];
// Visible window (track and scene ranges)
var leftTrack = -1;
var topScene = -1;
var rightTrack = -1; // exclusive
var bottomScene = -1; // exclusive
var totalScenes = 0;
var settingUp = false; // guard against watcher callbacks during setupWindow
// Observer management
var cellObservers = {}; // key: "col,row"
var trackPlayObservers = {}; // key: trackIdx
var sceneObservers = {}; // key: sceneIndex
var sceneCache = []; // cached scene name/color for all scenes
// Debounce
var viewTask = null;
var sceneInfoTask = null;
// Lazy observer creation
var pendingObserverKeys = [];
var observerBatchTask = null;
var OBSERVER_BATCH_SIZE = 10;
// Update batching
var pendingUpdates = [];
var updateFlushTask = null;
// Watchers
var sceneCountWatcher = null;
var selectedSceneApi = null;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureApis() {
    if (!scratchApi)
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
    if (!cellInitApi)
        cellInitApi = new LiveAPI(consts_1.noFn, 'live_set');
    if (!viewApi)
        viewApi = new LiveAPI(consts_1.noFn, 'live_set view');
}
function selectClipSlot(trackIdx, sceneIdx) {
    viewApi.set('selected_track', ['id', trackIds[trackIdx]]);
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    viewApi.set('highlighted_clip_slot', ['id', parseInt(scratchApi.id.toString())]);
}
function cellKey(col, row) {
    return col + ',' + row;
}
function isVisible(col, row) {
    return (col >= leftTrack && col < rightTrack && row >= topScene && row < bottomScene);
}
function colorHex(raw) {
    return ('000000' + parseInt(raw.toString()).toString(16)).slice(-6);
}
// Derive cell state from has_clip + track-level playing/fired/arm info
function deriveCellState(hasClip, trackIdx, sceneIdx) {
    var tObs = trackPlayObservers[trackIdx];
    if (!hasClip) {
        return tObs && tObs.armed ? CLIP_ARMED : CLIP_EMPTY;
    }
    if (tObs) {
        if (tObs.firedSlot === sceneIdx)
            return CLIP_TRIGGERED;
        if (tObs.playingSlot === sceneIdx)
            return CLIP_PLAYING;
    }
    return CLIP_STOPPED;
}
// ---------------------------------------------------------------------------
// Track List
// ---------------------------------------------------------------------------
function visibleTracks() {
    var d = new Dict('visibleTracksDict');
    var raw = d.get('tracks');
    var tracks = JSON.parse(raw.toString());
    trackIds = [];
    trackPaths = [];
    trackIsGroup = [];
    for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        if (t.type === consts_1.TYPE_RETURN || t.type === consts_1.TYPE_MAIN)
            continue;
        trackIds.push(t.id);
        trackPaths.push(t.path);
        trackIsGroup.push(t.type === consts_1.TYPE_GROUP);
    }
    if (leftTrack < 0 || settingUp)
        return;
    teardownAllCells();
    teardownAllTrackPlay();
    applyWindow();
}
// ---------------------------------------------------------------------------
// Scene Count
// ---------------------------------------------------------------------------
function querySceneCount() {
    scratchApi.path = 'live_set';
    var sceneIds = (0, utils_1.cleanArr)(scratchApi.get('scenes'));
    return sceneIds.length;
}
function onSceneCountChange(args) {
    if (args[0] !== 'scenes')
        return;
    if (leftTrack < 0 || settingUp)
        return;
    ensureApis();
    var newCount = querySceneCount();
    if (newCount !== totalScenes) {
        totalScenes = newCount;
        sceneCache = []; // invalidate cache
        teardownAllCells();
        teardownAllScenes();
        applyWindow();
    }
}
// ---------------------------------------------------------------------------
// Selected Scene
// ---------------------------------------------------------------------------
function onSelectedSceneChange() {
    if (!selectedSceneApi || leftTrack < 0)
        return;
    sendSelectedScene();
}
function sendSelectedScene() {
    if (!selectedSceneApi)
        return;
    var path = selectedSceneApi.unquotedpath;
    var match = path.match(/scenes (\d+)/);
    var idx = match ? parseInt(match[1]) : -1;
    (0, utils_1.osc)('/clips/selectedScene', idx);
}
// ---------------------------------------------------------------------------
// Track Play Observers (playing_slot_index + fired_slot_index per track)
// ---------------------------------------------------------------------------
function createTrackPlayObservers(trackIdx) {
    var trackPath = trackPaths[trackIdx];
    var tObs = {
        trackIdx: trackIdx,
        playingSlotApi: null,
        firedSlotApi: null,
        armApi: null,
        nameApi: null,
        colorApi: null,
        playingSlot: -2,
        firedSlot: -2,
        armed: false,
    };
    // Read initial values
    cellInitApi.path = trackPath;
    tObs.playingSlot = parseInt(cellInitApi.get('playing_slot_index').toString());
    tObs.firedSlot = parseInt(cellInitApi.get('fired_slot_index').toString());
    var canBeArmed = !!parseInt(cellInitApi.get('can_be_armed').toString());
    if (canBeArmed) {
        tObs.armed = !!parseInt(cellInitApi.get('arm').toString());
    }
    // Observer: playing_slot_index
    tObs.playingSlotApi = new LiveAPI(function (args) {
        if (!tObs.playingSlotApi)
            return;
        if (args[0] !== 'playing_slot_index')
            return;
        var newSlot = parseInt(args[1]);
        var oldSlot = tObs.playingSlot;
        tObs.playingSlot = newSlot;
        // Update old slot (was playing, now stopped or empty)
        if (oldSlot >= 0)
            updateCellFromTrack(trackIdx, oldSlot);
        // Update new slot (now playing)
        if (newSlot >= 0)
            updateCellFromTrack(trackIdx, newSlot);
    }, trackPath);
    tObs.playingSlotApi.property = 'playing_slot_index';
    // Observer: fired_slot_index
    tObs.firedSlotApi = new LiveAPI(function (args) {
        if (!tObs.firedSlotApi)
            return;
        if (args[0] !== 'fired_slot_index')
            return;
        var newSlot = parseInt(args[1]);
        var oldSlot = tObs.firedSlot;
        tObs.firedSlot = newSlot;
        // Update old triggered slot (no longer triggered)
        if (oldSlot >= 0)
            updateCellFromTrack(trackIdx, oldSlot);
        // Update new triggered slot
        if (newSlot >= 0)
            updateCellFromTrack(trackIdx, newSlot);
    }, trackPath);
    tObs.firedSlotApi.property = 'fired_slot_index';
    // Observer: arm (only for tracks that can be armed)
    if (canBeArmed) {
        tObs.armApi = new LiveAPI(function (args) {
            if (!tObs.armApi)
                return;
            if (args[0] !== 'arm')
                return;
            var newArmed = !!parseInt(args[1]);
            if (newArmed === tObs.armed)
                return;
            tObs.armed = newArmed;
            // Update all empty cells on this track (armed state changes their display)
            updateAllCellsOnTrack(trackIdx);
        }, trackPath);
        tObs.armApi.property = 'arm';
    }
    // Observer: track name
    tObs.nameApi = new LiveAPI(function (args) {
        if (!tObs.nameApi)
            return;
        if (args[0] !== 'name')
            return;
        (0, utils_1.osc)('/clips/trackInfo', JSON.stringify({ t: tObs.trackIdx, n: (0, utils_1.dequote)(args[1]) }));
    }, trackPath);
    tObs.nameApi.property = 'name';
    // Observer: track color
    tObs.colorApi = new LiveAPI(function (args) {
        if (!tObs.colorApi)
            return;
        if (args[0] !== 'color')
            return;
        (0, utils_1.osc)('/clips/trackInfo', JSON.stringify({ t: tObs.trackIdx, c: colorHex(args[1]) }));
    }, trackPath);
    tObs.colorApi.property = 'color';
    return tObs;
}
function teardownTrackPlayObservers(tObs) {
    if (tObs.playingSlotApi) {
        (0, utils_1.detach)(tObs.playingSlotApi);
        tObs.playingSlotApi = null;
    }
    if (tObs.firedSlotApi) {
        (0, utils_1.detach)(tObs.firedSlotApi);
        tObs.firedSlotApi = null;
    }
    if (tObs.armApi) {
        (0, utils_1.detach)(tObs.armApi);
        tObs.armApi = null;
    }
    if (tObs.nameApi) {
        (0, utils_1.detach)(tObs.nameApi);
        tObs.nameApi = null;
    }
    if (tObs.colorApi) {
        (0, utils_1.detach)(tObs.colorApi);
        tObs.colorApi = null;
    }
}
function teardownAllTrackPlay() {
    for (var key in trackPlayObservers) {
        teardownTrackPlayObservers(trackPlayObservers[key]);
    }
    trackPlayObservers = {};
}
// Called when arm changes — update all cells on this track in the observer window
function updateAllCellsOnTrack(trackIdx) {
    var obsTop = Math.max(0, topScene - OBSERVER_BUFFER);
    var obsBottom = Math.min(totalScenes, bottomScene + OBSERVER_BUFFER);
    for (var row = obsTop; row < obsBottom; row++) {
        updateCellFromTrack(trackIdx, row);
    }
}
// Called when playing_slot_index or fired_slot_index changes on a track
function updateCellFromTrack(trackIdx, sceneIdx) {
    var key = cellKey(trackIdx, sceneIdx);
    var obs = cellObservers[key];
    if (!obs)
        return;
    var newState = deriveCellState(obs.hasClip, trackIdx, sceneIdx);
    var oldState = obs.cell.state;
    obs.cell.state = newState;
    if (newState !== oldState && isVisible(trackIdx, sceneIdx)) {
        queueFullUpdate(obs);
    }
}
// ---------------------------------------------------------------------------
// Cell Observer Creation / Teardown
// ---------------------------------------------------------------------------
// Read initial cell state using reused scratchpad — no LiveAPI objects created
function readCellState(col, row) {
    var slotPath = trackPaths[col] + ' clip_slots ' + row;
    var cell = { state: CLIP_EMPTY, name: '', color: '', ps: 0, hc: 0, hsb: 0 };
    var obs = {
        trackIdx: col,
        sceneIdx: row,
        hasClip: false,
        hasClipApi: null,
        clipApi: null,
        clipColorApi: null,
        clipRecordingApi: null,
        hasStopButtonApi: null,
        playingStatusApi: null,
        controlsOtherClipsApi: null,
        cell: cell,
    };
    cellInitApi.path = slotPath;
    var hasClip = !!parseInt(cellInitApi.get('has_clip').toString());
    obs.hasClip = hasClip;
    cell.state = deriveCellState(hasClip, col, row);
    cell.hsb = parseInt(cellInitApi.get('has_stop_button').toString()) ? 1 : 0;
    if (hasClip) {
        cellInitApi.path = slotPath + ' clip';
        cell.name = (0, utils_1.dequote)(cellInitApi.get('name').toString());
        cell.color = colorHex(cellInitApi.get('color'));
        if (parseInt(cellInitApi.get('is_recording').toString())) {
            cell.state = CLIP_RECORDING;
        }
    }
    if (trackIsGroup[col]) {
        cellInitApi.path = slotPath;
        cell.ps = parseInt(cellInitApi.get('playing_status').toString()) || 0;
        cell.hc = parseInt(cellInitApi.get('controls_other_clips').toString()) ? 1 : 0;
    }
    return obs;
}
// Attach LiveAPI observers to a cell (expensive — called lazily in batches)
function attachCellObservers(obs) {
    if (obs.hasClipApi)
        return; // already attached
    var slotPath = trackPaths[obs.trackIdx] + ' clip_slots ' + obs.sceneIdx;
    // has_stop_button
    obs.hasStopButtonApi = new LiveAPI(function (args) {
        if (!obs.hasStopButtonApi)
            return;
        if (args[0] !== 'has_stop_button')
            return;
        var newHsb = parseInt(args[1]) ? 1 : 0;
        if (newHsb === obs.cell.hsb)
            return;
        obs.cell.hsb = newHsb;
        if (isVisible(obs.trackIdx, obs.sceneIdx)) {
            queueFullUpdate(obs);
        }
    }, slotPath);
    obs.hasStopButtonApi.property = 'has_stop_button';
    // Group track: playing_status and controls_other_clips
    if (trackIsGroup[obs.trackIdx]) {
        obs.playingStatusApi = new LiveAPI(function (args) {
            if (!obs.playingStatusApi)
                return;
            if (args[0] !== 'playing_status')
                return;
            var newPs = parseInt(args[1]) || 0;
            if (newPs === obs.cell.ps)
                return;
            obs.cell.ps = newPs;
            if (isVisible(obs.trackIdx, obs.sceneIdx)) {
                queueFullUpdate(obs);
            }
        }, slotPath);
        obs.playingStatusApi.property = 'playing_status';
        obs.controlsOtherClipsApi = new LiveAPI(function (args) {
            if (!obs.controlsOtherClipsApi)
                return;
            if (args[0] !== 'controls_other_clips')
                return;
            var newHc = parseInt(args[1]) ? 1 : 0;
            if (newHc === obs.cell.hc)
                return;
            obs.cell.hc = newHc;
            if (isVisible(obs.trackIdx, obs.sceneIdx)) {
                queueFullUpdate(obs);
            }
        }, slotPath);
        obs.controlsOtherClipsApi.property = 'controls_other_clips';
    }
    // has_clip
    obs.hasClipApi = new LiveAPI(function (args) {
        if (!obs.hasClipApi)
            return;
        if (args[0] !== 'has_clip')
            return;
        var newHasClip = !!parseInt(args[1]);
        if (newHasClip === obs.hasClip)
            return;
        obs.hasClip = newHasClip;
        if (newHasClip) {
            setupClipObserver(obs);
        }
        else {
            teardownClipObserver(obs);
            obs.cell.name = '';
            obs.cell.color = '';
        }
        var newState = deriveCellState(newHasClip, obs.trackIdx, obs.sceneIdx);
        var oldState = obs.cell.state;
        obs.cell.state = newState;
        if (newState !== oldState && isVisible(obs.trackIdx, obs.sceneIdx)) {
            queueFullUpdate(obs);
        }
    }, slotPath);
    obs.hasClipApi.property = 'has_clip';
    // Clip observers (only if has_clip)
    if (obs.hasClip) {
        setupClipObserver(obs);
    }
}
function teardownCellObservers(obs) {
    if (obs.hasClipApi) {
        (0, utils_1.detach)(obs.hasClipApi);
        obs.hasClipApi = null;
    }
    if (obs.hasStopButtonApi) {
        (0, utils_1.detach)(obs.hasStopButtonApi);
        obs.hasStopButtonApi = null;
    }
    if (obs.playingStatusApi) {
        (0, utils_1.detach)(obs.playingStatusApi);
        obs.playingStatusApi = null;
    }
    if (obs.controlsOtherClipsApi) {
        (0, utils_1.detach)(obs.controlsOtherClipsApi);
        obs.controlsOtherClipsApi = null;
    }
    teardownClipObserver(obs);
}
function setupClipObserver(obs) {
    var slotPath = trackPaths[obs.trackIdx] + ' clip_slots ' + obs.sceneIdx;
    var clipPath = slotPath + ' clip';
    // Read clip info via cellInitApi (not scratchApi — this can be called from observer callbacks)
    cellInitApi.path = clipPath;
    obs.cell.name = (0, utils_1.dequote)(cellInitApi.get('name').toString());
    obs.cell.color = colorHex(cellInitApi.get('color'));
    if (parseInt(cellInitApi.get('is_recording').toString())) {
        obs.cell.state = CLIP_RECORDING;
    }
    if (!obs.clipApi) {
        obs.clipApi = new LiveAPI(function (args) {
            if (!obs.clipApi)
                return;
            if (args[0] !== 'name')
                return;
            obs.cell.name = (0, utils_1.dequote)(args[1]);
            if (isVisible(obs.trackIdx, obs.sceneIdx)) {
                queueFullUpdate(obs);
            }
        }, clipPath);
        obs.clipApi.property = 'name';
    }
    else {
        obs.clipApi.path = clipPath;
        obs.clipApi.property = 'name';
    }
    if (!obs.clipRecordingApi) {
        obs.clipRecordingApi = new LiveAPI(function (args) {
            if (!obs.clipRecordingApi)
                return;
            if (args[0] !== 'is_recording')
                return;
            var recording = !!parseInt(args[1]);
            if (recording) {
                obs.cell.state = CLIP_RECORDING;
            }
            else {
                obs.cell.state = deriveCellState(obs.hasClip, obs.trackIdx, obs.sceneIdx);
            }
            if (isVisible(obs.trackIdx, obs.sceneIdx)) {
                queueFullUpdate(obs);
            }
        }, clipPath);
        obs.clipRecordingApi.property = 'is_recording';
    }
    else {
        obs.clipRecordingApi.path = clipPath;
        obs.clipRecordingApi.property = 'is_recording';
    }
    if (!obs.clipColorApi) {
        obs.clipColorApi = new LiveAPI(function (args) {
            if (!obs.clipColorApi)
                return;
            if (args[0] !== 'color')
                return;
            obs.cell.color = colorHex(args[1]);
            if (isVisible(obs.trackIdx, obs.sceneIdx)) {
                queueFullUpdate(obs);
            }
        }, clipPath);
        obs.clipColorApi.property = 'color';
    }
    else {
        obs.clipColorApi.path = clipPath;
        obs.clipColorApi.property = 'color';
    }
}
function teardownClipObserver(obs) {
    if (obs.clipApi) {
        (0, utils_1.detach)(obs.clipApi);
        obs.clipApi = null;
    }
    if (obs.clipColorApi) {
        (0, utils_1.detach)(obs.clipColorApi);
        obs.clipColorApi = null;
    }
    if (obs.clipRecordingApi) {
        (0, utils_1.detach)(obs.clipRecordingApi);
        obs.clipRecordingApi = null;
    }
}
// ---------------------------------------------------------------------------
// Lazy observer creation (batched)
// ---------------------------------------------------------------------------
function scheduleObserverBatch() {
    if (!observerBatchTask) {
        observerBatchTask = new Task(processObserverBatch);
    }
    observerBatchTask.schedule(0);
}
function processObserverBatch() {
    var count = 0;
    while (pendingObserverKeys.length > 0 && count < OBSERVER_BATCH_SIZE) {
        var key = pendingObserverKeys.shift();
        var obs = cellObservers[key];
        if (obs) {
            attachCellObservers(obs);
        }
        count++;
    }
    if (pendingObserverKeys.length > 0) {
        scheduleObserverBatch();
    }
}
// ---------------------------------------------------------------------------
// State update & batching
// ---------------------------------------------------------------------------
function queueFullUpdate(obs) {
    var entry = { t: obs.trackIdx, sc: obs.sceneIdx, s: obs.cell.state };
    if (obs.cell.name)
        entry.n = obs.cell.name;
    if (obs.cell.color)
        entry.c = obs.cell.color;
    entry.hsb = obs.cell.hsb;
    if (trackIsGroup[obs.trackIdx]) {
        entry.ps = obs.cell.ps;
        entry.hc = obs.cell.hc;
    }
    pendingUpdates.push(entry);
    scheduleFlush();
}
function scheduleFlush() {
    if (!updateFlushTask) {
        updateFlushTask = new Task(flushUpdates);
    }
    updateFlushTask.cancel();
    updateFlushTask.schedule(UPDATE_FLUSH_MS);
}
function flushUpdates() {
    if (pendingUpdates.length === 0)
        return;
    (0, utils_1.osc)('/clips/update', JSON.stringify(pendingUpdates));
    pendingUpdates = [];
}
// ---------------------------------------------------------------------------
// Scene Observer Creation / Teardown
// ---------------------------------------------------------------------------
function createSceneObserver(sceneIdx) {
    var scenePath = 'live_set scenes ' + sceneIdx;
    cellInitApi.path = scenePath;
    var name = (0, utils_1.dequote)(cellInitApi.get('name').toString());
    var color = colorHex(cellInitApi.get('color'));
    var info = {
        sceneIdx: sceneIdx,
        nameApi: null,
        colorApi: null,
        name: name,
        color: color,
    };
    info.nameApi = new LiveAPI(function (args) {
        if (!info.nameApi)
            return;
        if (args[0] !== 'name')
            return;
        info.name = (0, utils_1.dequote)(args[1]);
        scheduleSceneInfo();
    }, scenePath);
    info.nameApi.property = 'name';
    info.colorApi = new LiveAPI(function (args) {
        if (!info.colorApi)
            return;
        if (args[0] !== 'color')
            return;
        info.color = colorHex(args[1]);
        scheduleSceneInfo();
    }, scenePath);
    info.colorApi.property = 'color';
    return info;
}
function teardownSceneObserver(info) {
    if (info.nameApi) {
        (0, utils_1.detach)(info.nameApi);
        info.nameApi = null;
    }
    if (info.colorApi) {
        (0, utils_1.detach)(info.colorApi);
        info.colorApi = null;
    }
}
// ---------------------------------------------------------------------------
// Teardown helpers
// ---------------------------------------------------------------------------
function teardownAllCells() {
    for (var key in cellObservers) {
        teardownCellObservers(cellObservers[key]);
    }
    cellObservers = {};
}
function teardownAllScenes() {
    for (var key in sceneObservers) {
        teardownSceneObserver(sceneObservers[parseInt(key)]);
    }
    sceneObservers = {};
}
function teardownAll() {
    if (observerBatchTask)
        observerBatchTask.cancel();
    pendingObserverKeys = [];
    teardownAllCells();
    teardownAllTrackPlay();
    teardownAllScenes();
    pendingUpdates = [];
    if (updateFlushTask) {
        updateFlushTask.cancel();
    }
}
// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------
function applyWindow() {
    if (leftTrack < 0 || topScene < 0)
        return;
    var obsLeft = Math.max(0, leftTrack - OBSERVER_BUFFER);
    var obsRight = Math.min(trackIds.length, rightTrack + OBSERVER_BUFFER);
    var obsTop = Math.max(0, topScene - OBSERVER_BUFFER);
    var obsBottom = Math.min(totalScenes, bottomScene + OBSERVER_BUFFER);
    // --- Track play observers (one per track in observer window) ---
    var newTrackSet = {};
    for (var col = obsLeft; col < obsRight; col++) {
        newTrackSet[col] = true;
    }
    // Remove old
    for (var key in trackPlayObservers) {
        var idx = parseInt(key);
        if (!newTrackSet[idx]) {
            teardownTrackPlayObservers(trackPlayObservers[idx]);
            delete trackPlayObservers[idx];
        }
    }
    // Add new — create BEFORE cell observers so deriveCellState can use them
    for (var col = obsLeft; col < obsRight; col++) {
        if (!trackPlayObservers[col]) {
            trackPlayObservers[col] = createTrackPlayObservers(col);
        }
    }
    // --- Scene observers (visible window + buffer only) ---
    var newSceneSet = {};
    for (var s = obsTop; s < obsBottom; s++) {
        newSceneSet[s] = true;
    }
    // Remove old
    for (var key in sceneObservers) {
        var idx = parseInt(key);
        if (!newSceneSet[idx]) {
            teardownSceneObserver(sceneObservers[idx]);
            delete sceneObservers[idx];
        }
    }
    // Add new
    for (var s = obsTop; s < obsBottom; s++) {
        if (!sceneObservers[s]) {
            sceneObservers[s] = createSceneObserver(s);
        }
    }
    // --- Cell state + observers ---
    // Cancel any pending observer batch from a previous window
    if (observerBatchTask)
        observerBatchTask.cancel();
    pendingObserverKeys = [];
    var newCellSet = {};
    for (var col = obsLeft; col < obsRight; col++) {
        for (var row = obsTop; row < obsBottom; row++) {
            newCellSet[cellKey(col, row)] = true;
        }
    }
    // Remove old
    for (var key in cellObservers) {
        if (!newCellSet[key]) {
            teardownCellObservers(cellObservers[key]);
            delete cellObservers[key];
        }
    }
    // Read initial state for new cells (fast — no LiveAPI objects created)
    for (var col = obsLeft; col < obsRight; col++) {
        for (var row = obsTop; row < obsBottom; row++) {
            var key = cellKey(col, row);
            if (!cellObservers[key]) {
                cellObservers[key] = readCellState(col, row);
                pendingObserverKeys.push(key);
            }
        }
    }
    // Send full grid, track info, and scene info for visible range
    sendFullGrid();
    sendTrackInfo();
    sendSceneInfo();
    sendSelectedScene();
    // Create observers lazily in batches (after grid is sent)
    if (pendingObserverKeys.length > 0) {
        scheduleObserverBatch();
    }
}
// ---------------------------------------------------------------------------
// Send State
// ---------------------------------------------------------------------------
function sendFullGrid() {
    if (leftTrack < 0 || topScene < 0)
        return;
    var visBottom = Math.min(bottomScene, totalScenes);
    var rows = [];
    for (var row = topScene; row < visBottom; row++) {
        var rowData = [];
        for (var col = leftTrack; col < rightTrack; col++) {
            var key = cellKey(col, row);
            var obs = cellObservers[key];
            if (obs) {
                var entry = { s: obs.cell.state };
                if (obs.cell.name)
                    entry.n = obs.cell.name;
                if (obs.cell.color)
                    entry.c = obs.cell.color;
                entry.hsb = obs.cell.hsb;
                if (trackIsGroup[col]) {
                    entry.ps = obs.cell.ps;
                    entry.hc = obs.cell.hc;
                }
                rowData.push(entry);
            }
            else {
                rowData.push({ s: CLIP_EMPTY });
            }
        }
        rows.push(rowData);
    }
    (0, utils_1.osc)('/clips/grid', JSON.stringify({ left: leftTrack, top: topScene, clips: rows }));
}
function sendTrackInfo() {
    if (leftTrack < 0)
        return;
    var tracks = [];
    for (var col = leftTrack; col < rightTrack; col++) {
        if (col < trackPaths.length) {
            cellInitApi.path = trackPaths[col];
            tracks.push({
                n: (0, utils_1.dequote)(cellInitApi.get('name').toString()),
                c: colorHex(cellInitApi.get('color')),
            });
        }
    }
    (0, utils_1.osc)('/clips/trackInfo', JSON.stringify({ left: leftTrack, tracks: tracks }));
}
function scheduleSceneInfo() {
    if (!sceneInfoTask) {
        sceneInfoTask = new Task(sendSceneInfo);
    }
    sceneInfoTask.cancel();
    sceneInfoTask.schedule(UPDATE_FLUSH_MS);
}
function buildSceneCache() {
    sceneCache = [];
    for (var row = 0; row < totalScenes; row++) {
        cellInitApi.path = 'live_set scenes ' + row;
        sceneCache.push({
            n: (0, utils_1.dequote)(cellInitApi.get('name').toString()),
            c: colorHex(cellInitApi.get('color')),
        });
    }
}
function sendSceneInfo() {
    if (totalScenes <= 0)
        return;
    // Build cache if stale
    if (sceneCache.length !== totalScenes) {
        buildSceneCache();
    }
    var scenes = [];
    for (var row = 0; row < totalScenes; row++) {
        // Use observer data if available, otherwise cached data
        var info = sceneObservers[row];
        var name = info ? info.name : sceneCache[row].n;
        var color = info ? info.color : sceneCache[row].c;
        var scene = { n: name };
        if (color && color !== '000000')
            scene.c = color;
        scenes.push(scene);
    }
    (0, utils_1.sendChunkedData)('/clips/scenes', scenes);
}
// ---------------------------------------------------------------------------
// Incoming: clipView
// ---------------------------------------------------------------------------
function setupWindow(left, top, right, bottom) {
    ensureApis();
    leftTrack = left;
    topScene = top;
    rightTrack = right;
    bottomScene = bottom;
    // Guard: prevent watcher callbacks from running teardown+applyWindow during setup
    settingUp = true;
    // Set up watchers on first activation
    if (!sceneCountWatcher) {
        sceneCountWatcher = new LiveAPI(onSceneCountChange, 'live_set');
        sceneCountWatcher.property = 'scenes';
    }
    if (!selectedSceneApi) {
        selectedSceneApi = new LiveAPI(onSelectedSceneChange, 'live_set view selected_scene');
        selectedSceneApi.mode = 1;
        selectedSceneApi.property = 'id';
    }
    settingUp = false;
    totalScenes = querySceneCount();
    applyWindow();
}
function refresh() {
    if (leftTrack < 0)
        return;
    setupWindow(leftTrack, topScene, rightTrack, bottomScene);
}
function requestClipsScenes() {
    sendSceneInfo();
}
function clipView(jsonStr) {
    var parsed = JSON.parse(jsonStr.toString());
    var left = parseInt(parsed[0].toString());
    var top = parseInt(parsed[1].toString());
    var right = parseInt(parsed[2].toString());
    var bottom = parseInt(parsed[3].toString());
    if (left === right || top === bottom) {
        // Zero-size window — teardown
        if (viewTask) {
            viewTask.cancel();
            viewTask.freepeer();
            viewTask = null;
        }
        teardownAll();
        if (selectedSceneApi) {
            (0, utils_1.detach)(selectedSceneApi);
            selectedSceneApi = null;
        }
        leftTrack = -1;
        topScene = -1;
        rightTrack = -1;
        bottomScene = -1;
        trackIds = [];
        trackPaths = [];
        return;
    }
    if (viewTask) {
        viewTask.cancel();
        viewTask.freepeer();
    }
    viewTask = new Task(function () {
        setupWindow(left, top, right, bottom);
    });
    viewTask.schedule(VIEW_DEBOUNCE_MS);
}
// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function clipLaunch(jsonStr) {
    ensureApis();
    var parsed = JSON.parse(jsonStr.toString());
    var trackIdx = parseInt(parsed[0].toString());
    var sceneIdx = parseInt(parsed[1].toString());
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    scratchApi.call('fire', null);
    selectClipSlot(trackIdx, sceneIdx);
}
function clipRecord(jsonStr) {
    ensureApis();
    var parsed = JSON.parse(jsonStr.toString());
    var trackIdx = parseInt(parsed[0].toString());
    var sceneIdx = parseInt(parsed[1].toString());
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    scratchApi.call('fire', null);
    selectClipSlot(trackIdx, sceneIdx);
}
function clipDelete(jsonStr) {
    ensureApis();
    var parsed = JSON.parse(jsonStr.toString());
    var trackIdx = parseInt(parsed[0].toString());
    var sceneIdx = parseInt(parsed[1].toString());
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    scratchApi.call('delete_clip', null);
}
function clipSetStopButton(jsonStr) {
    ensureApis();
    var parsed = JSON.parse(jsonStr.toString());
    var trackIdx = parseInt(parsed[0].toString());
    var sceneIdx = parseInt(parsed[1].toString());
    var val = parseInt(parsed[2].toString());
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    scratchApi.set('has_stop_button', val ? 1 : 0);
}
function clipStop(trackIdx) {
    ensureApis();
    var idx = parseInt(trackIdx.toString());
    if (idx < 0 || idx >= trackPaths.length)
        return;
    scratchApi.path = trackPaths[idx];
    scratchApi.call('stop_all_clips', null);
}
function stopAll() {
    ensureApis();
    scratchApi.path = 'live_set';
    scratchApi.call('stop_all_clips', null);
}
function sceneLaunch(sceneIdx) {
    ensureApis();
    var idx = parseInt(sceneIdx.toString());
    if (idx < 0 || idx >= totalScenes)
        return;
    scratchApi.path = 'live_set scenes ' + idx;
    scratchApi.call('fire', null);
}
function sceneRename(jsonStr) {
    ensureApis();
    var parsed = JSON.parse(jsonStr.toString());
    var idx = parseInt(parsed[0].toString());
    var name = parsed[1].toString();
    if (idx < 0 || idx >= totalScenes)
        return;
    scratchApi.path = 'live_set scenes ' + idx;
    scratchApi.set('name', name);
}
function clipColor(jsonStr) {
    ensureApis();
    var parsed = JSON.parse(jsonStr.toString());
    var trackIdx = parseInt(parsed[0].toString());
    var sceneIdx = parseInt(parsed[1].toString());
    var hexStr = parsed[2].toString();
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx + ' clip';
    scratchApi.set('color', parseInt(hexStr, 16));
}
function sceneColor(jsonStr) {
    ensureApis();
    var parsed = JSON.parse(jsonStr.toString());
    var idx = parseInt(parsed[0].toString());
    var hexStr = parsed[1].toString();
    if (idx < 0 || idx >= totalScenes)
        return;
    scratchApi.path = 'live_set scenes ' + idx;
    scratchApi.set('color', parseInt(hexStr, 16));
}
function clipsUpdate(jsonStr) {
    ensureApis();
    var updates = JSON.parse(jsonStr.toString());
    if (!Array.isArray(updates))
        updates = [updates];
    for (var i = 0; i < updates.length; i++) {
        var u = updates[i];
        var trackIdx = parseInt(u.t.toString());
        var sceneIdx = parseInt(u.sc.toString());
        if (trackIdx < 0 || trackIdx >= trackPaths.length)
            continue;
        if (sceneIdx < 0 || sceneIdx >= totalScenes)
            continue;
        scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx + ' clip';
        if (parseInt(scratchApi.id.toString()) <= 0)
            continue;
        if (u.n != null)
            scratchApi.set('name', u.n.toString());
    }
}
function captureScene() {
    ensureApis();
    scratchApi.path = 'live_set';
    scratchApi.call('capture_and_insert_scene', null);
}
log('reloaded k4-clipView');
// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
