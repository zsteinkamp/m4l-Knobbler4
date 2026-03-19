"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecordStatus = exports.disableTrackInput = exports.disableArm = exports.enableArm = exports.toggleXFade = exports.handleExclusiveArm = exports.handleExclusiveSolo = void 0;
var utils_1 = require("./utils");
var toggleInput_1 = require("./toggleInput");
Object.defineProperty(exports, "disableTrackInput", { enumerable: true, get: function () { return toggleInput_1.disableTrackInput; } });
/**
 * If exclusive_solo is enabled, unsolo all tracks except `trackId`.
 * `lookupApi` is a throwaway LiveAPI used for iteration.
 */
function handleExclusiveSolo(trackId, lookupApi) {
    lookupApi.path = 'live_set';
    if (parseInt(lookupApi.get('exclusive_solo')) === 1) {
        var tracks = (0, utils_1.cleanArr)(lookupApi.get('tracks'));
        var returns = (0, utils_1.cleanArr)(lookupApi.get('return_tracks'));
        for (var _i = 0, _a = tracks.concat(returns); _i < _a.length; _i++) {
            var tid = _a[_i];
            if (tid === trackId)
                continue;
            lookupApi.id = tid;
            lookupApi.set('solo', 0);
        }
    }
}
exports.handleExclusiveSolo = handleExclusiveSolo;
/**
 * If exclusive_arm is enabled, unarm all tracks except `trackId`.
 * `lookupApi` is a throwaway LiveAPI used for iteration.
 */
function handleExclusiveArm(trackId, lookupApi) {
    lookupApi.path = 'live_set';
    if (parseInt(lookupApi.get('exclusive_arm')) === 1) {
        var tracks = (0, utils_1.cleanArr)(lookupApi.get('tracks'));
        for (var _i = 0, tracks_1 = tracks; _i < tracks_1.length; _i++) {
            var tid = tracks_1[_i];
            if (tid === trackId)
                continue;
            lookupApi.id = tid;
            if (parseInt(lookupApi.get('can_be_armed'))) {
                lookupApi.set('arm', 0);
            }
        }
    }
}
exports.handleExclusiveArm = handleExclusiveArm;
/**
 * Toggle crossfade assignment. `side` is 0 for A, 2 for B.
 */
function toggleXFade(mixerApi, side) {
    if (!mixerApi || +mixerApi.id === 0)
        return;
    var curr = parseInt(mixerApi.get('crossfade_assign'));
    mixerApi.set('crossfade_assign', curr === side ? 1 : side);
}
exports.toggleXFade = toggleXFade;
/**
 * Enable record arm on a track, handling exclusive arm.
 */
function enableArm(trackApi, lookupApi) {
    (0, toggleInput_1.enableTrackInput)(trackApi);
    trackApi.set('arm', 1);
    handleExclusiveArm(parseInt(trackApi.id.toString()), lookupApi);
}
exports.enableArm = enableArm;
/**
 * Disable record arm on a track.
 */
function disableArm(trackApi) {
    trackApi.set('arm', 0);
}
exports.disableArm = disableArm;
/**
 * Returns { armStatus: number, inputEnabled: boolean } for a track.
 */
function getRecordStatus(trackApi) {
    var armStatus = parseInt(trackApi.get('can_be_armed')) && parseInt(trackApi.get('arm'));
    var trackInputStatus = (0, toggleInput_1.getTrackInputStatus)(trackApi);
    return {
        armStatus: armStatus ? 1 : 0,
        inputEnabled: !!(trackInputStatus && trackInputStatus.inputEnabled),
    };
}
exports.getRecordStatus = getRecordStatus;
