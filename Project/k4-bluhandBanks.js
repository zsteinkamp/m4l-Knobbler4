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
    if (deviceType.substring(0, 4) === 'Max ') {
        // Max device, look for live.banks
        var bankCount = deviceObj.call('get_bank_count', null) || 0;
        if (bankCount > 0) {
            return getMaxBanksParamArr(bankCount, deviceObj);
        }
    }
    // deviceParamMap is custom or crafted parameter organization
    var deviceParamMap = k4_deviceParamMaps_1.DeviceParamMaps[deviceType];
    var paramArr = getBasicParamArr(paramIds);
    if (!deviceParamMap) {
        // nothing to customize, return the basic array
        //log('BASIC RETURN ' + JSON.stringify(paramArr))
        return paramArr;
    }
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
        paramArr.splice(idx, 0, row);
    });
    //log('PARAMARRFINAL ' + JSON.stringify(paramArr))
    return paramArr;
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
    var currBankIdx = state.currBank - 1;
    if (!state.bankParamArr || !state.bankParamArr[currBankIdx]) {
        //log('EARLY')
        sendBankNames();
        return;
    }
    var bluBank = state.bankParamArr[currBankIdx];
    //log('MADE IT ' + JSON.stringify(bluBank))
    outlet(consts_1.OUTLET_OSC, ['/bTxtCurrBank', bluBank.name]);
    while (bluBank.paramIdxArr.length < 16) {
        bluBank.paramIdxArr.push(-1);
    }
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
function gotoDevice(deviceIdStr) {
    var deviceId = parseInt(deviceIdStr);
    unfoldParentTracks(deviceId);
    var api = getLiveSetViewApi();
    //log('GOTO DEVICE ' + deviceId)
    api.call('select_device', ['id', deviceId]);
}
function gotoChain(chainIdStr) {
    var chainId = parseInt(chainIdStr);
    log('GOTO CHAIN ' + chainId + ' ' + typeof chainId);
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
    var trackId = parseInt(trackIdStr);
    unfoldParentTracks(trackId);
    var api = getLiveSetViewApi();
    api.set('selected_track', ['id', trackId]);
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
function id(deviceId) {
    var api = new LiveAPI(consts_1.noFn, 'id ' + deviceId);
    api.id = deviceId;
    var deviceType = api.get('class_display_name').toString();
    //log(
    //  JSON.stringify({
    //    deviceType,
    //    name: api.get('name').toString(),
    //    type: api.type,
    //  })
    //)
    var paramIds = (0, utils_1.cleanArr)(api.get('parameters'));
    var onOffParamId = paramIds.shift(); // remove device on/off
    if (!state.onOffWatcher) {
        state.onOffWatcher = new LiveAPI(updateDeviceOnOff, 'id ' + onOffParamId);
        state.onOffWatcher.property = 'value';
    }
    else {
        state.onOffWatcher.id = onOffParamId;
    }
    var canHaveChains = parseInt(api.get('can_have_chains'));
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
    state.devicePath = api.unquotedpath;
    state.currBank = 1;
    state.bankParamArr = getBankParamArr(paramIds, deviceType, api);
    state.numBanks = state.bankParamArr.length;
    //log('STATE CHECK ' + JSON.stringify(state))
    sendCurrBank();
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
