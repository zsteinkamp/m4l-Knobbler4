"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 2;
var OUTLET_OSC = 0;
var OUTLET_TRACK_DATA = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Messages');
setoutletassist(OUTLET_OSC, 'OSC messages to [udpsend]');
setoutletassist(OUTLET_TRACK_DATA, 'Track data to mixer/clips');
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var scratchApi = null;
var visibleTracksWatcher = null;
var returnTracksWatcher = null;
var trackList = [];
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
var TRACK_DICT_NAME = 'visibleTracksDict';
function sendVisibleTracks() {
    // Send to app via chunked OSC
    var items = trackList.map(function (t) {
        return [t.type, t.id, t.name, t.color, null, null, t.parentId];
    });
    (0, utils_1.sendChunkedData)('/visibleTracks', items);
    // Write to shared dict, then notify mixer/clips
    var d = new Dict(TRACK_DICT_NAME);
    d.set('tracks', JSON.stringify(trackList));
    outlet(OUTLET_TRACK_DATA, 'visibleTracks');
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
function refresh() {
    ensureApis();
    trackList = buildTrackList();
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
    sendVisibleTracks();
}
log('reloaded k4-visibleTracks');
// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
