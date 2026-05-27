"use strict";
// [v8 k4-bluhand] entry node. Single object in the patcher that owns all
// bluhand behavior: device/parameter observers, transport + name/color
// observers, the 16 parameter slots (k4-bluhandSlots), and bank navigation.
// Bank-layout computation lives in k4-bluhandBanks; per-slot parameter control
// lives in k4-bluhandSlots.
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gotoTrack = exports.gotoDevice = exports.init = exports.routes = void 0;
var utils_1 = require("./utils");
var k4_config_1 = require("./k4-config");
var consts_1 = require("./consts");
var k4_bluhandBanks_1 = require("./k4-bluhandBanks");
var Slots = require("./k4-bluhandSlots");
var log = (0, utils_1.logFactory)(k4_config_1.default);
// Orchestrator context (set in init) — used for the cross-module bkMap call.
var ctx = null;
var state = {
    devicePath: null,
    onOffWatcher: null,
    paramsWatcher: null,
    variationsWatcher: null,
    currDeviceId: 0,
    currBank: 1,
    numBanks: 1,
    bankParamArr: [],
    cuePointsWatcher: null,
    cuePointNames: [],
    cuePointTimes: [],
};
// --- Bank display ----------------------------------------------------------
function sendBankNames() {
    var currBankIdx = state.currBank - 1;
    var banks = state.bankParamArr.map(function (bank, idx) {
        return { name: bank.name, sel: idx === currBankIdx };
    });
    (0, utils_1.osc)('/bBanks', banks);
}
var sendCurrBankTask = new Task(sendCurrBank);
function debounceSendCurrBank() {
    sendCurrBankTask.cancel();
    sendCurrBankTask.schedule(20);
}
function sendCurrBank() {
    var currBankIdx = Math.max(0, state.currBank - 1);
    if (!state.bankParamArr || !state.bankParamArr[currBankIdx]) {
        sendBankNames();
        return;
    }
    var bluBank = state.bankParamArr[currBankIdx];
    (0, utils_1.osc)('/bTxtCurrBank', bluBank.name);
    // Bind slots against Knobbler's current device (focus) — Live's selection
    // when locked, its own pointer when unlocked.
    Slots.setDevicePath(ctx.focus.devicePath());
    while (bluBank.paramIdxArr.length < Slots.NUM_BLU_SLOTS) {
        bluBank.paramIdxArr.push(-1);
    }
    bluBank.paramIdxArr.forEach(function (paramIdx, idx) {
        Slots.setParamIdx(idx + 1, paramIdx);
    });
    sendBankNames();
}
function gotoBank(idx) {
    if (idx > 0 && idx <= state.numBanks) {
        state.currBank = idx;
    }
    sendCurrBank();
}
function bankNext() {
    if (state.currBank < state.numBanks) {
        state.currBank++;
    }
    sendCurrBank();
}
function bankPrev() {
    if (state.currBank > 0) {
        state.currBank--;
    }
    sendCurrBank();
}
// --- Slot message handlers (delegate to k4-bluhandSlots) -------------------
// new value over OSC for a bluhand slot
function val(slot, value) {
    Slots.val(slot, value);
}
// reset a bluhand slot to its parameter default (router msg renamed from
// 'default' since that is a reserved word and cannot be a [v8] function)
function bSetDefault(slot) {
    Slots.setDefault(slot);
}
// map the parameter currently shown in bluhand slot `bluSlot` onto knobbler
// slot `knobblerSlot`
function bkMap(bluSlot, knobblerSlot) {
    var paramId = Slots.getParamId(bluSlot);
    if (paramId === 0) {
        return;
    }
    ctx.knobbler.bkMap(knobblerSlot, paramId);
}
// --- Selected device parameter tracking ------------------------------------
var pcDebounce = new Task(onParameterChange);
function debouncedParameterChange(args) {
    if (args[0].toString() !== 'parameters') {
        return;
    }
    pcDebounce.cancel();
    pcDebounce.schedule(20);
}
function onParameterChange() {
    var api = state.paramsWatcher;
    if (+api.id === 0) {
        return;
    }
    var isSupported = (0, utils_1.isDeviceSupported)(api);
    var deviceType = isSupported ? api.get('class_name').toString() : api.type;
    var paramIds = isSupported ? (0, utils_1.cleanArr)(api.get('parameters')) : [];
    if (paramIds.length === 0) {
        state.onOffWatcher && (state.onOffWatcher.id = 0);
    }
    else {
        var onOffParamId = paramIds.shift(); // remove device on/off
        if (!state.onOffWatcher) {
            state.onOffWatcher = new LiveAPI(updateDeviceOnOff, 'id ' + onOffParamId);
            state.onOffWatcher.property = 'value';
        }
        else {
            state.onOffWatcher.id = onOffParamId;
        }
    }
    var canHaveChains = (0, utils_1.isDeviceSupported)(api) && parseInt(api.get('can_have_chains'));
    if (canHaveChains) {
        // see if we should slice off some macros
        var numMacros = parseInt(api.get('visible_macro_count'));
        if (numMacros) {
            paramIds = paramIds.slice(0, numMacros);
            if (numMacros > 1) {
                // put filler in the macros to look more like the
                // even 2-row split that Live shows
                var halfMacros = numMacros / 2;
                var filler = Array(8 - halfMacros);
                for (var i = 0; i < filler.length; i++) {
                    filler[i] = 0;
                }
                paramIds = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], paramIds.slice(0, halfMacros), true), filler, true), paramIds.slice(halfMacros, numMacros), true), filler, true);
            }
        }
    }
    if (state.paramsWatcher.id !== state.currDeviceId) {
        // changed device, reset bank
        state.currBank = 1;
        state.currDeviceId = state.paramsWatcher.id;
    }
    state.devicePath = api.unquotedpath;
    // Re-point the header track name/color at the new device's OWNING track. This
    // is the one place that knows the device actually changed (in both lock
    // modes), so the header follows the device, not Live's selected track.
    var tp = deviceTrackPath();
    repoint(trackNameApi, tp, 'name');
    repoint(trackColorApi, tp, 'color');
    if (!canHaveChains) {
        // null send variation stuff
        (0, utils_1.osc)('/blu/variations', '');
    }
    else {
        // Push variation state from here (the reliable 'parameters' observer that
        // fires on every device selection) rather than relying solely on the
        // variation_count observer, which only exists on racks and fires
        // unreliably when selection follows into one.
        var varCount = +api.get('variation_count');
        var varSelected = +api.get('selected_variation_index');
        (0, utils_1.osc)('/blu/variations', { count: varCount, selected: varSelected });
    }
    state.bankParamArr = (0, k4_bluhandBanks_1.getBankParamArr)(paramIds, deviceType, api);
    state.numBanks = state.bankParamArr.length;
    if (state.currBank > state.numBanks) {
        state.currBank = state.numBanks;
    }
    debounceSendCurrBank();
}
function toggleOnOff() {
    if (!state.onOffWatcher) {
        return;
    }
    var currVal = parseInt(state.onOffWatcher.get('value'));
    state.onOffWatcher.set('value', currVal ? 0 : 1);
}
function updateDeviceOnOff(iargs) {
    var args = arrayfromargs(iargs);
    if (args[0] === 'value') {
        (0, utils_1.osc)('/bOnOff', parseInt(args[1]));
    }
}
// --- Variations ------------------------------------------------------------
function onVariationChange() {
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        return;
    }
    var varCount = +api.get('variation_count');
    var varSelected = +api.get('selected_variation_index');
    (0, utils_1.osc)('/blu/variations', { count: varCount, selected: varSelected });
}
function variationNew() {
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        return;
    }
    api.call('store_variation');
    var numVariations = +api.get('variation_count') || 1;
    api.set('selected_variation_index', numVariations - 1);
    onVariationChange();
}
function variationDelete(idx) {
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        return;
    }
    api.set('selected_variation_index', idx);
    api.call('delete_selected_variation');
}
function variationRecall(idx) {
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        return;
    }
    api.set('selected_variation_index', idx);
    api.call('recall_selected_variation');
    onVariationChange();
}
function randomMacros() {
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        return;
    }
    api.call('randomize_macros');
}
// --- Cue points ------------------------------------------------------------
function sendCuePoints() {
    var api = getUtilApi();
    api.goto('live_set');
    var numerator = parseFloat(api.get('signature_numerator').toString());
    if (typeof numerator !== 'number' || numerator <= 0) {
        numerator = 4;
        log('Warning: Could not retrieve time signature. Defaulting to 4/4.');
    }
    var result = state.cuePointNames.map(function (cuePoint, idx) {
        var cuePointTime = parseFloat(cuePoint.get('time'));
        var rawBarIndex = Math.floor(cuePointTime / numerator);
        var rawBeatIndex = cuePointTime % numerator;
        var displayBar = rawBarIndex + 1;
        var displayBeat = rawBeatIndex + 1;
        displayBeat = Math.floor(displayBeat);
        var displaySixteenths = Math.floor((cuePointTime % 1.0) * 4) + 1;
        var disp = displayBar + '.' + displayBeat + '.' + displaySixteenths;
        return {
            idx: idx,
            name: cuePoint.get('name').toString(),
            time: cuePointTime,
            disp: disp,
        };
    });
    (0, utils_1.osc)('/cuePoints', result);
}
var sendCuePointsTask = new Task(sendCuePoints);
function debounceSendCuePoints() {
    sendCuePointsTask.cancel();
    sendCuePointsTask.schedule(20);
}
function onCuePointNameChange(args) {
    if (args[0] !== 'name') {
        return;
    }
    debounceSendCuePoints();
}
function onCuePointTimeChange(args) {
    if (args[0] !== 'time') {
        return;
    }
    debounceSendCuePoints();
}
function cuePointsChange(args) {
    if (args[0] !== 'cue_points') {
        return;
    }
    var cuePointIds = (0, utils_1.cleanArr)(arrayfromargs(args));
    // Detach the previous per-cue-point observers before dropping them. An armed
    // LiveAPI left for GC fires its callback during finalization (jsliveapi_free
    // inside a V8 weak-callback), which executes JS mid-GC and aborts Live.
    state.cuePointNames.forEach(utils_1.detach);
    state.cuePointTimes.forEach(utils_1.detach);
    state.cuePointNames = [];
    state.cuePointTimes = [];
    for (var _i = 0, cuePointIds_1 = cuePointIds; _i < cuePointIds_1.length; _i++) {
        var cuePointId = cuePointIds_1[_i];
        var nameApi = new LiveAPI(onCuePointNameChange, 'id ' + cuePointId);
        nameApi.property = 'name';
        state.cuePointNames.push(nameApi);
        var timeApi = new LiveAPI(onCuePointTimeChange, 'id ' + cuePointId);
        timeApi.property = 'time';
        state.cuePointTimes.push(timeApi);
    }
    debounceSendCuePoints();
}
function playCuePoint(val) {
    var api = new LiveAPI(null, 'live_set cue_points ' + val);
    if (api.id) {
        api.call('jump');
        var ctlApi = getLiveSetApi();
        var isPlaying = parseInt(ctlApi.get('is_playing'));
        if (!isPlaying) {
            ctlApi.call('start_playing');
        }
    }
}
function gotoCuePoint(val) {
    var api = new LiveAPI(null, 'live_set cue_points ' + val);
    if (api.id) {
        api.call('jump');
    }
}
// Toggle a cue point at the current playhead (Live's transport 'Set' button).
// The cue_points observer re-pushes /cuePoints afterward.
function addCuePoint() {
    getLiveSetApi().call('set_or_delete_cue');
}
// Rename: /renameCuePoint/<idx> carries the new name as its value.
function renameCuePoint(address, value) {
    var m = address.match(/\/(\d+)$/);
    if (!m) {
        return;
    }
    var api = new LiveAPI(null, 'live_set cue_points ' + parseInt(m[1]));
    if (api.id) {
        api.set('name', String(value));
    }
}
// Delete: jump to the cue (so the playhead sits on it) then toggle it off —
// there's no direct cue-point delete in the Live API.
function deleteCuePoint(val) {
    var api = new LiveAPI(null, 'live_set cue_points ' + val);
    if (api.id) {
        api.call('jump');
        getLiveSetApi().call('set_or_delete_cue');
    }
}
// --- Transport observers ---------------------------------------------------
var transportObservers = [];
var TRANSPORT_MAP = [
    ['is_playing', '/isPlaying'],
    ['loop', '/loop'],
    ['tempo', '/tempo'],
    ['metronome', '/metronome'],
    ['record_mode', '/recordMode'],
    ['session_record', '/sessionRecord'],
    ['arrangement_overdub', '/arrangementOverdub'],
    ['re_enable_automation_enabled', '/reEnableAutomationEnabled'],
    ['loop_start', '/loopStart'],
    ['loop_length', '/loopLength'],
    ['back_to_arranger', '/backToArranger'],
];
function makeTransportCb(prop, addr) {
    return function (args) {
        if (args[0] !== prop) {
            return;
        }
        (0, utils_1.osc)(addr, parseFloat(args[1]));
    };
}
function initTransportObservers() {
    if (transportObservers.length) {
        return;
    }
    for (var _i = 0, TRANSPORT_MAP_1 = TRANSPORT_MAP; _i < TRANSPORT_MAP_1.length; _i++) {
        var pair = TRANSPORT_MAP_1[_i];
        var api = new LiveAPI(makeTransportCb(pair[0], pair[1]), 'live_set');
        api.property = pair[0];
        transportObservers.push(api);
    }
}
// --- Song position (transport playhead, 'pos' capability) ------------------
// The playhead is OBSERVED (`current_song_time`) and the outbound send is
// throttled to ~20Hz (trailing edge) — the observer fires every few ms during
// playback, so an unthrottled send would flood OSC. This also covers the
// stopped case: a cue-point jump or /scrub moves current_song_time, the
// observer fires, and the new position is sent. Song length (`last_event_time`)
// is NOT observable, so it is polled on a slow always-on timer (it grows during
// recording / arrangement edits). The time signature IS observable. The app
// uses songPos/songLen for the graphical timeline and songSig to render
// bar.beat.16th. Inbound /scrub sets current_song_time.
var SONG_POS_THROTTLE_MS = 50;
var SONG_LEN_POLL_MS = 500;
var songPosApi = null;
var songPosTask = null;
var songPosPending = false;
var pendingSongPos = 0;
var songLenTask = null;
var lastSongPos = -1;
var lastSongLen = -1;
var songSigNumApi = null;
var songSigDenApi = null;
// Trailing-edge flush: emit at most one /songPos per throttle window.
function flushSongPos() {
    if (!songPosPending) {
        return;
    }
    songPosPending = false;
    if (pendingSongPos !== lastSongPos) {
        lastSongPos = pendingSongPos;
        (0, utils_1.osc)('/songPos', pendingSongPos);
    }
}
function onSongPosChange(args) {
    if (args[0] !== 'current_song_time') {
        return;
    }
    pendingSongPos = parseFloat(args[1]);
    if (!songPosPending) {
        songPosPending = true;
        songPosTask.schedule(SONG_POS_THROTTLE_MS);
    }
}
// Force-read and send the current position (reconnect / refresh path).
function sendSongPos() {
    var pos = parseFloat(getLiveSetApi().get('current_song_time'));
    if (pos !== lastSongPos) {
        lastSongPos = pos;
        (0, utils_1.osc)('/songPos', pos);
    }
}
function sendSongLen() {
    var len = parseFloat(getLiveSetApi().get('last_event_time'));
    if (len !== lastSongLen) {
        lastSongLen = len;
        (0, utils_1.osc)('/songLen', len);
    }
}
function sendSongSig() {
    var api = getLiveSetApi();
    (0, utils_1.osc)('/songSig', [
        parseInt(api.get('signature_numerator')),
        parseInt(api.get('signature_denominator')),
    ]);
}
function initSongPosObservers() {
    if (songLenTask) {
        return;
    }
    songPosTask = new Task(flushSongPos);
    songPosApi = new LiveAPI(onSongPosChange, 'live_set');
    songPosApi.property = 'current_song_time';
    // last_event_time isn't observable — poll it on a slow always-on timer.
    songLenTask = new Task(function () {
        sendSongLen();
        songLenTask.schedule(SONG_LEN_POLL_MS);
    });
    songLenTask.schedule(SONG_LEN_POLL_MS);
    songSigNumApi = new LiveAPI(function (args) {
        if (args[0] === 'signature_numerator') {
            sendSongSig();
        }
    }, 'live_set');
    songSigNumApi.property = 'signature_numerator';
    songSigDenApi = new LiveAPI(function (args) {
        if (args[0] === 'signature_denominator') {
            sendSongSig();
        }
    }, 'live_set');
    songSigDenApi.property = 'signature_denominator';
}
function scrub(beats) {
    getLiveSetApi().set('current_song_time', Math.max(0, beats));
    sendSongPos();
}
// Arrangement loop brace. loop_start / loop_length echo back via the transport
// observers, so the app's loop handles converge after a drag.
function setLoopStart(beats) {
    getLiveSetApi().set('loop_start', Math.max(0, beats));
}
function setLoopLength(beats) {
    getLiveSetApi().set('loop_length', Math.max(0, beats));
}
// --- Selected track/device name + track color ------------------------------
var trackName = '';
var deviceName = '';
var trackNameApi = null;
var deviceNameApi = null;
var trackColorApi = null;
function emitCurrDeviceName() {
    (0, utils_1.osc)('/bcurrDeviceName', trackName + ' > ' + deviceName);
}
function initNameColorObservers() {
    if (trackNameApi) {
        return;
    }
    // Registered once (this block is guarded): re-point our current-track/device
    // observers whenever Knobbler's focus pointer moves (unlocked nav / lock flip).
    ctx.focus.onChange(rebindFocusHandles);
    trackNameApi = new LiveAPI(function (args) {
        if (args[0] !== 'name') {
            return;
        }
        trackName = (0, utils_1.dequote)(args[1].toString());
        emitCurrDeviceName();
    }, deviceTrackPath());
    trackNameApi.mode = 1;
    trackNameApi.property = 'name';
    deviceNameApi = new LiveAPI(function (args) {
        if (args[0] !== 'name') {
            return;
        }
        deviceName = (0, utils_1.dequote)(args[1].toString());
        emitCurrDeviceName();
    }, ctx.focus.devicePath());
    deviceNameApi.mode = 1;
    deviceNameApi.property = 'name';
    trackColorApi = new LiveAPI(function (args) {
        if (args[0] !== 'color') {
            return;
        }
        Slots.setColor(args[1].toString());
    }, deviceTrackPath());
    trackColorApi.mode = 1;
    trackColorApi.property = 'color';
}
// Matches the top-level track prefix of a device's canonical path (mirrors
// k4-focus's TRACK_PATH_RE). Anchored at the start so a nested-chain device
// (`live_set tracks 3 devices 0 chains 1 devices 0`) still resolves to its
// top-level track.
var TRACK_PATH_RE = /^(live_set (?:tracks \d+|return_tracks \d+|master_track))/;
// The track that OWNS the currently displayed device, derived from the device's
// concrete path (state.devicePath — set from the resolved device's unquotedpath
// on every device change, so it's concrete in both lock modes, unlike
// focus.devicePath() which is Live's literal selection path while locked). The
// bluhand header (track name + color) describes the device being controlled, so
// it must follow THAT device's track — not Live's current selection, which can
// move to a deviceless track while the displayed device (and its params) stay
// put. state.devicePath is never cleared, so it holds the last real device:
// navigating to a deviceless track leaves the header on that device's track.
// Empty only before the first device is shown.
function deviceTrackPath() {
    if (!state.devicePath)
        return '';
    var m = state.devicePath.match(TRACK_PATH_RE);
    return m ? m[1] : '';
}
// Re-point a mode-1 property observer at a new canonical path. Clearing the
// property first, then re-setting it, re-fires the callback with the new
// target's current value — so the surface re-syncs on retarget. An empty target
// (unlocked track with no device) detaches the observer (id 0 → reads nothing).
function repoint(api, target, prop) {
    if (!api)
        return;
    api.property = '';
    if (target) {
        api.path = target;
        api.mode = 1;
        api.property = prop;
    }
    else {
        api.id = 0;
    }
}
// Focus changed (unlocked nav, or a lock/unlock transition): re-point every
// "current track/device" observer at Knobbler's new target. In locked mode the
// targets are Live's selection paths (auto-following), so this only fires on
// unlock-mode navigation and lock transitions — see k4-focus.
function rebindFocusHandles() {
    var dp = ctx.focus.devicePath();
    // Track name/color are NOT repointed here: they follow the displayed device's
    // owning track, repointed in onParameterChange when the device actually
    // changes. Repointing paramsWatcher below re-fires that (debouncedParameter
    // change), and on a deviceless target it stays put — exactly what we want.
    repoint(deviceNameApi, dp, 'name');
    repoint(state.paramsWatcher, dp, 'parameters');
    repoint(state.variationsWatcher, dp, 'variation_count');
    if (selectedDeviceApi) {
        if (dp) {
            selectedDeviceApi.path = dp;
            selectedDeviceApi.mode = 1;
        }
        else {
            selectedDeviceApi.id = 0;
        }
    }
    // Slots + banks follow the new device: paramsWatcher's repoint re-fires
    // debouncedParameterChange, which rebuilds the bank/slot bindings.
}
// Re-push all bluhand state to a (re)connecting client. Called at the end of
// init() so the existing 'init' trigger (fired on app refresh) re-syncs the
// client; [v8] reserves the `refresh` selector, so we never route it here.
function pushState() {
    var api = getLiveSetApi();
    for (var _i = 0, TRANSPORT_MAP_2 = TRANSPORT_MAP; _i < TRANSPORT_MAP_2.length; _i++) {
        var pair = TRANSPORT_MAP_2[_i];
        (0, utils_1.osc)(pair[1], parseFloat(api.get(pair[0])));
    }
    sendSongSig();
    // Force a fresh push for a reconnecting/refreshing client.
    lastSongPos = -1;
    lastSongLen = -1;
    sendSongPos();
    sendSongLen();
    // Cue points aren't re-emitted by the cue_points watcher on a refresh (it
    // only fires on creation), so re-push them here for a reconnecting client
    // whose osc cache was cleared on /ack.
    debounceSendCuePoints();
    emitCurrDeviceName();
    onVariationChange();
    sendCurrBank();
}
// --- Navigation ------------------------------------------------------------
function unfoldParentTracks(objId) {
    var util = getUtilApi();
    util.id = objId;
    if (+util.id === 0) {
        return;
    }
    var counter = 0;
    while (counter < 20) {
        var isFoldable = util.type === 'Track' && parseInt(util.get('is_foldable'));
        if (isFoldable) {
            var foldState = parseInt(util.get('fold_state'));
            if (foldState === 1) {
                util.set('fold_state', 0);
            }
        }
        util.id = parseInt(util.get('canonical_parent')[1]);
        if (util.type === 'Song') {
            break;
        }
        counter++;
    }
}
function getParentTrackForDevice(deviceId) {
    var util = new LiveAPI(consts_1.noFn, 'id ' + deviceId);
    if ((0, utils_1.isDeviceSupported)(util)) {
        var counter = 0;
        while (counter < 20) {
            util.id = parseInt(util.get('canonical_parent')[1]);
            if (util.type === 'Track') {
                return +util.id;
            }
            counter++;
        }
    }
    return 0;
}
function gotoDevice(deviceIdStr) {
    var deviceId = parseInt(deviceIdStr);
    if (deviceId === 0) {
        return;
    }
    var trackId = getParentTrackForDevice(deviceId);
    if (trackId === 0) {
        log('no track for device ' + deviceId);
    }
    else {
        gotoTrack(trackId.toString());
    }
    ctx.focus.selectDevice(deviceId);
}
exports.gotoDevice = gotoDevice;
function hideChains(deviceId) {
    var obj = new LiveAPI(consts_1.noFn, 'id ' + deviceId);
    if (+obj.id === 0) {
        return;
    }
    if ((0, utils_1.isDeviceSupported)(obj) && +obj.get('can_have_chains')) {
        obj.goto('view');
        obj.set('is_showing_chain_devices', 0);
    }
}
function gotoChain(chainIdStr) {
    var chainId = parseInt(chainIdStr);
    unfoldParentTracks(chainId);
    var api = getUtilApi();
    api.id = chainId;
    var devices = (0, utils_1.cleanArr)(api.get('devices'));
    if (devices && devices[0]) {
        ctx.focus.selectDevice(parseInt(devices[0]));
        return;
    }
}
function toggleGroup(groupId) {
    var util = getUtilApi();
    util.id = groupId;
    if (+util.id === 0) {
        log('ERROR: Invalid id ' + groupId);
        return;
    }
    var isFoldable = util.type === 'Track' && parseInt(util.get('is_foldable'));
    if (!isFoldable) {
        log('ERROR: Not foldable ' + groupId);
    }
    var foldState = parseInt(util.get('fold_state'));
    util.set('fold_state', foldState ? 0 : 1);
}
function gotoTrack(trackIdStr) {
    var trackId = parseInt(trackIdStr);
    var util = getUtilApi();
    util.id = trackId;
    if (+util.id !== 0) {
        var counter = 0;
        while (counter < 20) {
            var groupIds = (0, utils_1.cleanArr)(util.get('group_track'));
            if (!groupIds.length)
                break;
            util.id = groupIds[0];
            if (+util.id === 0)
                break;
            var foldState = parseInt(util.get('fold_state').toString());
            if (foldState === 1) {
                util.set('fold_state', 0);
            }
            counter++;
        }
    }
    ctx.focus.selectTrack(trackId);
}
exports.gotoTrack = gotoTrack;
// --- Reusable LiveAPI handles ----------------------------------------------
var utilApi = null;
function getUtilApi() {
    if (!utilApi) {
        utilApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    return utilApi;
}
var selectedDeviceApi = null;
function getSelectedDeviceApi() {
    if (!selectedDeviceApi) {
        selectedDeviceApi = new LiveAPI(consts_1.noFn, ctx.focus.devicePath());
        selectedDeviceApi.mode = 1;
    }
    return selectedDeviceApi;
}
var liveSetApi = null;
function getLiveSetApi() {
    if (!liveSetApi) {
        liveSetApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    return liveSetApi;
}
// --- Transport controls ----------------------------------------------------
function toggleMetronome() {
    var api = getLiveSetApi();
    var metroVal = parseInt(api.get('metronome'));
    api.set('metronome', metroVal ? 0 : 1);
}
function tapTempo() {
    var api = getLiveSetApi();
    api.call('tap_tempo');
}
function setTempo(val) {
    var api = getLiveSetApi();
    api.set('tempo', val);
}
function btnSkipPrev() {
    getLiveSetApi().call('jump_to_prev_cue');
}
function btnSkipNext() {
    getLiveSetApi().call('jump_to_next_cue');
}
function btnReEnableAutomation() {
    getLiveSetApi().call('re_enable_automation');
}
function btnLoop() {
    var ctlApi = getLiveSetApi();
    var isLoop = parseInt(ctlApi.get('loop'));
    ctlApi.set('loop', isLoop ? 0 : 1);
}
function btnCaptureMidi() {
    getLiveSetApi().call('capture_midi');
}
function btnArrangementOverdub() {
    var ctlApi = getLiveSetApi();
    var isOverdub = parseInt(ctlApi.get('arrangement_overdub'));
    ctlApi.set('arrangement_overdub', isOverdub ? 0 : 1);
}
function btnSessionRecord() {
    var ctlApi = getLiveSetApi();
    var isRecord = parseInt(ctlApi.get('session_record'));
    ctlApi.set('session_record', isRecord ? 0 : 1);
}
// "Back to Arrangement" — Live sets back_to_arranger to 1 when session clips
// override the arrangement; the button only returns to the arrangement (sets 0).
function btnBackToArranger() {
    getLiveSetApi().set('back_to_arranger', 0);
}
function ctlRec() {
    var ctlApi = getLiveSetApi();
    var currMode = parseInt(ctlApi.get('record_mode'));
    ctlApi.set('record_mode', currMode === 1 ? 0 : 1);
}
function ctlPlay() {
    getLiveSetApi().call('start_playing');
}
function ctlStop() {
    getLiveSetApi().call('stop_playing');
}
function undo() {
    getLiveSetApi().call('undo');
}
function redo() {
    getLiveSetApi().call('redo');
}
// --- Init ------------------------------------------------------------------
// Idempotent: 'init' fires on every app refresh, not just load. Creating an
// observer re-fires it with the current value, so first-time setup pushes all
// state; pushState() covers the re-refresh case where observers already exist.
function init(c) {
    (0, utils_1.setOscSink)(c.osc);
    Slots.bindOsc(c.osc);
    ctx = c;
    Slots.initSlots();
    initTransportObservers();
    initSongPosObservers();
    initNameColorObservers();
    if (!state.paramsWatcher) {
        state.paramsWatcher = new LiveAPI(debouncedParameterChange, ctx.focus.devicePath());
        state.paramsWatcher.mode = 1;
        state.paramsWatcher.property = 'parameters';
    }
    if (!state.variationsWatcher) {
        state.variationsWatcher = new LiveAPI(onVariationChange, ctx.focus.devicePath());
        state.variationsWatcher.mode = 1;
        state.variationsWatcher.property = 'variation_count';
    }
    if (!state.cuePointsWatcher) {
        state.cuePointsWatcher = new LiveAPI(cuePointsChange, 'live_set');
        state.cuePointsWatcher.property = 'cue_points';
    }
    pushState();
}
exports.init = init;
// --- Route table (the module's slice of the OSC namespace) -----------------
// Dispatched by the [v8 knobbler] entry via direct function calls. Mirrors the
// old router's OUTLET_BLUHAND entries (parse kind = old handler: bare=bareMsg,
// val=stdVal, slot=stdSlot, slotVal=stdSlotVal).
var routes = [
    { prefix: '/bval', parse: 'slotVal', fn: val, coalesce: true },
    { prefix: '/bkMap', parse: 'slotVal', fn: bkMap },
    { prefix: '/bBank', parse: 'slot', fn: gotoBank },
    { prefix: '/bbankPrev', parse: 'bare', fn: bankPrev },
    { prefix: '/bbankNext', parse: 'bare', fn: bankNext },
    { prefix: '/bdefaultbval', parse: 'slot', fn: bSetDefault },
    { prefix: '/bdefault bval', parse: 'slot', fn: bSetDefault },
    { prefix: '/toggleOnOff', parse: 'bare', fn: toggleOnOff },
    { prefix: '/hideChains', parse: 'val', fn: hideChains },
    { prefix: '/toggleGroup', parse: 'val', fn: toggleGroup },
    { prefix: '/gotoTrack', parse: 'val', fn: gotoTrack },
    { prefix: '/gotoChain', parse: 'val', fn: gotoChain },
    { prefix: '/gotoDevice', parse: 'val', fn: gotoDevice },
    { prefix: '/blu/macros/random', parse: 'bare', fn: randomMacros },
    { prefix: '/blu/variation/new', parse: 'bare', fn: variationNew },
    { prefix: '/blu/variation/delete', parse: 'val', fn: variationDelete },
    { prefix: '/blu/variation/select', parse: 'val', fn: variationRecall },
    { prefix: '/gotoCuePoint', parse: 'val', fn: gotoCuePoint },
    { prefix: '/playCuePoint', parse: 'val', fn: playCuePoint },
    { prefix: '/addCuePoint', parse: 'bare', fn: addCuePoint },
    { prefix: '/renameCuePoint', parse: 'custom', fn: renameCuePoint },
    { prefix: '/deleteCuePoint', parse: 'val', fn: deleteCuePoint },
    { prefix: '/btnSkipPrev', parse: 'bare', fn: btnSkipPrev },
    { prefix: '/btnSkipNext', parse: 'bare', fn: btnSkipNext },
    { prefix: '/btnReEnableAutomation', parse: 'bare', fn: btnReEnableAutomation },
    { prefix: '/btnLoop', parse: 'bare', fn: btnLoop },
    { prefix: '/btnCaptureMidi', parse: 'bare', fn: btnCaptureMidi },
    { prefix: '/btnArrangementOverdub', parse: 'bare', fn: btnArrangementOverdub },
    { prefix: '/btnSessionRecord', parse: 'bare', fn: btnSessionRecord },
    { prefix: '/btnBackToArranger', parse: 'bare', fn: btnBackToArranger },
    { prefix: '/bCtlRec', parse: 'bare', fn: ctlRec },
    { prefix: '/bCtlPlay', parse: 'bare', fn: ctlPlay },
    { prefix: '/bCtlStop', parse: 'bare', fn: ctlStop },
    { prefix: '/scrub', parse: 'val', fn: scrub, coalesce: true },
    { prefix: '/loopStart', parse: 'val', fn: setLoopStart, coalesce: true },
    { prefix: '/loopLength', parse: 'val', fn: setLoopLength, coalesce: true },
    { prefix: '/metronome', parse: 'bare', fn: toggleMetronome },
    { prefix: '/tapTempo', parse: 'bare', fn: tapTempo },
    { prefix: '/tempo', parse: 'val', fn: setTempo, coalesce: true },
    { prefix: '/undo', parse: 'bare', fn: undo },
    { prefix: '/redo', parse: 'bare', fn: redo },
];
exports.routes = routes;
log('reloaded k4-bluhand');
