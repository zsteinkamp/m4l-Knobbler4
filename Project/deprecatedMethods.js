"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deprecatedDeviceDelta = exports.deprecatedTrackDelta = void 0;
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(config_1.default);
var liveSetApi = null;
function getApi() {
    if (!liveSetApi) {
        liveSetApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    return liveSetApi;
}
function deprecatedTrackDelta(delta) {
    //log('TRACK DELTA ' + delta)
    var setObj = getApi();
    var viewObj = new LiveAPI(function () { }, 'live_set view');
    var track = viewObj.get('selected_track');
    var trackObj = new LiveAPI(function () { }, track);
    var path = trackObj.unquotedpath.split(' ').slice(0, 3).join(' ');
    var isReturn = !!path.match(/ return_tracks /);
    var isMaster = !!path.match(/ master_track/);
    var tracks = setObj.get('tracks');
    var returnTracks = setObj.get('return_tracks');
    var numTracks = tracks.length / 2;
    var numReturnTracks = returnTracks.length / 2;
    //log('UQPATH=' + path)
    if (isMaster) {
        //log('ISMASTER')
        if (delta > 0) {
            //log('NONEXT')
            // no "next" from master, only "prev"
            return;
        }
        if (numReturnTracks) {
            //log('RETURN  live_set return_tracks ' + (numReturnTracks - 1))
            trackObj.goto('live_set return_tracks ' + (numReturnTracks - 1));
        }
        else {
            //log('RETURN live_set tracks ' + (numTracks - 1))
            trackObj.goto('live_set tracks ' + (numTracks - 1));
        }
    }
    else {
        // not master (return or track)
        var trackIdx = parseInt(path.match(/\d+$/)[0] || '0');
        if (isReturn) {
            if (delta < 0) {
                // prev track
                if (trackIdx < 1) {
                    // shift to last track
                    trackObj.goto('live_set tracks ' + (numTracks - 1));
                }
                else {
                    trackObj.goto('live_set return_tracks ' + (trackIdx + delta));
                }
            }
            else {
                // next track
                if (trackIdx >= numReturnTracks - 1) {
                    // last return track, so go to master
                    trackObj.goto('live_set master_track');
                }
                else {
                    trackObj.goto('live_set return_tracks ' + (trackIdx + delta));
                }
            }
        }
        else {
            // regular track
            if (delta < 0) {
                // prev track
                if (trackIdx < 1) {
                    // no "prev" from first track
                    return;
                }
                trackObj.goto('live_set tracks ' + (trackIdx + delta));
            }
            else {
                // next track
                if (trackIdx < numTracks - 1) {
                    trackObj.goto('live_set tracks ' + (trackIdx + delta));
                }
                else {
                    if (numReturnTracks) {
                        trackObj.goto('live_set return_tracks 0');
                    }
                    else {
                        trackObj.goto('live_set master_track');
                    }
                }
            }
        }
    }
    if (trackObj.id == 0) {
        log('HMM ZERO ' + trackObj.unquotedpath);
        return;
    }
    viewObj.set('selected_track', ['id', trackObj.id]);
    //log('TRACK ' + trackObj.id)
}
exports.deprecatedTrackDelta = deprecatedTrackDelta;
function deprecatedDeviceDelta(delta) {
    var devObj = new LiveAPI(function () { }, 'live_set view selected_track view selected_device');
    if (devObj.id == 0) {
        return;
    }
    var path = devObj.unquotedpath;
    var devIdx = parseInt(path.match(/\d+$/)[0] || '0');
    try {
        var newPath = path.replace(/\d+$/, (devIdx + delta).toString());
        var newObj = new LiveAPI(function () { }, newPath);
        var viewApi = new LiveAPI(function () { }, 'live_set view');
        if (newObj.id > 0) {
            viewApi.call('select_device', ['id', newObj.id]);
        }
        else {
            var parentPath = path.split(' ').slice(0, -2).join(' ');
            if (parentPath.indexOf(' devices ') > -1) {
                var parentObj = new LiveAPI(function () { }, parentPath);
                //log('PARENT_PATH ' + parentPath + ' ' + parentObj.type)
                if (parentObj.id > 0 && parentObj.type !== 'Chain') {
                    viewApi.call('select_device', ['id', parentObj.id]);
                }
                else {
                    var gparentPath = path.split(' ').slice(0, -4).join(' ');
                    if (gparentPath.indexOf(' devices ') > -1) {
                        //log('GPARENT_PATH ' + parentPath)
                        var gparentObj = new LiveAPI(function () { }, gparentPath);
                        if (gparentObj.id > 0) {
                            viewApi.call('select_device', ['id', gparentObj.id]);
                        }
                    }
                }
            }
        }
    }
    catch (e) { }
    //log('APPORT ' + devObj.id)
}
exports.deprecatedDeviceDelta = deprecatedDeviceDelta;
