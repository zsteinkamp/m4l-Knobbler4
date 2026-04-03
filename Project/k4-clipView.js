"use strict";
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
const utils_1 = require("./utils");
const config_1 = require("./config");
const consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 1;
const log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Messages from router');
setoutletassist(consts_1.OUTLET_OSC, 'OSC messages to [udpsend]');
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CLIP_EMPTY = 0;
const CLIP_STOPPED = 1;
const CLIP_PLAYING = 2;
const CLIP_TRIGGERED = 3;
const CLIP_RECORDING = 4;
const CLIP_ARMED = 5;
const OBSERVER_BUFFER = 2;
const VIEW_DEBOUNCE_MS = 250;
const UPDATE_FLUSH_MS = 50;
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let scratchApi = null;
let cellInitApi = null; // separate scratchpad for createCellObservers (avoids re-entrancy)
let viewApi = null;
// Track IDs in display order (visible_tracks, no return/master)
let trackIds = [];
let trackPaths = [];
let trackIsGroup = [];
// Visible window (track and scene ranges)
let leftTrack = -1;
let topScene = -1;
let rightTrack = -1; // exclusive
let bottomScene = -1; // exclusive
let totalScenes = 0;
let settingUp = false; // guard against watcher callbacks during setupWindow
// Observer management
let cellObservers = {}; // key: "col,row"
let trackPlayObservers = {}; // key: trackIdx
let sceneObservers = {}; // key: sceneIndex
let sceneCache = []; // cached scene name/color for all scenes
// Debounce
let viewTask = null;
let sceneInfoTask = null;
// Lazy observer creation
let pendingObserverKeys = [];
let observerBatchTask = null;
const OBSERVER_BATCH_SIZE = 10;
// Update batching
let pendingUpdates = [];
let updateFlushTask = null;
// Watchers
let sceneCountWatcher = null;
let selectedSceneApi = null;
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
    const tObs = trackPlayObservers[trackIdx];
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
    const d = new Dict('visibleTracksDict');
    const raw = d.get('tracks');
    const tracks = JSON.parse(raw.toString());
    trackIds = [];
    trackPaths = [];
    trackIsGroup = [];
    for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
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
    const sceneIds = (0, utils_1.cleanArr)(scratchApi.get('scenes'));
    return sceneIds.length;
}
function onSceneCountChange(args) {
    if (args[0] !== 'scenes')
        return;
    if (leftTrack < 0 || settingUp)
        return;
    ensureApis();
    const newCount = querySceneCount();
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
    const path = selectedSceneApi.unquotedpath;
    const match = path.match(/scenes (\d+)/);
    const idx = match ? parseInt(match[1]) : -1;
    (0, utils_1.osc)('/clips/selectedScene', idx);
}
// ---------------------------------------------------------------------------
// Track Play Observers (playing_slot_index + fired_slot_index per track)
// ---------------------------------------------------------------------------
function createTrackPlayObservers(trackIdx) {
    const trackPath = trackPaths[trackIdx];
    const tObs = {
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
    const canBeArmed = !!parseInt(cellInitApi.get('can_be_armed').toString());
    if (canBeArmed) {
        tObs.armed = !!parseInt(cellInitApi.get('arm').toString());
    }
    // Observer: playing_slot_index
    tObs.playingSlotApi = new LiveAPI(function (args) {
        if (!tObs.playingSlotApi)
            return;
        if (args[0] !== 'playing_slot_index')
            return;
        const newSlot = parseInt(args[1]);
        const oldSlot = tObs.playingSlot;
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
        const newSlot = parseInt(args[1]);
        const oldSlot = tObs.firedSlot;
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
            const newArmed = !!parseInt(args[1]);
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
    for (const key in trackPlayObservers) {
        teardownTrackPlayObservers(trackPlayObservers[key]);
    }
    trackPlayObservers = {};
}
// Called when arm changes — update all cells on this track in the observer window
function updateAllCellsOnTrack(trackIdx) {
    const obsTop = Math.max(0, topScene - OBSERVER_BUFFER);
    const obsBottom = Math.min(totalScenes, bottomScene + OBSERVER_BUFFER);
    for (let row = obsTop; row < obsBottom; row++) {
        updateCellFromTrack(trackIdx, row);
    }
}
// Called when playing_slot_index or fired_slot_index changes on a track
function updateCellFromTrack(trackIdx, sceneIdx) {
    const key = cellKey(trackIdx, sceneIdx);
    const obs = cellObservers[key];
    if (!obs)
        return;
    const newState = deriveCellState(obs.hasClip, trackIdx, sceneIdx);
    const oldState = obs.cell.state;
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
    const slotPath = trackPaths[col] + ' clip_slots ' + row;
    const cell = { state: CLIP_EMPTY, name: '', color: '', ps: 0, hc: 0, hsb: 0 };
    const obs = {
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
    const hasClip = !!parseInt(cellInitApi.get('has_clip').toString());
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
    const slotPath = trackPaths[obs.trackIdx] + ' clip_slots ' + obs.sceneIdx;
    // has_stop_button
    obs.hasStopButtonApi = new LiveAPI(function (args) {
        if (!obs.hasStopButtonApi)
            return;
        if (args[0] !== 'has_stop_button')
            return;
        const newHsb = parseInt(args[1]) ? 1 : 0;
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
            const newPs = parseInt(args[1]) || 0;
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
            const newHc = parseInt(args[1]) ? 1 : 0;
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
        const newHasClip = !!parseInt(args[1]);
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
        const newState = deriveCellState(newHasClip, obs.trackIdx, obs.sceneIdx);
        const oldState = obs.cell.state;
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
    const slotPath = trackPaths[obs.trackIdx] + ' clip_slots ' + obs.sceneIdx;
    const clipPath = slotPath + ' clip';
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
            const recording = !!parseInt(args[1]);
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
    let count = 0;
    while (pendingObserverKeys.length > 0 && count < OBSERVER_BATCH_SIZE) {
        const key = pendingObserverKeys.shift();
        const obs = cellObservers[key];
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
    const entry = { t: obs.trackIdx, sc: obs.sceneIdx, s: obs.cell.state };
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
    const scenePath = 'live_set scenes ' + sceneIdx;
    cellInitApi.path = scenePath;
    const name = (0, utils_1.dequote)(cellInitApi.get('name').toString());
    const color = colorHex(cellInitApi.get('color'));
    const info = {
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
    for (const key in cellObservers) {
        teardownCellObservers(cellObservers[key]);
    }
    cellObservers = {};
}
function teardownAllScenes() {
    for (const key in sceneObservers) {
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
    const obsLeft = Math.max(0, leftTrack - OBSERVER_BUFFER);
    const obsRight = Math.min(trackIds.length, rightTrack + OBSERVER_BUFFER);
    const obsTop = Math.max(0, topScene - OBSERVER_BUFFER);
    const obsBottom = Math.min(totalScenes, bottomScene + OBSERVER_BUFFER);
    // --- Track play observers (one per track in observer window) ---
    const newTrackSet = {};
    for (let col = obsLeft; col < obsRight; col++) {
        newTrackSet[col] = true;
    }
    // Remove old
    for (const key in trackPlayObservers) {
        const idx = parseInt(key);
        if (!newTrackSet[idx]) {
            teardownTrackPlayObservers(trackPlayObservers[idx]);
            delete trackPlayObservers[idx];
        }
    }
    // Add new — create BEFORE cell observers so deriveCellState can use them
    for (let col = obsLeft; col < obsRight; col++) {
        if (!trackPlayObservers[col]) {
            trackPlayObservers[col] = createTrackPlayObservers(col);
        }
    }
    // --- Scene observers (visible window + buffer only) ---
    const newSceneSet = {};
    for (let s = obsTop; s < obsBottom; s++) {
        newSceneSet[s] = true;
    }
    // Remove old
    for (const key in sceneObservers) {
        const idx = parseInt(key);
        if (!newSceneSet[idx]) {
            teardownSceneObserver(sceneObservers[idx]);
            delete sceneObservers[idx];
        }
    }
    // Add new
    for (let s = obsTop; s < obsBottom; s++) {
        if (!sceneObservers[s]) {
            sceneObservers[s] = createSceneObserver(s);
        }
    }
    // --- Cell state + observers ---
    // Cancel any pending observer batch from a previous window
    if (observerBatchTask)
        observerBatchTask.cancel();
    pendingObserverKeys = [];
    const newCellSet = {};
    for (let col = obsLeft; col < obsRight; col++) {
        for (let row = obsTop; row < obsBottom; row++) {
            newCellSet[cellKey(col, row)] = true;
        }
    }
    // Remove old
    for (const key in cellObservers) {
        if (!newCellSet[key]) {
            teardownCellObservers(cellObservers[key]);
            delete cellObservers[key];
        }
    }
    // Read initial state for new cells (fast — no LiveAPI objects created)
    for (let col = obsLeft; col < obsRight; col++) {
        for (let row = obsTop; row < obsBottom; row++) {
            const key = cellKey(col, row);
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
    const visBottom = Math.min(bottomScene, totalScenes);
    const rows = [];
    for (let row = topScene; row < visBottom; row++) {
        const rowData = [];
        for (let col = leftTrack; col < rightTrack; col++) {
            const key = cellKey(col, row);
            const obs = cellObservers[key];
            if (obs) {
                const entry = { s: obs.cell.state };
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
    const tracks = [];
    for (let col = leftTrack; col < rightTrack; col++) {
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
    for (let row = 0; row < totalScenes; row++) {
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
    const scenes = [];
    for (let row = 0; row < totalScenes; row++) {
        // Use observer data if available, otherwise cached data
        const info = sceneObservers[row];
        const name = info ? info.name : sceneCache[row].n;
        const color = info ? info.color : sceneCache[row].c;
        const scene = { n: name };
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
    const parsed = JSON.parse(jsonStr.toString());
    const left = parseInt(parsed[0].toString());
    const top = parseInt(parsed[1].toString());
    const right = parseInt(parsed[2].toString());
    const bottom = parseInt(parsed[3].toString());
    if (left === right || top === bottom) {
        // Zero-size window — don't teardown observers so actions still work
        // when the user returns to the clips page
        if (viewTask) {
            viewTask.cancel();
            viewTask.freepeer();
            viewTask = null;
        }
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
    const parsed = JSON.parse(jsonStr.toString());
    const trackIdx = parseInt(parsed[0].toString());
    const sceneIdx = parseInt(parsed[1].toString());
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    scratchApi.call('fire');
    selectClipSlot(trackIdx, sceneIdx);
}
function clipRecord(jsonStr) {
    ensureApis();
    const parsed = JSON.parse(jsonStr.toString());
    const trackIdx = parseInt(parsed[0].toString());
    const sceneIdx = parseInt(parsed[1].toString());
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    scratchApi.call('fire');
    selectClipSlot(trackIdx, sceneIdx);
}
function clipDelete(jsonStr) {
    ensureApis();
    const parsed = JSON.parse(jsonStr.toString());
    const trackIdx = parseInt(parsed[0].toString());
    const sceneIdx = parseInt(parsed[1].toString());
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    scratchApi.call('delete_clip');
}
function clipSetStopButton(jsonStr) {
    ensureApis();
    const parsed = JSON.parse(jsonStr.toString());
    const trackIdx = parseInt(parsed[0].toString());
    const sceneIdx = parseInt(parsed[1].toString());
    const val = parseInt(parsed[2].toString());
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx;
    scratchApi.set('has_stop_button', val ? 1 : 0);
}
function clipStop(trackIdx) {
    ensureApis();
    const idx = parseInt(trackIdx.toString());
    if (idx < 0 || idx >= trackPaths.length)
        return;
    scratchApi.path = trackPaths[idx];
    scratchApi.call('stop_all_clips');
}
function stopAll() {
    ensureApis();
    scratchApi.path = 'live_set';
    scratchApi.call('stop_all_clips');
}
function sceneLaunch(sceneIdx) {
    ensureApis();
    const idx = parseInt(sceneIdx.toString());
    if (idx < 0 || idx >= totalScenes)
        return;
    scratchApi.path = 'live_set scenes ' + idx;
    scratchApi.call('fire');
}
function sceneRename(jsonStr) {
    ensureApis();
    const parsed = JSON.parse(jsonStr.toString());
    const idx = parseInt(parsed[0].toString());
    const name = parsed[1].toString();
    if (idx < 0 || idx >= totalScenes)
        return;
    scratchApi.path = 'live_set scenes ' + idx;
    scratchApi.set('name', name);
}
function clipColor(jsonStr) {
    ensureApis();
    const parsed = JSON.parse(jsonStr.toString());
    const trackIdx = parseInt(parsed[0].toString());
    const sceneIdx = parseInt(parsed[1].toString());
    const hexStr = parsed[2].toString();
    if (trackIdx < 0 || trackIdx >= trackPaths.length)
        return;
    if (sceneIdx < 0 || sceneIdx >= totalScenes)
        return;
    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx + ' clip';
    scratchApi.set('color', parseInt(hexStr, 16));
}
function sceneColor(jsonStr) {
    ensureApis();
    const parsed = JSON.parse(jsonStr.toString());
    const idx = parseInt(parsed[0].toString());
    const hexStr = parsed[1].toString();
    if (idx < 0 || idx >= totalScenes)
        return;
    scratchApi.path = 'live_set scenes ' + idx;
    scratchApi.set('color', parseInt(hexStr, 16));
}
function clipsUpdate(jsonStr) {
    ensureApis();
    let updates = JSON.parse(jsonStr.toString());
    if (!Array.isArray(updates))
        updates = [updates];
    for (let i = 0; i < updates.length; i++) {
        const u = updates[i];
        const trackIdx = parseInt(u.t.toString());
        const sceneIdx = parseInt(u.sc.toString());
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
    scratchApi.call('capture_and_insert_scene');
}
log('reloaded k4-clipView');
module.exports = {};
