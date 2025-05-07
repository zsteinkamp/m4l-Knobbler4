"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var k4_deviceParamMaps_1 = require("./k4-deviceParamMaps");
var deprecatedMethods_1 = require("./deprecatedMethods");
var deviceParams_1 = require("./deviceParams");
autowatch = 1;
inlets = 1;
outlets = 2;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setinletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
setinletassist(consts_1.OUTLET_MSGS, 'Output messages to the [poly finger] instances to set their parameter index');
var paramNameToIdx = null;
var state = {
    devicePath: null,
    onOffWatcher: null,
    paramsWatcher: null,
    variationsWatcher: null,
    currDeviceId: 0,
    currBank: 1,
    numBanks: 1,
    bankParamArr: [],
    nameLookupCache: {},
};
function getMaxBanksParamArr(bankCount, deviceObj) {
    var rawBanks = [];
    //log('BANK_COUNT ' + bankCount)
    for (var i = 0; i < bankCount; i++) {
        var bankName = deviceObj.call('get_bank_name', i);
        var bankParams = deviceObj.call('get_bank_parameters', i);
        //log(
        //  ' BANK ROW ' + JSON.stringify({ name: bankName, paramIdxArr: bankParams })
        //)
        rawBanks.push({ name: bankName, paramIdxArr: bankParams });
    }
    var ret = [];
    for (var i = 0; rawBanks[i]; i++) {
        var oddBank = rawBanks[i];
        var evenBank = rawBanks[++i];
        if (oddBank && evenBank) {
            ret.push({
                name: oddBank.name + ' / ' + evenBank.name,
                paramIdxArr: __spreadArray(__spreadArray([], oddBank.paramIdxArr, true), evenBank.paramIdxArr, true),
            });
        }
        else {
            ret.push(oddBank);
        }
    }
    return ret;
}
function getBasicParamArr(paramIds) {
    //log('GET BASIC ' + paramIds.join(','))
    var ret = [];
    var currBank = 0;
    var blankRow = function () {
        return {
            name: 'Page ' + ++currBank,
            paramIdxArr: [],
        };
    };
    var currRow = null;
    var idx = 0;
    paramIds.forEach(function (paramId) {
        // set up a new row for the first one
        if (idx % 16 === 0) {
            if (currRow) {
                ret.push(currRow);
            }
            currRow = blankRow();
        }
        if (paramId === 0) {
            // special case filler
            currRow.paramIdxArr.push(-1);
        }
        else {
            currRow.paramIdxArr.push(idx + 1);
            idx++; // only increment here
        }
    });
    if (currRow) {
        ret.push(currRow);
    }
    //log('RET ' + JSON.stringify(ret))
    return ret;
}
function getBankParamArr(paramIds, deviceType, deviceObj) {
    if (deviceParams_1.MAX_DEVICES.indexOf(deviceType) > -1) {
        // Max device, look for live.banks
        var bankCount = deviceObj.call('get_bank_count', null) || 0;
        if (bankCount > 0) {
            return getMaxBanksParamArr(bankCount, deviceObj);
        }
    }
    // deviceParamMap is custom or crafted parameter organization
    //log('BBANKS ' + deviceType)
    //log('BBANKS INFO ' + deviceObj.info.toString())
    var deviceParamMap = (0, k4_deviceParamMaps_1.deviceParamMapFor)(deviceType);
    if (!deviceParamMap) {
        var paramArr = getBasicParamArr(paramIds);
        // nothing to customize, return the basic array
        //log('BASIC RETURN ' + JSON.stringify(paramArr))
        return paramArr;
    }
    var ret = [];
    // cache id to name mapping because it is super slow with giant devices like
    // Operator and honestly it should just be a compile-time step of the data
    // files that need this information. frankly this is stupid and should be
    // burned.
    var lookupCacheKey = deviceObj.id;
    paramNameToIdx = state.nameLookupCache[lookupCacheKey];
    if (!paramNameToIdx) {
        //log('CACHE MISS ' + lookupCacheKey)
        paramNameToIdx = {};
        // more "bespoke" setups get this
        var param_1 = getUtilApi();
        paramIds.forEach(function (paramId, idx) {
            if (paramId <= 0) {
                return;
            }
            param_1.id = paramId;
            paramNameToIdx[param_1.get('name').toString()] = idx;
            //log(`NAME TO IDX [${param.get('name')}]=${idx}`)
        });
        state.nameLookupCache[lookupCacheKey] = paramNameToIdx;
    }
    deviceParamMap.forEach(function (nameBank, idx) {
        var row = {
            name: nameBank.name,
            paramIdxArr: [],
        };
        nameBank.paramNames.forEach(function (paramName) {
            var found = false;
            var pIdx = null;
            if (typeof paramName === 'number') {
                // can specify a param index instead of a name in the data structure
                row.paramIdxArr.push(paramName);
                return;
            }
            for (var _i = 0, _a = paramName.toString().split('|'); _i < _a.length; _i++) {
                var singleName = _a[_i];
                // can have multiple options pipe-separated (e.g. for meld)
                pIdx = paramNameToIdx[singleName];
                //log('IS IT ' + pIdx)
                if (pIdx !== undefined) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                // the world of parameters is a complicated one
                //log(
                //  'ERROR (' +
                //    deviceType +
                //    ') NO pIDX FOR NAME ' +
                //    paramName +
                //    ' ' +
                //    JSON.stringify(Object.keys(paramNameToIdx))
                //)
                return;
            }
            row.paramIdxArr.push(pIdx + 1);
        });
        //log('ROW ' + JSON.stringify(row))
        ret.push(row);
    });
    //log('PARAMARRFINAL ' + JSON.stringify(ret))
    return ret;
}
function sendBankNames() {
    var currBankIdx = state.currBank - 1;
    var banks = state.bankParamArr.map(function (bank, idx) {
        return { name: bank.name, sel: idx === currBankIdx };
    });
    //log('BANKS: ' + JSON.stringify(banks))
    outlet(consts_1.OUTLET_OSC, ['/bBanks', JSON.stringify(banks)]);
}
function sendCurrBank() {
    //log('SEND CURR BANK ' + JSON.stringify(state))
    var currBankIdx = Math.max(0, state.currBank - 1);
    if (!state.bankParamArr || !state.bankParamArr[currBankIdx]) {
        //log('EARLY ' + JSON.stringify(state.bankParamArr) + ' ' + currBankIdx)
        sendBankNames();
        return;
    }
    var bluBank = state.bankParamArr[currBankIdx];
    outlet(consts_1.OUTLET_OSC, ['/bTxtCurrBank', bluBank.name]);
    while (bluBank.paramIdxArr.length < 16) {
        bluBank.paramIdxArr.push(-1);
    }
    //log('MADE IT ' + JSON.stringify(bluBank))
    bluBank.paramIdxArr.forEach(function (paramIdx, idx) {
        outlet(consts_1.OUTLET_MSGS, ['target', idx + 1]);
        outlet(consts_1.OUTLET_MSGS, ['paramIdx', paramIdx]);
        //log(JSON.stringify({ str: 'MSG', target: idx + 1, paramIdx }))
    });
    sendBankNames();
}
function unfoldParentTracks(objId) {
    var util = getUtilApi();
    util.id = objId;
    //log('GOTO TRACK ' + trackId + ' ' + util.id)
    if (util.id === 0) {
        // invalid objId (e.g. deleted object)
        return;
    }
    // first we need to surf up the hierarchy to make sure we are not in a
    // collapsed group
    var counter = 0;
    while (counter < 20) {
        var isFoldable = util.type === 'Track' && parseInt(util.get('is_foldable'));
        //log(util.id + ' isFoldable=' + util.get('is_foldable'))
        if (isFoldable) {
            var foldState = parseInt(util.get('fold_state'));
            if (foldState === 1) {
                // need to unfold
                util.set('fold_state', 0);
            }
        }
        util.id = util.get('canonical_parent')[1];
        //log('TYPE=' + util.type)
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
            util.id = util.get('canonical_parent')[1];
            //log('PARENT TYPE=' + util.type)
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
    // make sure the track is selected
    var trackId = getParentTrackForDevice(deviceId);
    if (trackId === 0) {
        log('no track for device ' + deviceId);
    }
    else {
        gotoTrack(trackId.toString());
    }
    //log('GOTO DEVICE ' + deviceId)
    api.call('select_device', ['id', deviceId]);
}
function hideChains(deviceId) {
    //log('HIDE CHAINS ' + JSON.stringify(deviceId))
    var obj = new LiveAPI(consts_1.noFn, 'id ' + deviceId);
    if (+obj.id === 0) {
        return;
    }
    if ((0, utils_1.isDeviceSupported)(obj) && +obj.get('can_have_chains')) {
        // have to go to the 'view' child of the object to set chain device visibility
        obj.goto('view');
        obj.set('is_showing_chain_devices', 0);
    }
}
function gotoChain(chainIdStr) {
    var chainId = parseInt(chainIdStr);
    //log('GOTO CHAIN ' + chainId + ' ' + typeof chainId)
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
function gotoTrack(trackIdStr) {
    //log('gotoTrack ' + trackIdStr)
    var trackId = parseInt(trackIdStr);
    unfoldParentTracks(trackId);
    var api = getLiveSetViewApi();
    api.set('selected_track', ['id', trackId]);
}
function onVariationChange() {
    //log('VARIATIONSCHANGE')
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    //log('VARIATIONSCHANGE2')
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        //log('VARIATIONSCHANGE2 -- NO', api.get('name').toString())
        return;
    }
    //log('VARIATIONSCHANGE3')
    // send variation stuff
    outlet(consts_1.OUTLET_OSC, [
        '/blu/variations',
        JSON.stringify({
            count: +api.get('variation_count'),
            selected: +api.get('selected_variation_index'),
        }),
    ]);
}
function init() {
    state.paramsWatcher = new LiveAPI(onParameterChange, 'live_set view selected_track view selected_device');
    state.paramsWatcher.mode = 1;
    state.paramsWatcher.property = 'parameters';
    state.variationsWatcher = new LiveAPI(onVariationChange, 'live_set view selected_track view selected_device');
    state.variationsWatcher.mode = 1;
    state.variationsWatcher.property = 'variation_count';
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
        outlet(consts_1.OUTLET_OSC, ['/bOnOff', parseInt(args[1])]);
    }
}
function onParameterChange(args) {
    if (args[0].toString() !== 'parameters') {
        return;
    }
    //log('OPC ' + JSON.stringify(args))
    var api = state.paramsWatcher;
    if (+api.id === 0) {
        return;
    }
    var isSupported = (0, utils_1.isDeviceSupported)(api);
    var deviceType = isSupported ? api.get('class_name').toString() : api.type;
    var paramIds = isSupported ? (0, utils_1.cleanArr)(api.get('parameters')) : [];
    if (paramIds.length === 0) {
        //log('ZERO LEN PARAMIDS')
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
    //log('CAN_HAVE_CHAINS: ' + canHaveChains)
    if (canHaveChains) {
        // see if we should slice off some macros
        var numMacros = parseInt(api.get('visible_macro_count'));
        if (numMacros) {
            //log('GonNNA SlIcE ' + numMacros)
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
    //log('PARAMIDS ' + JSON.stringify(paramIds))
    if (state.paramsWatcher.id !== state.currDeviceId) {
        // changed device, reset bank
        state.currBank = 1;
        state.currDeviceId = state.paramsWatcher.id;
    }
    state.devicePath = api.unquotedpath;
    if (!canHaveChains) {
        // null send variation stuff
        outlet(consts_1.OUTLET_OSC, ['/blu/variations', '']);
    }
    state.bankParamArr = getBankParamArr(paramIds, deviceType, api);
    state.numBanks = state.bankParamArr.length;
    if (state.currBank > state.numBanks) {
        state.currBank = state.numBanks;
    }
    //log('STATE CHECK ' + JSON.stringify(state))
    sendCurrBank();
}
function variationNew() {
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        return;
    }
    api.call('store_variation', null);
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
        // only applies to racks
        return;
    }
    api.set('selected_variation_index', idx);
    api.call('delete_selected_variation', null);
}
function variationRecall(idx) {
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        return;
    }
    api.set('selected_variation_index', idx);
    api.call('recall_selected_variation', null);
    onVariationChange();
}
function randomMacros() {
    var api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        return;
    }
    api.call('randomize_macros', null);
}
function gotoBank(idx) {
    //log('HERE ' + idx)
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
function toggleMetronome() {
    var api = getLiveSetApi();
    var metroVal = parseInt(api.get('metronome'));
    api.set('metronome', metroVal ? 0 : 1);
}
function tapTempo() {
    var api = getLiveSetApi();
    api.call('tap_tempo', null);
}
function setTempo(val) {
    var api = getLiveSetApi();
    api.set('tempo', val);
}
function btnSkipPrev() {
    var ctlApi = getLiveSetApi();
    ctlApi.call('jump_to_prev_cue', null);
}
function btnSkipNext() {
    var ctlApi = getLiveSetApi();
    ctlApi.call('jump_to_next_cue', null);
}
function btnReEnableAutomation() {
    var ctlApi = getLiveSetApi();
    ctlApi.call('re_enable_automation', null);
}
function btnLoop() {
    var ctlApi = getLiveSetApi();
    var isLoop = parseInt(ctlApi.get('loop'));
    ctlApi.set('loop', isLoop ? 0 : 1);
}
function btnCaptureMidi() {
    var ctlApi = getLiveSetApi();
    ctlApi.call('capture_midi', null);
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
    var ctlApi = getLiveSetApi();
    ctlApi.call('start_playing', null);
}
function ctlStop() {
    var ctlApi = getLiveSetApi();
    ctlApi.call('stop_playing', null);
}
log('reloaded k4-bluhandBanks');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
