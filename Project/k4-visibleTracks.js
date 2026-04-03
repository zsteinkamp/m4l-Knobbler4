"use strict";
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
const utils_1 = require("./utils");
const config_1 = require("./config");
const consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 2;
const OUTLET_OSC = 0;
const OUTLET_TRACK_DATA = 1;
const log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Messages');
setoutletassist(OUTLET_OSC, 'OSC messages to [udpsend]');
setoutletassist(OUTLET_TRACK_DATA, 'Track data to mixer/clips');
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let scratchApi = null;
let visibleTracksWatcher = null;
let returnTracksWatcher = null;
let trackList = [];
let colorObservers = [];
let colorDebounceTask = null;
function ensureApis() {
    if (!scratchApi)
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
}
// ---------------------------------------------------------------------------
// Track List Builder
// ---------------------------------------------------------------------------
function buildTrackList() {
    const ret = [];
    // visible tracks (respects group folding)
    scratchApi.path = 'live_set';
    const trackIds = (0, utils_1.cleanArr)(scratchApi.get('visible_tracks'));
    for (const id of trackIds) {
        scratchApi.id = id;
        const isFoldable = parseInt(scratchApi.get('is_foldable').toString());
        const parentId = (0, utils_1.cleanArr)(scratchApi.get('group_track'))[0] || 0;
        ret.push({
            id: id,
            type: isFoldable ? consts_1.TYPE_GROUP : consts_1.TYPE_TRACK,
            name: (0, utils_1.truncate)(scratchApi.get('name').toString(), consts_1.MAX_NAME_LEN),
            color: (0, utils_1.colorToString)(scratchApi.get('color').toString()),
            path: scratchApi.unquotedpath,
            parentId: parentId,
        });
    }
    // return tracks
    scratchApi.path = 'live_set';
    const returnIds = (0, utils_1.cleanArr)(scratchApi.get('return_tracks'));
    for (const id of returnIds) {
        scratchApi.id = id;
        ret.push({
            id: id,
            type: consts_1.TYPE_RETURN,
            name: (0, utils_1.truncate)(scratchApi.get('name').toString(), consts_1.MAX_NAME_LEN),
            color: (0, utils_1.colorToString)(scratchApi.get('color').toString()),
            path: scratchApi.unquotedpath,
            parentId: 0,
        });
    }
    // master track
    scratchApi.path = 'live_set';
    const mainId = (0, utils_1.cleanArr)(scratchApi.get('master_track'))[0];
    scratchApi.id = mainId;
    ret.push({
        id: mainId,
        type: consts_1.TYPE_MAIN,
        name: (0, utils_1.truncate)(scratchApi.get('name').toString(), consts_1.MAX_NAME_LEN),
        color: (0, utils_1.colorToString)(scratchApi.get('color').toString()),
        path: scratchApi.unquotedpath,
        parentId: 0,
    });
    return ret;
}
// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------
const TRACK_DICT_NAME = 'visibleTracksDict';
function sendVisibleTracks() {
    // Send to app via chunked OSC
    const items = trackList.map(function (t) {
        return [t.type, t.id, t.name, t.color, null, null, t.parentId];
    });
    (0, utils_1.sendChunkedData)('/visibleTracks', items);
    // Write to shared dict, then notify mixer/clips
    const d = new Dict(TRACK_DICT_NAME);
    d.set('tracks', JSON.stringify(trackList));
    outlet(OUTLET_TRACK_DATA, 'visibleTracks');
}
// ---------------------------------------------------------------------------
// Color Observers
// ---------------------------------------------------------------------------
function teardownColorObservers() {
    for (let i = 0; i < colorObservers.length; i++) {
        colorObservers[i].property = '';
        colorObservers[i].id = 0;
    }
    colorObservers = [];
}
function createColorObservers() {
    teardownColorObservers();
    for (let i = 0; i < trackList.length; i++) {
        const idx = i;
        const obs = new LiveAPI(function (args) {
            if (args[0] === 'color') {
                trackList[idx].color = (0, utils_1.colorToString)(args[1].toString());
                scheduleColorUpdate();
            }
        }, 'live_set');
        obs.id = trackList[i].id;
        obs.property = 'color';
        colorObservers.push(obs);
    }
}
function scheduleColorUpdate() {
    if (!colorDebounceTask) {
        colorDebounceTask = new Task(function () {
            sendVisibleTracks();
        });
    }
    colorDebounceTask.cancel();
    colorDebounceTask.schedule(50);
}
// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------
function onVisibleTracksChange(args) {
    if (args[0] !== 'visible_tracks')
        return;
    ensureApis();
    trackList = buildTrackList();
    createColorObservers();
    sendVisibleTracks();
}
function onReturnTracksChange(args) {
    if (args[0] !== 'return_tracks')
        return;
    ensureApis();
    trackList = buildTrackList();
    createColorObservers();
    sendVisibleTracks();
}
// ---------------------------------------------------------------------------
// Incoming Messages
// ---------------------------------------------------------------------------
function requestVisibleTracks() {
    ensureApis();
    if (trackList.length === 0) {
        trackList = buildTrackList();
    }
    sendVisibleTracks();
}
function refresh() {
    ensureApis();
    trackList = buildTrackList();
    createColorObservers();
    sendVisibleTracks();
}
function init() {
    ensureApis();
    if (!visibleTracksWatcher) {
        visibleTracksWatcher = new LiveAPI(onVisibleTracksChange, 'live_set');
        visibleTracksWatcher.property = 'visible_tracks';
    }
    if (!returnTracksWatcher) {
        returnTracksWatcher = new LiveAPI(onReturnTracksChange, 'live_set');
        returnTracksWatcher.property = 'return_tracks';
    }
    trackList = buildTrackList();
    createColorObservers();
    sendVisibleTracks();
}
log('reloaded k4-visibleTracks');
module.exports = {};
