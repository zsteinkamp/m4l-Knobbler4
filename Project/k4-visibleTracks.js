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
// In Live a track must be SELECTED to rename or recolor it, so a single pair of
// path-following observers on the selected track catches every user edit — no
// need for per-track observers (which would also push N instances toward Live's
// observer ceiling in multiplayer). The visible_tracks / return_tracks watchers
// cover list membership and folding.
var selTrackNameApi = null;
var selTrackColorApi = null;
var trackUpdateDebounceTask = null;
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
// Selected-track name/color observers
// ---------------------------------------------------------------------------
function findTrack(id) {
    for (var i = 0; i < trackList.length; i++) {
        if (trackList[i].id === id)
            return trackList[i];
    }
    return null;
}
// Fires on name edits of the selected track AND on selection changes (the
// path-following observer re-resolves). The change guard makes a mere selection
// change a no-op; only a real rename re-sends.
function onSelTrackNameChange(args) {
    if (args[0] !== 'name')
        return;
    var t = findTrack(+selTrackNameApi.id);
    if (!t)
        return;
    var newName = (0, utils_1.truncate)((0, utils_1.dequote)(args[1].toString()), consts_1.MAX_NAME_LEN);
    if (t.name === newName)
        return;
    t.name = newName;
    scheduleTrackUpdate();
}
function onSelTrackColorChange(args) {
    if (args[0] !== 'color')
        return;
    var t = findTrack(+selTrackColorApi.id);
    if (!t)
        return;
    var newColor = (0, utils_1.colorToString)(args[1].toString());
    if (t.color === newColor)
        return;
    t.color = newColor;
    scheduleTrackUpdate();
}
function scheduleTrackUpdate() {
    if (!trackUpdateDebounceTask) {
        trackUpdateDebounceTask = new Task(function () {
            sendVisibleTracks();
        });
    }
    trackUpdateDebounceTask.cancel();
    trackUpdateDebounceTask.schedule(50);
}
// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------
function onVisibleTracksChange(args) {
    if (args[0] !== 'visible_tracks')
        return;
    ensureApis();
    trackList = buildTrackList();
    sendVisibleTracks();
}
function onReturnTracksChange(args) {
    if (args[0] !== 'return_tracks')
        return;
    ensureApis();
    trackList = buildTrackList();
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
    if (!selTrackNameApi) {
        selTrackNameApi = new LiveAPI(onSelTrackNameChange, 'live_set view selected_track');
        selTrackNameApi.mode = 1;
        selTrackNameApi.property = 'name';
    }
    if (!selTrackColorApi) {
        selTrackColorApi = new LiveAPI(onSelTrackColorChange, 'live_set view selected_track');
        selTrackColorApi.mode = 1;
        selTrackColorApi.property = 'color';
    }
    trackList = buildTrackList();
    sendVisibleTracks();
}
exports.init = init;
var routes = [
    { prefix: '/requestVisibleTracks', parse: 'bare', fn: requestVisibleTracks },
];
exports.routes = routes;
log('reloaded k4-visibleTracks');
