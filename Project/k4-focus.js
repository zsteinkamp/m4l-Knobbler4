"use strict";
// Knobbler's "current target" — the single source of truth for which track and
// device the device-control surface points at. This may differ from Live's
// `selected_track` / `selected_device` when UNLOCKED.
//
// Two modes:
//   locked (default)  — bidirectional sync with Live's selection (legacy
//                       behavior). trackPath()/devicePath() return Live's
//                       selection paths, so observers bound to them auto-follow;
//                       selectTrack/selectDevice write Live's selection.
//   unlocked          — Knobbler holds its own pointer. Navigating inside
//                       Knobbler retargets this pointer WITHOUT touching Live's
//                       selection. Observers bind by id and re-point on the
//                       focus-change emit. The pointer persists as canonical
//                       PATHS (positional, like the mapped-slot paths) so it
//                       survives set reloads; resolved to ids for live binding.
//
// Reached by other modules via ctx.focus (never a direct import — require()
// doesn't share module state across files in [v8]; see CLAUDE.md).
Object.defineProperty(exports, "__esModule", { value: true });
exports.routes = exports.onChange = exports.lock = exports.selectDevice = exports.selectTrack = exports.devicePath = exports.trackPath = exports.isLocked = exports.init = void 0;
var k4_config_1 = require("./k4-config");
var utils_1 = require("./utils");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
// Live's selection paths — the bind targets while locked.
var SEL_TRACK = 'live_set view selected_track';
var SEL_DEVICE = 'live_set view selected_track view selected_device';
// Canonical track prefix of a device path, e.g.
// "live_set tracks 3 devices 1" → "live_set tracks 3"
var TRACK_PATH_RE = /^(live_set (?:tracks \d+|return_tracks \d+|master_track))/;
var KEY_LOCKED = 'focusLocked';
var KEY_TRACK = 'focusTrackPath';
var KEY_DEVICE = 'focusDevicePath';
var ctx = null;
var locked = true;
// Unlocked pointer: canonical PATHS (persisted) + resolved ids (live binding).
// trackId === 0 means "no pinned track" → fall back to Live's selection path.
var trackId = 0;
var deviceId = 0;
var trackPathStr = '';
var devicePathStr = '';
var listeners = [];
// Scratch handle for path/id resolution (not an observer).
var scratch = null;
function getScratch() {
    if (!scratch)
        scratch = new LiveAPI(consts_1.noFn, 'live_set');
    return scratch;
}
// True only if the LiveAPI currently points at a real device — guards against
// adopting a Track/Song that `view selected_device` can resolve to on a
// deviceless track. Excludes the known non-device types rather than allow-
// listing 'Device' (rack/instrument subtypes vary).
function isDevice(api) {
    var t = api.type;
    return +api.id !== 0 && t !== 'Song' && t !== 'Track';
}
// Operational handle for writing Live's selection (locked mode).
var viewApi = null;
function getViewApi() {
    if (!viewApi)
        viewApi = new LiveAPI(consts_1.noFn, 'live_set view');
    return viewApi;
}
function init(c) {
    ctx = c;
    (0, utils_1.setOscSink)(c.osc);
    var savedLocked = c.settings.get(KEY_LOCKED);
    locked = savedLocked === null || savedLocked === undefined ? true : !!+savedLocked;
    if (!locked) {
        restorePointer(c.settings.get(KEY_TRACK), c.settings.get(KEY_DEVICE));
    }
    // No emit() here: bluhand.init runs after us and binds its observers using
    // the current trackPath()/devicePath(), so they come up pointed correctly.
    pushLockState();
}
exports.init = init;
function isLocked() {
    return locked;
}
exports.isLocked = isLocked;
// Canonical, APPENDABLE path the "current track" should bind to (consumers may
// append ` mixer_device volume`, ` view selected_device`, etc.). Locked → Live's
// selection path (auto-follows). Unlocked → the pinned canonical path, falling
// back to Live's selection if nothing resolved.
function trackPath() {
    if (locked || !trackPathStr)
        return SEL_TRACK;
    return trackPathStr;
}
exports.trackPath = trackPath;
// Canonical, APPENDABLE path the "current device" should bind to. Locked →
// Live's selection path. Unlocked → the pinned canonical path, or '' when the
// pinned track has no device (consumers must treat '' as "no device").
function devicePath() {
    if (locked)
        return SEL_DEVICE;
    return devicePathStr;
}
exports.devicePath = devicePath;
// Make Knobbler's current track = trackId. Locked: write Live's selection (Live
// cascades back through the path-following observers). Unlocked: retarget the
// pointer + its remembered device, persist, and emit — no Live write.
function selectTrack(id) {
    if (locked) {
        getViewApi().set('selected_track', ['id', id]);
        return;
    }
    var s = getScratch();
    s.id = id;
    if (+s.id === 0)
        return;
    trackId = id;
    trackPathStr = s.unquotedpath;
    // Adopt the track's own remembered device (Live keeps this per-track even
    // when the track isn't globally selected), else clear the device. Guard: a
    // deviceless track's `view selected_device` can resolve to a non-device
    // (Track/Song) — never adopt that, or the device surface points at junk.
    s.path = trackPathStr + ' view selected_device';
    if (isDevice(s)) {
        deviceId = parseInt(s.id);
        devicePathStr = s.unquotedpath;
    }
    else {
        deviceId = 0;
        devicePathStr = '';
    }
    persist();
    emit();
}
exports.selectTrack = selectTrack;
// Make Knobbler's current device = deviceId. Locked: write Live's selection.
// Unlocked: retarget device + its parent track, persist, emit — no Live write.
function selectDevice(id) {
    if (locked) {
        getViewApi().call('select_device', ['id', id]);
        return;
    }
    var s = getScratch();
    s.id = id;
    if (!isDevice(s))
        return;
    deviceId = id;
    devicePathStr = s.unquotedpath;
    var m = devicePathStr.match(TRACK_PATH_RE);
    if (m) {
        s.path = m[1];
        if (+s.id !== 0) {
            trackId = parseInt(s.id);
            trackPathStr = m[1];
        }
    }
    persist();
    emit();
}
exports.selectDevice = selectDevice;
// Lock toggle (OSC /focusLock from the app). Locking re-syncs to Live's current
// selection (path-following resumes); unlocking captures the current selection
// as the starting pointer. Both re-point dependent observers via emit().
function lock(val) {
    var next = !!val;
    if (next === locked) {
        pushLockState();
        return;
    }
    locked = next;
    if (locked) {
        trackId = 0;
        deviceId = 0;
        trackPathStr = '';
        devicePathStr = '';
    }
    else {
        captureFromLiveSelection();
    }
    persist();
    emit();
    pushLockState();
}
exports.lock = lock;
function onChange(cb) {
    listeners.push(cb);
}
exports.onChange = onChange;
function emit() {
    for (var _i = 0, listeners_1 = listeners; _i < listeners_1.length; _i++) {
        var cb = listeners_1[_i];
        cb();
    }
}
// Seed the unlocked pointer from Live's current selection.
function captureFromLiveSelection() {
    var s = getScratch();
    s.path = SEL_TRACK;
    trackId = +s.id === 0 ? 0 : parseInt(s.id);
    trackPathStr = trackId ? s.unquotedpath : '';
    s.path = SEL_DEVICE;
    if (isDevice(s)) {
        deviceId = parseInt(s.id);
        devicePathStr = s.unquotedpath;
    }
    else {
        deviceId = 0;
        devicePathStr = '';
    }
}
// Resolve persisted paths back to ids. Positional paths can go stale across set
// edits; if the track path no longer resolves, fall back to Live's selection.
function restorePointer(tp, dp) {
    var s = getScratch();
    if (tp) {
        s.path = String(tp);
        if (+s.id !== 0) {
            trackId = parseInt(s.id);
            trackPathStr = String(tp);
        }
    }
    if (dp) {
        s.path = String(dp);
        if (+s.id !== 0) {
            deviceId = parseInt(s.id);
            devicePathStr = String(dp);
        }
    }
    if (!trackId)
        captureFromLiveSelection();
}
function persist() {
    ctx.settings.set(KEY_LOCKED, locked ? 1 : 0);
    ctx.settings.set(KEY_TRACK, locked ? '' : trackPathStr);
    ctx.settings.set(KEY_DEVICE, locked ? '' : devicePathStr);
}
function pushLockState() {
    (0, utils_1.osc)('/focusLock', locked ? 1 : 0);
}
var routes = [{ prefix: '/focusLock', parse: 'val', fn: lock }];
exports.routes = routes;
log('reloaded k4-focus');
