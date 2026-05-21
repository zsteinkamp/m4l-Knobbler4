"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.xfadeAB = exports.toggleSolo = exports.toggleMute = exports.effectiveMute = exports.resetParamValue = exports.setParamValue = exports.getRecordStatus = exports.disableTrackInput = exports.disableArm = exports.enableArm = exports.toggleXFade = exports.handleExclusiveArm = exports.handleExclusiveSolo = void 0;
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
// ---------------------------------------------------------------------------
// Shared strip command/computation helpers
//
// These operate on a DeviceParameter or Track LiveAPI and return computed
// values. They intentionally do NOT emit OSC — the multiMixer (indexed
// addresses) and sidebarMixer (fixed addresses) emit to different addresses,
// so the caller owns emission. Callers also own pause/debounce, since the
// two modules track pause state differently.
// ---------------------------------------------------------------------------
/**
 * Set a DeviceParameter's value and return its display string ('' if the
 * param is invalid). Caller handles pause + OSC.
 */
function setParamValue(paramApi, val) {
    if (!paramApi || +paramApi.id === 0)
        return '';
    var fVal = parseFloat(val.toString());
    paramApi.set('value', fVal);
    var str = paramApi.call('str_for_value', (0, utils_1.fixFloat)(fVal));
    return str ? str.toString() : '';
}
exports.setParamValue = setParamValue;
/**
 * Reset a DeviceParameter to its default value. Returns { value, str } or
 * null if the param is invalid.
 */
function resetParamValue(paramApi) {
    if (!paramApi || +paramApi.id === 0)
        return null;
    var defVal = parseFloat(paramApi.get('default_value').toString());
    paramApi.set('value', defVal);
    var str = paramApi.call('str_for_value', (0, utils_1.fixFloat)(defVal));
    return { value: defVal, str: str ? str.toString() : '' };
}
exports.resetParamValue = resetParamValue;
/**
 * Effective mute = mute OR muted_via_solo (the user sees both as "muted").
 * Returns 0/1. NOTE: master track lacks both properties — callers must not
 * call this for the master strip (would log v8 warnings).
 */
function effectiveMute(trackApi) {
    if (!trackApi || +trackApi.id === 0)
        return 0;
    var m = parseInt(trackApi.get('mute').toString()) || 0;
    var mvs = parseInt(trackApi.get('muted_via_solo').toString()) || 0;
    return m || mvs ? 1 : 0;
}
exports.effectiveMute = effectiveMute;
/**
 * Toggle a track's mute. Returns the new effective mute (0/1).
 */
function toggleMute(trackApi) {
    if (!trackApi || +trackApi.id === 0)
        return 0;
    var curr = parseInt(trackApi.get('mute').toString()) || 0;
    trackApi.set('mute', curr ? 0 : 1);
    return effectiveMute(trackApi);
}
exports.toggleMute = toggleMute;
/**
 * Toggle a track's solo, honoring exclusive-solo. Returns the new solo
 * state (0/1). `lookupApi` is a throwaway LiveAPI for the exclusive sweep.
 */
function toggleSolo(trackApi, lookupApi) {
    if (!trackApi || +trackApi.id === 0)
        return 0;
    var next = parseInt(trackApi.get('solo').toString()) ? 0 : 1;
    if (next)
        handleExclusiveSolo(parseInt(trackApi.id.toString()), lookupApi);
    trackApi.set('solo', next);
    return next;
}
exports.toggleSolo = toggleSolo;
/**
 * Compute the crossfade A/B indicator pair from a mixer_device's
 * crossfade_assign (0=A, 1=off, 2=B). Returns [aOn, bOn].
 */
function xfadeAB(mixerApi) {
    if (!mixerApi || +mixerApi.id === 0)
        return [0, 0];
    var x = parseInt(mixerApi.get('crossfade_assign').toString()) || 0;
    return [x === 0 ? 1 : 0, x === 2 ? 1 : 0];
}
exports.xfadeAB = xfadeAB;
