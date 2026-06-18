"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.page = exports.visibleTracks = exports.init = exports.routes = void 0;
var utils_1 = require("./utils");
var k4_config_1 = require("./k4-config");
var consts_1 = require("./consts");
var mixerUtils_1 = require("./mixerUtils");
var log = (0, utils_1.logFactory)(k4_config_1.default);
// Orchestrator context (set in init) — used to reach the sidebar mixer.
var ctx = null;
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Module-level scratchpads for one-off lookups (reuse via .path is fastest)
// Lazily initialized to avoid "Live API is not initialized" at load time
var scratchApi = null;
function ensureApis() {
    if (!scratchApi)
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
}
// Bind a fresh observer to an object by its numeric id instead of by a path
// string. `new LiveAPI(cb, 'live_set tracks N ...')` interns that path into Max's
// global symbol table (~1 symbol per distinct path, measured); `.id = N` is
// numeric and interns nothing. The '' constructor path is interned once
// globally. Child ids come from id-list reads (.get('mixer_device') etc.), which
// also don't intern — so a whole strip costs 0 path symbols. See k4-symbolTest.
function obsById(id, cb, prop) {
    var api = new LiveAPI(cb, '');
    api.id = id;
    if (prop)
        api.property = prop;
    return api;
}
// Re-point an existing observer to a new object id + property. Free — no path
// interning, no teardown leak. The basis of the strip pool: reuse observer
// objects across scroll instead of evict+recreate. See CLAUDE.md observer
// lifecycle.
function reArm(api, id, prop) {
    api.id = id;
    api.property = prop;
}
var DEFAULT_VISIBLE_COUNT = 18;
var MAX_STRIP_IDX = 128;
// Small coalescing window for /mixerView. The app already debounces (~100ms
// after scroll settles), so the device just needs to merge any back-to-back
// requests rather than ride out a whole scroll gesture.
var MIXERVIEW_DEBOUNCE_MS = 40;
// Pre-computed OSC address strings for mixer strips
var SA_VOL = [];
var SA_VOLSTR = [];
var SA_VOLAUTO = [];
var SA_PAN = [];
var SA_PANSTR = [];
var SA_MUTE = [];
var SA_SOLO = [];
var SA_ARM = [];
var SA_INPUT = [];
var SA_HASOUTPUT = [];
var SA_XFADEA = [];
var SA_XFADEB = [];
var SA_XFADEASSIGN = [];
var SA_NAME = [];
var SA_COLOR = [];
var SA_TYPE = [];
var SA_SEND = [];
for (var _i = 0; _i < MAX_STRIP_IDX; _i++) {
    var _p = '/mixer/' + _i + '/';
    SA_VOL[_i] = _p + 'vol';
    SA_VOLSTR[_i] = _p + 'volStr';
    SA_VOLAUTO[_i] = _p + 'volAuto';
    SA_PAN[_i] = _p + 'pan';
    SA_PANSTR[_i] = _p + 'panStr';
    SA_MUTE[_i] = _p + 'mute';
    SA_SOLO[_i] = _p + 'solo';
    SA_ARM[_i] = _p + 'recordArm';
    SA_INPUT[_i] = _p + 'inputEnabled';
    SA_HASOUTPUT[_i] = _p + 'hasOutput';
    SA_XFADEA[_i] = _p + 'xFadeA';
    SA_XFADEB[_i] = _p + 'xFadeB';
    SA_XFADEASSIGN[_i] = _p + 'xFadeAssign';
    SA_NAME[_i] = _p + 'name';
    SA_COLOR[_i] = _p + 'color';
    SA_TYPE[_i] = _p + 'type';
    SA_SEND[_i] = [];
    for (var _j = 0; _j < consts_1.MAX_SENDS; _j++) {
        SA_SEND[_i][_j] = _p + 'send' + (_j + 1);
    }
}
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var trackList = [];
var leftIndex = -1;
var visibleCount = 0;
// Observers keyed by track ID — kept WARM across scrolls (not torn down the
// instant a strip leaves the viewport), so scroll-back is instant with low GC
// churn (commit 94e86ea). Bounded to a WARM_MARGIN buffer around the viewport
// (applyWindow evicts strips outside it) so multiplayer — N instances on one
// Live set — can't climb toward Live's observer ceiling and freeze change
// notifications. Mirrors the clip-view bound (see k4-clipView applyWindow).
var WARM_MARGIN = 0.5; // keep this fraction of the viewport warm on each side
var observersByTrackId = {};
// Free pool of parked strip-observer objects (stripIndex = -1, meters disabled).
// On scroll, strips leaving the warm window are parked here and RE-POINTED to
// newly-warm tracks instead of being torn down — teardown leaks ~6 symbols per
// observer, re-point is free (see CLAUDE.md). Real teardown happens only on a
// full rebuild. The cap bounds the pool; overflow (rare) is torn down.
var stripPool = [];
var POOL_CAP = 64;
// Track IDs for which sendStripState has been called in the current visible window.
// Rebuilt each applyWindow so strips leaving the visible range get state re-sent
// if they scroll back in (observer callbacks don't fire while !isVisible).
var visibleStateSet = {};
var metersEnabled = true;
var onMixerPage = false;
var meterBuffer = [];
var meterDirty = false;
var meterFlushTask = null;
var mixerViewTask = null;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isVisible(strip) {
    return strip.stripIndex >= leftIndex && strip.stripIndex < leftIndex + visibleCount;
}
function stripPause(strip, key) {
    if (!strip.pause[key]) {
        strip.pause[key] = { paused: false, task: null };
    }
    (0, utils_1.pauseUnpause)(strip.pause[key], consts_1.PAUSE_MS);
}
function sendSoloCount() {
    ensureApis();
    var count = 0;
    scratchApi.path = 'live_set';
    var tracks = (0, utils_1.cleanArr)(scratchApi.get('tracks'));
    var returns = (0, utils_1.cleanArr)(scratchApi.get('return_tracks'));
    var all = tracks.concat(returns);
    for (var i = 0; i < all.length; i++) {
        scratchApi.id = all[i];
        if (parseInt(scratchApi.get('solo').toString())) {
            count++;
        }
    }
    (0, utils_1.osc)('/mixer/soloCount', count);
}
function sendReturnTrackColors() {
    var returns = trackList.filter(function (t) {
        return t.type === consts_1.TYPE_RETURN;
    });
    var colors = [];
    for (var i = 0; i < consts_1.MAX_SENDS; i++) {
        if (returns[i]) {
            colors.push('#' + returns[i].color);
        }
        else {
            colors.push('#' + consts_1.DEFAULT_COLOR);
        }
    }
    (0, utils_1.osc)('/mixer/returnTrackColors', colors);
}
// ---------------------------------------------------------------------------
// Meter Observers
// ---------------------------------------------------------------------------
// Create the 3 meter observers once. output_meter_* are Track properties — bound
// by track id. Created lazily, re-pointed with the strip, and toggled on/off via
// setMetersActive rather than torn down (teardown leaks symbols — see the
// observer-lifecycle section in CLAUDE.md). The stripIndex < 0 guard skips parked
// strips, whose buffer slot is invalid.
function ensureMeterApis(strip) {
    if (strip.meterLeftApi)
        return;
    strip.meterLeftApi = obsById(strip.trackId, function (args) {
        if (strip.stripIndex < 0 || args[0] !== 'output_meter_left')
            return;
        var v = (0, utils_1.meterVal)(args[1]);
        var off = strip.stripIndex * 3;
        if (v !== meterBuffer[off]) {
            meterBuffer[off] = v;
            meterDirty = true;
        }
    }, 'output_meter_left');
    strip.meterRightApi = obsById(strip.trackId, function (args) {
        if (strip.stripIndex < 0 || args[0] !== 'output_meter_right')
            return;
        var v = (0, utils_1.meterVal)(args[1]);
        var off = strip.stripIndex * 3 + 1;
        if (v !== meterBuffer[off]) {
            meterBuffer[off] = v;
            meterDirty = true;
        }
    }, 'output_meter_right');
    strip.meterLevelApi = obsById(strip.trackId, function (args) {
        if (strip.stripIndex < 0 || args[0] !== 'output_meter_level')
            return;
        var v = (0, utils_1.meterVal)(args[1]);
        var off = strip.stripIndex * 3 + 2;
        if (v !== meterBuffer[off]) {
            meterBuffer[off] = v;
            meterDirty = true;
        }
    }, 'output_meter_level');
}
// Subscribe/unsubscribe the meter observers without tearing them down (property
// '' unsubscribes — free; teardown leaks). Keeps meters live only for visible
// strips while the objects stay pooled.
function setMetersActive(strip, active) {
    if (!strip.meterLeftApi)
        return;
    strip.meterLeftApi.property = active ? 'output_meter_left' : '';
    strip.meterRightApi.property = active ? 'output_meter_right' : '';
    strip.meterLevelApi.property = active ? 'output_meter_level' : '';
}
function teardownMeterObservers(strip) {
    if (strip.meterLeftApi) {
        (0, utils_1.detach)(strip.meterLeftApi);
        strip.meterLeftApi = null;
    }
    if (strip.meterRightApi) {
        (0, utils_1.detach)(strip.meterRightApi);
        strip.meterRightApi = null;
    }
    if (strip.meterLevelApi) {
        (0, utils_1.detach)(strip.meterLevelApi);
        strip.meterLevelApi = null;
    }
    // Zero out this strip's slots in the buffer
    var baseOffset = strip.stripIndex * 3;
    if (baseOffset >= 0 && baseOffset + 2 < meterBuffer.length) {
        meterBuffer[baseOffset] = 0;
        meterBuffer[baseOffset + 1] = 0;
        meterBuffer[baseOffset + 2] = 0;
    }
}
// ---------------------------------------------------------------------------
// Meter Flush Timer
// ---------------------------------------------------------------------------
function flushMeters() {
    if (!meterDirty)
        return;
    meterDirty = false;
    (0, utils_1.osc)('/mixer/meters', meterBuffer);
}
function startMeterFlush() {
    if (meterFlushTask)
        return;
    meterFlushTask = new Task(function () {
        flushMeters();
        meterFlushTask.schedule(consts_1.METER_FLUSH_MS);
    });
    meterFlushTask.schedule(consts_1.METER_FLUSH_MS);
}
function stopMeterFlush() {
    if (!meterFlushTask)
        return;
    meterFlushTask.cancel();
    meterFlushTask.freepeer();
    meterFlushTask = null;
}
// ---------------------------------------------------------------------------
// Observer Creation / Teardown
// ---------------------------------------------------------------------------
// Whether the track currently produces audio output (audio track, or a MIDI
// track with an instrument) and so HAS output_meter_* properties. Master has no
// has_audio_output property and always outputs audio. has_audio_output isn't
// observable, but `devices` is — see onDevicesChange.
function readHasOutput(strip) {
    if (strip.isMain)
        return true;
    return !!parseInt(strip.trackApi.get('has_audio_output').toString());
}
// The track's devices list changed (e.g. an instrument added to / removed from a
// MIDI track) — its audio output may have appeared or disappeared. Re-read and,
// if it flipped, update the app's meter flag and (de)activate the meter
// observers so we never bind output_meter_* on a pure-MIDI track.
function onDevicesChange(strip) {
    if (!strip.initialized)
        return;
    var has = readHasOutput(strip);
    if (has === strip.hasOutput)
        return;
    strip.hasOutput = has;
    if (!isVisible(strip))
        return;
    (0, utils_1.osc)(SA_HASOUTPUT[strip.stripIndex], has ? 1 : 0);
    if (metersEnabled && has) {
        ensureMeterApis(strip);
        setMetersActive(strip, true);
    }
    else {
        setMetersActive(strip, false);
    }
}
function createStripObservers(trackId, stripIdx) {
    var strip = {
        trackId: trackId,
        trackApi: null,
        colorApi: null,
        muteApi: null,
        mutedViaSoloApi: null,
        soloApi: null,
        armApi: null,
        devicesApi: null,
        meterLeftApi: null,
        meterRightApi: null,
        meterLevelApi: null,
        mixerApi: null,
        volApi: null,
        volAutoApi: null,
        panApi: null,
        sendApis: [],
        pause: {},
        stripIndex: stripIdx,
        canBeArmed: false,
        hasOutput: false,
        isMain: false,
        initialized: false,
    };
    // Resolve the track + its mixer children by id up front (id-list reads don't
    // intern), then bind every observer by .id instead of by path string — so the
    // whole strip costs 0 symbols. trackPath is read only for the isMain check
    // (reads don't intern; we never assign it to a .path). See obsById.
    scratchApi.id = trackId;
    var trackPath = scratchApi.unquotedpath;
    strip.isMain = trackPath.indexOf('master_track') > -1;
    strip.canBeArmed =
        !strip.isMain && !!parseInt(scratchApi.get('can_be_armed').toString());
    var mixerId = (0, utils_1.cleanArr)(scratchApi.get('mixer_device'))[0];
    scratchApi.id = mixerId;
    var volId = (0, utils_1.cleanArr)(scratchApi.get('volume'))[0];
    var panId = (0, utils_1.cleanArr)(scratchApi.get('panning'))[0];
    var sendIds = (0, utils_1.cleanArr)(scratchApi.get('sends'));
    // Color API — separate observer for track color changes
    strip.colorApi = obsById(trackId, function (args) {
        if (args[0] === 'color') {
            var newColor = (0, utils_1.colorToString)(args[1].toString());
            for (var j = 0; j < trackList.length; j++) {
                if (trackList[j].id === strip.trackId) {
                    trackList[j].color = newColor;
                    break;
                }
            }
        }
    }, 'color');
    // Track API — used for querying properties (no observer)
    strip.trackApi = obsById(trackId, consts_1.noFn);
    // Mute, solo, arm — separate observers (master track lacks these)
    if (!strip.isMain) {
        strip.muteApi = obsById(trackId, function (args) {
            if (args[0] === 'mute' && strip.initialized && isVisible(strip)) {
                emitEffectiveMute(strip);
            }
        }, 'mute');
        // muted_via_solo also lights the mute indicator so the user sees that
        // soloing another track has effectively muted this one.
        strip.mutedViaSoloApi = obsById(trackId, function (args) {
            if (args[0] === 'muted_via_solo' && strip.initialized && isVisible(strip)) {
                emitEffectiveMute(strip);
            }
        }, 'muted_via_solo');
        strip.soloApi = obsById(trackId, function (args) {
            if (args[0] === 'solo' && strip.initialized && isVisible(strip)) {
                (0, utils_1.osc)(SA_SOLO[strip.stripIndex], parseInt(args[1].toString()));
                sendSoloCount();
            }
        }, 'solo');
    }
    if (strip.canBeArmed) {
        strip.armApi = obsById(trackId, function (args) {
            if (args[0] === 'arm' && strip.initialized && isVisible(strip)) {
                (0, utils_1.osc)(SA_ARM[strip.stripIndex], parseInt(args[1].toString()));
            }
        }, 'arm');
    }
    // Gate meters on REAL audio output: a MIDI-output track has no output_meter_*
    // property, and binding a meter observer on it logs a [v8] "Tracks with MIDI
    // output have no 'output_meter_left' property" warning (and makes the app draw
    // a dead meter). Only meters are gated — vol/pan/send sliders stay live. The
    // `devices` observer keeps hasOutput live if the track gains/loses an
    // instrument while visible (has_audio_output itself isn't observable).
    strip.hasOutput = readHasOutput(strip);
    if (!strip.isMain) {
        strip.devicesApi = obsById(trackId, function (args) {
            if (args[0] === 'devices')
                onDevicesChange(strip);
        }, 'devices');
    }
    // Meter observers are managed separately by applyWindow (visible tracks only)
    // Mixer device — observe crossfade_assign (master track lacks this)
    strip.mixerApi = obsById(mixerId, function (args) {
        if (args[0] === 'crossfade_assign' && strip.initialized && isVisible(strip)) {
            var xVal = parseInt(args[1].toString());
            (0, utils_1.osc)(SA_XFADEA[strip.stripIndex], xVal === 0 ? 1 : 0);
            (0, utils_1.osc)(SA_XFADEB[strip.stripIndex], xVal === 2 ? 1 : 0);
        }
    });
    if (!strip.isMain) {
        strip.mixerApi.property = 'crossfade_assign';
    }
    // Volume observer
    strip.volApi = obsById(volId, function (args) {
        if (args[0] !== 'value' || !strip.initialized || !isVisible(strip))
            return;
        if (!strip.pause['vol'] || !strip.pause['vol'].paused) {
            var fVal = parseFloat(args[1]) || 0;
            (0, utils_1.osc)(SA_VOL[strip.stripIndex], fVal);
            var str = strip.volApi.call('str_for_value', (0, utils_1.fixFloat)(fVal));
            (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '');
        }
    }, 'value');
    // Volume automation state observer
    strip.volAutoApi = obsById(volId, function (args) {
        if (args[0] === 'automation_state' && strip.initialized && isVisible(strip)) {
            (0, utils_1.osc)(SA_VOLAUTO[strip.stripIndex], parseInt(args[1].toString()));
        }
    }, 'automation_state');
    // Pan observer
    strip.panApi = obsById(panId, function (args) {
        if (args[0] !== 'value' || !strip.initialized || !isVisible(strip))
            return;
        if (!strip.pause['pan'] || !strip.pause['pan'].paused) {
            var fVal = parseFloat(args[1]) || 0;
            (0, utils_1.osc)(SA_PAN[strip.stripIndex], fVal);
            var str = strip.panApi.call('str_for_value', (0, utils_1.fixFloat)(fVal));
            (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], str ? str.toString() : '');
        }
    }, 'value');
    // Send observers
    var numSends = Math.min(sendIds.length, consts_1.MAX_SENDS);
    var _loop_1 = function (i) {
        var sendIdx = i;
        var sendApi = obsById(sendIds[i], function (args) {
            if (args[0] !== 'value' || !strip.initialized || !isVisible(strip))
                return;
            if (!strip.pause['send'] || !strip.pause['send'].paused) {
                (0, utils_1.osc)(SA_SEND[strip.stripIndex][sendIdx], args[1] || 0);
            }
        }, 'value');
        strip.sendApis.push(sendApi);
    };
    for (var i = 0; i < numSends; i++) {
        _loop_1(i);
    }
    strip.initialized = true;
    return strip;
}
// Re-point a type-compatible parked/freed strip to a new track. The caller
// guarantees compatibility (same isMain / canBeArmed / send count), so the
// observer SET already matches — we only re-point ids + re-arm properties, no
// create or teardown. Child ids are passed in (resolved once by takeAndRepoint).
function repointStrip(strip, trackId, stripIdx, mixerId, volId, panId, sendIds) {
    strip.initialized = false; // suppress emits while re-pointing fires callbacks
    strip.trackId = trackId;
    strip.stripIndex = stripIdx;
    reArm(strip.colorApi, trackId, 'color');
    strip.trackApi.id = trackId;
    strip.hasOutput = readHasOutput(strip); // re-evaluate audio output for the new track
    if (strip.devicesApi)
        reArm(strip.devicesApi, trackId, 'devices');
    if (strip.muteApi)
        reArm(strip.muteApi, trackId, 'mute');
    if (strip.mutedViaSoloApi)
        reArm(strip.mutedViaSoloApi, trackId, 'muted_via_solo');
    if (strip.soloApi)
        reArm(strip.soloApi, trackId, 'solo');
    if (strip.armApi)
        reArm(strip.armApi, trackId, 'arm');
    strip.mixerApi.id = mixerId;
    if (!strip.isMain)
        strip.mixerApi.property = 'crossfade_assign';
    reArm(strip.volApi, volId, 'value');
    reArm(strip.volAutoApi, volId, 'automation_state');
    reArm(strip.panApi, panId, 'value');
    for (var i = 0; i < strip.sendApis.length; i++) {
        reArm(strip.sendApis[i], sendIds[i], 'value');
    }
    // Meters travel with the strip (re-point id only; active state set by caller).
    if (strip.meterLeftApi) {
        strip.meterLeftApi.id = trackId;
        strip.meterRightApi.id = trackId;
        strip.meterLevelApi.id = trackId;
    }
    strip.initialized = true;
}
// Provide a strip for `trackId` at `stripIdx`: re-point a compatible free strip
// if one exists (no leak), else create a fresh one (create is free; only
// teardown leaks). Resolves the track's mixer-child ids once via id-list reads.
function takeAndRepoint(free, trackId, stripIdx) {
    scratchApi.id = trackId;
    var trackPath = scratchApi.unquotedpath;
    var isMain = trackPath.indexOf('master_track') > -1;
    var canBeArmed = !isMain && !!parseInt(scratchApi.get('can_be_armed').toString());
    var mixerId = (0, utils_1.cleanArr)(scratchApi.get('mixer_device'))[0];
    scratchApi.id = mixerId;
    var volId = (0, utils_1.cleanArr)(scratchApi.get('volume'))[0];
    var panId = (0, utils_1.cleanArr)(scratchApi.get('panning'))[0];
    var sendIds = (0, utils_1.cleanArr)(scratchApi.get('sends'));
    for (var k = 0; k < free.length; k++) {
        var s = free[k];
        if (s &&
            s.isMain === isMain &&
            s.canBeArmed === canBeArmed &&
            s.sendApis.length === sendIds.length) {
            free[k] = null;
            repointStrip(s, trackId, stripIdx, mixerId, volId, panId, sendIds);
            return s;
        }
    }
    return createStripObservers(trackId, stripIdx);
}
// Park a strip in the pool: unsubscribe ALL its observers (property '' — free, no
// teardown leak) so they stop firing while idle and never fire on a since-deleted
// track (the invalidated-object crash detach() guards against). repointStrip
// re-subscribes on reuse. trackApi has no observer, so its stale id is harmless.
function parkStrip(strip) {
    strip.stripIndex = -1;
    strip.initialized = false;
    if (strip.colorApi)
        strip.colorApi.property = '';
    if (strip.muteApi)
        strip.muteApi.property = '';
    if (strip.mutedViaSoloApi)
        strip.mutedViaSoloApi.property = '';
    if (strip.soloApi)
        strip.soloApi.property = '';
    if (strip.armApi)
        strip.armApi.property = '';
    if (strip.devicesApi)
        strip.devicesApi.property = '';
    if (strip.mixerApi)
        strip.mixerApi.property = '';
    if (strip.volApi)
        strip.volApi.property = '';
    if (strip.volAutoApi)
        strip.volAutoApi.property = '';
    if (strip.panApi)
        strip.panApi.property = '';
    for (var i = 0; i < strip.sendApis.length; i++)
        strip.sendApis[i].property = '';
    setMetersActive(strip, false);
}
// Effective mute = mute || muted_via_solo (the user sees both as "muted").
// Master lacks both properties, so skip it.
function emitEffectiveMute(strip) {
    if (strip.isMain)
        return;
    (0, utils_1.osc)(SA_MUTE[strip.stripIndex], (0, mixerUtils_1.effectiveMute)(strip.trackApi));
}
function teardownStripObservers(strip) {
    (0, utils_1.detach)(strip.colorApi);
    (0, utils_1.detach)(strip.muteApi);
    (0, utils_1.detach)(strip.mutedViaSoloApi);
    (0, utils_1.detach)(strip.soloApi);
    (0, utils_1.detach)(strip.armApi);
    (0, utils_1.detach)(strip.devicesApi);
    teardownMeterObservers(strip);
    (0, utils_1.detach)(strip.mixerApi);
    (0, utils_1.detach)(strip.volApi);
    (0, utils_1.detach)(strip.volAutoApi);
    (0, utils_1.detach)(strip.panApi);
    for (var i = 0; i < strip.sendApis.length; i++) {
        (0, utils_1.detach)(strip.sendApis[i]);
    }
    (0, utils_1.detach)(strip.trackApi);
    // Cancel all pause tasks
    for (var key in strip.pause) {
        if (strip.pause[key].task) {
            strip.pause[key].task.cancel();
            strip.pause[key].task.freepeer();
        }
    }
}
function teardownAll() {
    stopMeterFlush();
    for (var trackIdStr in observersByTrackId) {
        teardownStripObservers(observersByTrackId[trackIdStr]);
    }
    for (var k = 0; k < stripPool.length; k++) {
        teardownStripObservers(stripPool[k]);
    }
    stripPool = [];
    observersByTrackId = {};
    visibleStateSet = {};
    trackList = [];
    meterBuffer = [];
}
// ---------------------------------------------------------------------------
// Send Strip State
// ---------------------------------------------------------------------------
function sendStripState(n, strip) {
    var info = null;
    for (var i = 0; i < trackList.length; i++) {
        if (trackList[i].id === strip.trackId) {
            info = trackList[i];
            break;
        }
    }
    (0, utils_1.osc)(SA_NAME[n], info ? info.name : '');
    (0, utils_1.osc)(SA_COLOR[n], info ? info.color : consts_1.DEFAULT_COLOR);
    (0, utils_1.osc)(SA_TYPE[n], info ? info.type : consts_1.TYPE_TRACK);
    var volVal = parseFloat(strip.volApi.get('value').toString()) || 0;
    var volStr = strip.volApi.call('str_for_value', (0, utils_1.fixFloat)(volVal));
    (0, utils_1.osc)(SA_VOL[n], volVal);
    (0, utils_1.osc)(SA_VOLSTR[n], volStr ? volStr.toString() : '');
    (0, utils_1.osc)(SA_VOLAUTO[n], parseInt(strip.volAutoApi.get('automation_state').toString()));
    var panVal = parseFloat(strip.panApi.get('value').toString()) || 0;
    var panStr = strip.panApi.call('str_for_value', (0, utils_1.fixFloat)(panVal));
    (0, utils_1.osc)(SA_PAN[n], panVal);
    (0, utils_1.osc)(SA_PANSTR[n], panStr ? panStr.toString() : '');
    if (strip.isMain) {
        (0, utils_1.osc)(SA_MUTE[n], 0);
    }
    else {
        emitEffectiveMute(strip);
    }
    (0, utils_1.osc)(SA_SOLO[n], !strip.isMain ? parseInt(strip.trackApi.get('solo').toString()) : 0);
    (0, utils_1.osc)(SA_ARM[n], strip.canBeArmed ? parseInt(strip.trackApi.get('arm').toString()) : 0);
    var recordStatus = (0, mixerUtils_1.getRecordStatus)(strip.trackApi);
    (0, utils_1.osc)(SA_INPUT[n], strip.canBeArmed && recordStatus.inputEnabled ? 1 : 0);
    (0, utils_1.osc)(SA_HASOUTPUT[n], strip.hasOutput ? 1 : 0);
    if (!strip.isMain) {
        var _a = (0, mixerUtils_1.xfadeAB)(strip.mixerApi), aOn = _a[0], bOn = _a[1];
        (0, utils_1.osc)(SA_XFADEA[n], aOn);
        (0, utils_1.osc)(SA_XFADEB[n], bOn);
    }
    for (var i = 0; i < strip.sendApis.length; i++) {
        (0, utils_1.osc)(SA_SEND[n][i], parseFloat(strip.sendApis[i].get('value').toString()) || 0);
    }
}
// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------
function applyWindow() {
    if (leftIndex < 0 || visibleCount <= 0) {
        return;
    }
    var visRight = Math.min(leftIndex + visibleCount, trackList.length);
    // Resize meter buffer if track count changed
    var requiredLen = trackList.length * 3;
    if (meterBuffer.length !== requiredLen) {
        var wasRunning = !!meterFlushTask;
        if (wasRunning)
            stopMeterFlush();
        var newBuf = [];
        for (var i = 0; i < requiredLen; i++)
            newBuf.push(0);
        meterBuffer = newBuf;
        if (wasRunning && metersEnabled)
            startMeterFlush();
    }
    // --- Warm-window reconcile (pool + re-point; no teardown on scroll) ---
    // The warm window is the viewport plus a WARM_MARGIN buffer each side. Strips
    // leaving it are PARKED (not torn down — teardown leaks) and reused by
    // re-pointing onto strips entering it. On steady scrolling the window size is
    // constant, so every step is pure re-pointing: zero teardown, zero leak.
    var margin = Math.ceil(visibleCount * WARM_MARGIN);
    var warmLeft = Math.max(0, leftIndex - margin);
    var warmRight = Math.min(trackList.length, visRight + margin);
    // Target: trackId -> stripIndex for the warm window.
    var targetIdx = {};
    for (var i = warmLeft; i < warmRight; i++)
        targetIdx[trackList[i].id] = i;
    // Residents still in target keep their observers (refresh stripIndex); the rest
    // become reuse candidates, joined by the parked pool.
    var free = [];
    for (var tidStr in observersByTrackId) {
        var tid = +tidStr;
        if (targetIdx[tid] !== undefined) {
            observersByTrackId[tid].stripIndex = targetIdx[tid];
        }
        else {
            free.push(observersByTrackId[tid]);
            delete observersByTrackId[tid];
        }
    }
    for (var k = 0; k < stripPool.length; k++)
        free.push(stripPool[k]);
    // Fill missing targets by re-pointing a compatible free strip, else creating.
    for (var i = warmLeft; i < warmRight; i++) {
        var tid = trackList[i].id;
        if (observersByTrackId[tid])
            continue;
        observersByTrackId[tid] = takeAndRepoint(free, tid, i);
    }
    // Leftover free strips: park them (disable meters; stripIndex -1 so they never
    // emit). Cap the pool; only the overflow (rare) is torn down.
    stripPool = [];
    for (var k = 0; k < free.length; k++) {
        var s = free[k];
        if (!s)
            continue;
        parkStrip(s);
        if (stripPool.length < POOL_CAP)
            stripPool.push(s);
        else
            teardownStripObservers(s);
    }
    // Meters: live only for visible strips, toggled (not torn down) so the objects
    // stay pooled and re-pointable.
    if (metersEnabled) {
        for (var tidStr in observersByTrackId) {
            var strip = observersByTrackId[tidStr];
            if (isVisible(strip) && strip.hasOutput) {
                ensureMeterApis(strip);
                setMetersActive(strip, true);
            }
            else {
                setMetersActive(strip, false);
            }
        }
        if (onMixerPage && !meterFlushTask)
            startMeterFlush();
    }
    // Send state for strips that are newly visible (weren't in the previous visible set).
    // This catches both newly created strips and existing strips scrolling into view.
    var newVisibleSet = {};
    for (var i = leftIndex; i < visRight; i++) {
        var tid = trackList[i].id;
        var strip = observersByTrackId[tid];
        if (strip) {
            newVisibleSet[tid] = true;
            if (!visibleStateSet[tid]) {
                sendStripState(i, strip);
            }
        }
    }
    visibleStateSet = newVisibleSet;
    sendSoloCount();
}
// ---------------------------------------------------------------------------
// Refresh — called on /btnRefresh to invalidate stale observers
// ---------------------------------------------------------------------------
function mixerRefresh() {
    teardownAll();
    sendMetersState();
    (0, utils_1.osc)('/sendMixerView', 1);
}
// ---------------------------------------------------------------------------
// Incoming: mixerView
// ---------------------------------------------------------------------------
function setupWindow(left, count) {
    ensureApis();
    leftIndex = left;
    visibleCount = count;
    applyWindow();
}
function mixerView() {
    var parsed = JSON.parse(arguments[0].toString());
    var left = parseInt(parsed[0].toString());
    var count = parseInt(parsed[1].toString());
    if (count === 0) {
        if (mixerViewTask) {
            mixerViewTask.cancel();
            mixerViewTask.freepeer();
            mixerViewTask = null;
        }
        // Don't teardown observers — keep them alive so sliders work immediately
        // when the user returns to the mixer page. Only stop meters.
        stopMeterFlush();
        return;
    }
    if (mixerViewTask) {
        mixerViewTask.cancel();
        mixerViewTask.freepeer();
    }
    mixerViewTask = new Task(function () {
        setupWindow(left, count);
    });
    mixerViewTask.schedule(MIXERVIEW_DEBOUNCE_MS);
}
function mixerMeters(val) {
    var enabled = !!parseInt(val.toString());
    if (enabled === metersEnabled)
        return;
    metersEnabled = enabled;
    ctx.settings.set('metersEnabled', metersEnabled ? 1 : 0);
    sendMetersState();
    if (metersEnabled) {
        // Activate meters for visible tracks only (create lazily, then subscribe).
        var visRight = Math.min(leftIndex + visibleCount, trackList.length);
        for (var i = leftIndex; i < visRight; i++) {
            var tid = trackList[i].id;
            var strip = observersByTrackId[tid];
            if (strip && strip.hasOutput) {
                ensureMeterApis(strip);
                setMetersActive(strip, true);
            }
        }
        if (onMixerPage && visibleCount > 0)
            startMeterFlush();
    }
    else {
        stopMeterFlush();
        // Disable (not teardown — teardown leaks) all meter observers.
        for (var trackIdStr in observersByTrackId) {
            setMetersActive(observersByTrackId[trackIdStr], false);
        }
        for (var k = 0; k < stripPool.length; k++) {
            setMetersActive(stripPool[k], false);
        }
    }
}
function sendMetersState() {
    (0, utils_1.osc)('/mixerMeters', metersEnabled ? 1 : 0);
    var chk = patcher.getnamed('chkMeters');
    if (chk)
        chk.message('set', metersEnabled ? 1 : 0);
    // Direct call now that sidebarMixer is folded into the same [v8].
    ctx.sidebar.sidebarMeters(metersEnabled ? 1 : 0);
}
function page(pageNameArg) {
    var pageName = pageNameArg.toString();
    var wasMixerPage = onMixerPage;
    onMixerPage = pageName === 'mixer' || pageName === 'session';
    if (onMixerPage && !wasMixerPage) {
        if (metersEnabled && visibleCount > 0)
            startMeterFlush();
    }
    else if (!onMixerPage && wasMixerPage) {
        stopMeterFlush();
    }
}
exports.page = page;
function init(c) {
    (0, utils_1.setOscSink)(c.osc);
    ctx = c;
    ensureApis();
    // Default meters ON when this device instance has never saved the setting;
    // respect an explicit saved value (including 0 = off) otherwise.
    var storedMeters = ctx.settings.get('metersEnabled');
    metersEnabled = storedMeters == null ? true : !!storedMeters;
    sendMetersState();
    // Force visible strips to re-send on the /syn re-push. Their state was first
    // pushed at LOAD while output was still gated (node sender not yet ready), so
    // it was dropped; the visibleStateSet cache would otherwise mark them "sent"
    // and skip them here, leaving the initial strips dead until scrolled away and
    // back. Clearing it makes applyWindow re-emit state for the visible window.
    visibleStateSet = {};
    setupWindow(0, DEFAULT_VISIBLE_COUNT);
}
exports.init = init;
// ---------------------------------------------------------------------------
// Helpers: resolve strip from incoming index
// ---------------------------------------------------------------------------
function getStrip(stripIdx) {
    var rel = stripIdx - leftIndex;
    if (rel < 0 || rel >= visibleCount)
        return null;
    if (stripIdx >= trackList.length)
        return null;
    var tid = trackList[stripIdx].id;
    return observersByTrackId[tid] || null;
}
// ---------------------------------------------------------------------------
// Incoming Commands (App -> Device)
// ---------------------------------------------------------------------------
function vol(stripIdx, val) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    stripPause(strip, 'vol');
    (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], (0, mixerUtils_1.setParamValue)(strip.volApi, val));
}
function pan(stripIdx, val) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    stripPause(strip, 'pan');
    (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], (0, mixerUtils_1.setParamValue)(strip.panApi, val));
}
function volDefault(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var res = (0, mixerUtils_1.resetParamValue)(strip.volApi);
    if (!res)
        return;
    (0, utils_1.osc)(SA_VOL[strip.stripIndex], res.value);
    (0, utils_1.osc)(SA_VOLSTR[strip.stripIndex], res.str);
}
function panDefault(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var res = (0, mixerUtils_1.resetParamValue)(strip.panApi);
    if (!res)
        return;
    (0, utils_1.osc)(SA_PANSTR[strip.stripIndex], res.str);
}
// Send handlers — send1 through send12
function handleSend(stripIdx, sendNum, val) {
    if (val === undefined)
        return;
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var idx = sendNum - 1;
    if (idx < 0 || idx >= strip.sendApis.length)
        return;
    stripPause(strip, 'send');
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
    (0, mixerUtils_1.toggleMute)(strip.trackApi);
    emitEffectiveMute(strip);
}
function toggleSolo(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    var newState = (0, mixerUtils_1.toggleSolo)(strip.trackApi, scratchApi);
    (0, utils_1.osc)(SA_SOLO[strip.stripIndex], newState);
    sendSoloCount();
}
function enableRecord(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip || !strip.canBeArmed)
        return;
    (0, mixerUtils_1.enableArm)(strip.trackApi, scratchApi);
    sendRecordStatusForStrip(strip);
}
function disableRecord(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip || !strip.canBeArmed)
        return;
    (0, mixerUtils_1.disableArm)(strip.trackApi);
    sendRecordStatusForStrip(strip);
}
function disableInput(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    (0, mixerUtils_1.disableTrackInput)(strip.trackApi);
    sendRecordStatusForStrip(strip);
}
function sendRecordStatusForStrip(strip) {
    var n = strip.stripIndex;
    var status = (0, mixerUtils_1.getRecordStatus)(strip.trackApi);
    (0, utils_1.osc)(SA_ARM[n], strip.canBeArmed ? status.armStatus : 0);
    (0, utils_1.osc)(SA_INPUT[n], status.inputEnabled ? 1 : 0);
}
function toggleXFadeA(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    (0, mixerUtils_1.toggleXFade)(strip.mixerApi, 0);
}
function toggleXFadeB(stripIdx) {
    var strip = getStrip(stripIdx);
    if (!strip)
        return;
    (0, mixerUtils_1.toggleXFade)(strip.mixerApi, 2);
}
// ---------------------------------------------------------------------------
// anything() dispatcher — receives (subCmd, stripIdx, val) from router
// ---------------------------------------------------------------------------
// anything() dispatcher — Max calls this with messagename = subCmd,
// arguments = [stripIdx, val] (from router outlet)
// Parse /mixer/{stripIdx}/{subCmd} and dispatch. NaN stripIdx (e.g. the
// single-track /mixer/vol) is left for k4-mixerSends (still in the router).
function mixerCmd(address, val) {
    var parts = address.split('/'); // ['', 'mixer', '3', 'vol']
    var stripIdx = parseInt(parts[2]);
    if (isNaN(stripIdx))
        return;
    dispatchMixerSub(parts[3], stripIdx, val);
}
function dispatchMixerSub(subCmd, stripIdx, val) {
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
function visibleTracks() {
    trackList = (0, utils_1.getVisibleTracksList)();
    if (!trackList || trackList.length === 0)
        return;
    // Clamp leftIndex if track list shrank
    if (leftIndex >= trackList.length) {
        leftIndex = Math.max(0, trackList.length - visibleCount);
    }
    sendReturnTrackColors();
    if (visibleCount > 0) {
        applyWindow();
    }
}
exports.visibleTracks = visibleTracks;
var routes = [
    { prefix: '/mixerView', parse: 'val', fn: mixerView },
    { prefix: '/mixerMeters', parse: 'val', fn: mixerMeters },
    { prefix: '/mixer/', parse: 'custom', fn: mixerCmd, coalesce: true },
];
exports.routes = routes;
log('reloaded k4-multiMixer');
