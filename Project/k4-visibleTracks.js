"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.routes = void 0;
var utils_1 = require("./utils");
var k4_config_1 = require("./k4-config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
// Orchestrator context (set in init) — its notifyVisibleTracks() fans a
// track-list change out to the consumers (clip/mixer) + the notify outlet.
var ctx = null;
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var scratchApi = null;
var visibleTracksWatcher = null;
var returnTracksWatcher = null;
var trackList = [];
var colorObservers = [];
var colorDebounceTask = null;
function ensureApis() {
    if (!scratchApi)
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
}
// ---------------------------------------------------------------------------
// Track List Builder
// ---------------------------------------------------------------------------
function buildTrackList() {
    var ret = [];
    // visible tracks (respects group folding)
    scratchApi.path = 'live_set';
    var trackIds = (0, utils_1.cleanArr)(scratchApi.get('visible_tracks'));
    for (var _i = 0, trackIds_1 = trackIds; _i < trackIds_1.length; _i++) {
        var id = trackIds_1[_i];
        scratchApi.id = id;
        var isFoldable = parseInt(scratchApi.get('is_foldable').toString());
        var parentId = (0, utils_1.cleanArr)(scratchApi.get('group_track'))[0] || 0;
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
    var returnIds = (0, utils_1.cleanArr)(scratchApi.get('return_tracks'));
    for (var _a = 0, returnIds_1 = returnIds; _a < returnIds_1.length; _a++) {
        var id = returnIds_1[_a];
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
    var mainId = (0, utils_1.cleanArr)(scratchApi.get('master_track'))[0];
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
function sendVisibleTracks() {
    // Send to app via chunked OSC
    var items = trackList.map(function (t) {
        return [t.type, t.id, t.name, t.color, null, null, t.parentId];
    });
    (0, utils_1.osc)('/visibleTracks', items);
    // Write to shared dict, then notify mixer/clips
    (0, utils_1.setVisibleTracks)(trackList);
    ctx.notifyVisibleTracks();
}
// ---------------------------------------------------------------------------
// Color Observers
// ---------------------------------------------------------------------------
function teardownColorObservers() {
    for (var i = 0; i < colorObservers.length; i++) {
        colorObservers[i].property = '';
        colorObservers[i].id = 0;
    }
    colorObservers = [];
}
function createColorObservers() {
    teardownColorObservers();
    var _loop_1 = function (i) {
        var idx = i;
        var obs = new LiveAPI(function (args) {
            if (args[0] === 'color') {
                trackList[idx].color = (0, utils_1.colorToString)(args[1].toString());
                scheduleColorUpdate();
            }
        }, 'live_set');
        obs.id = trackList[i].id;
        obs.property = 'color';
        colorObservers.push(obs);
    };
    for (var i = 0; i < trackList.length; i++) {
        _loop_1(i);
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
function doRefresh() {
    ensureApis();
    trackList = buildTrackList();
    createColorObservers();
    sendVisibleTracks();
}
function init(c) {
    (0, utils_1.setOscSink)(c.osc);
    ctx = c;
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
exports.init = init;
var routes = [
    { prefix: '/requestVisibleTracks', parse: 'bare', fn: requestVisibleTracks },
];
exports.routes = routes;
log('reloaded k4-visibleTracks');
