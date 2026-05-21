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
exports.gotoDevice = exports.init = exports.routes = void 0;
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var deprecatedMethods_1 = require("./deprecatedMethods");
var k4_bluhandBanks_1 = require("./k4-bluhandBanks");
var Slots = require("./k4-bluhandSlots");
var log = (0, utils_1.logFactory)(config_1.default);
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
    trackNameApi = new LiveAPI(function (args) {
        if (args[0] !== 'name') {
            return;
        }
        trackName = (0, utils_1.dequote)(args[1].toString());
        emitCurrDeviceName();
    }, 'live_set view selected_track');
    trackNameApi.mode = 1;
    trackNameApi.property = 'name';
    deviceNameApi = new LiveAPI(function (args) {
        if (args[0] !== 'name') {
            return;
        }
        deviceName = (0, utils_1.dequote)(args[1].toString());
        emitCurrDeviceName();
    }, 'live_set view selected_track view selected_device');
    deviceNameApi.mode = 1;
    deviceNameApi.property = 'name';
    trackColorApi = new LiveAPI(function (args) {
        if (args[0] !== 'color') {
            return;
        }
        Slots.setColor(args[1].toString());
    }, 'live_set view selected_track');
    trackColorApi.mode = 1;
    trackColorApi.property = 'color';
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
    var api = getLiveSetViewApi();
    var trackId = getParentTrackForDevice(deviceId);
    if (trackId === 0) {
        log('no track for device ' + deviceId);
    }
    else {
        gotoTrack(trackId.toString());
    }
    api.call('select_device', ['id', deviceId]);
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
    var viewApi = getLiveSetViewApi();
    var api = getUtilApi();
    api.id = chainId;
    var devices = (0, utils_1.cleanArr)(api.get('devices'));
    if (devices && devices[0]) {
        viewApi.call('select_device', ['id', devices[0]]);
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
    var api = getLiveSetViewApi();
    api.set('selected_track', ['id', trackId]);
}
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
        selectedDeviceApi = new LiveAPI(consts_1.noFn, 'live_set view selected_track view selected_device');
        selectedDeviceApi.mode = 1;
    }
    return selectedDeviceApi;
}
var liveSetViewApi = null;
function getLiveSetViewApi() {
    if (!liveSetViewApi) {
        liveSetViewApi = new LiveAPI(consts_1.noFn, 'live_set view');
    }
    return liveSetViewApi;
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
function trackDelta(delta) {
    return (0, deprecatedMethods_1.deprecatedTrackDelta)(delta);
}
function deviceDelta(delta) {
    return (0, deprecatedMethods_1.deprecatedDeviceDelta)(delta);
}
function trackPrev() {
    trackDelta(-1);
}
function trackNext() {
    trackDelta(1);
}
function devPrev() {
    deviceDelta(-1);
}
function devNext() {
    deviceDelta(1);
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
    initNameColorObservers();
    if (!state.paramsWatcher) {
        state.paramsWatcher = new LiveAPI(debouncedParameterChange, 'live_set view selected_track view selected_device');
        state.paramsWatcher.mode = 1;
        state.paramsWatcher.property = 'parameters';
    }
    if (!state.variationsWatcher) {
        state.variationsWatcher = new LiveAPI(onVariationChange, 'live_set view selected_track view selected_device');
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
    { prefix: '/bPrevTrack', parse: 'bare', fn: trackPrev },
    { prefix: '/bNextTrack', parse: 'bare', fn: trackNext },
    { prefix: '/bPrevDev', parse: 'bare', fn: devPrev },
    { prefix: '/bNextDev', parse: 'bare', fn: devNext },
    { prefix: '/blu/macros/random', parse: 'bare', fn: randomMacros },
    { prefix: '/blu/variation/new', parse: 'bare', fn: variationNew },
    { prefix: '/blu/variation/delete', parse: 'val', fn: variationDelete },
    { prefix: '/blu/variation/select', parse: 'val', fn: variationRecall },
    { prefix: '/gotoCuePoint', parse: 'val', fn: gotoCuePoint },
    { prefix: '/playCuePoint', parse: 'val', fn: playCuePoint },
    { prefix: '/btnSkipPrev', parse: 'bare', fn: btnSkipPrev },
    { prefix: '/btnSkipNext', parse: 'bare', fn: btnSkipNext },
    { prefix: '/btnReEnableAutomation', parse: 'bare', fn: btnReEnableAutomation },
    { prefix: '/btnLoop', parse: 'bare', fn: btnLoop },
    { prefix: '/btnCaptureMidi', parse: 'bare', fn: btnCaptureMidi },
    { prefix: '/btnArrangementOverdub', parse: 'bare', fn: btnArrangementOverdub },
    { prefix: '/btnSessionRecord', parse: 'bare', fn: btnSessionRecord },
    { prefix: '/bCtlRec', parse: 'bare', fn: ctlRec },
    { prefix: '/bCtlPlay', parse: 'bare', fn: ctlPlay },
    { prefix: '/bCtlStop', parse: 'bare', fn: ctlStop },
    { prefix: '/metronome', parse: 'bare', fn: toggleMetronome },
    { prefix: '/tapTempo', parse: 'bare', fn: tapTempo },
    { prefix: '/tempo', parse: 'val', fn: setTempo, coalesce: true },
    { prefix: '/undo', parse: 'bare', fn: undo },
    { prefix: '/redo', parse: 'bare', fn: redo },
];
exports.routes = routes;
log('reloaded k4-bluhand');
