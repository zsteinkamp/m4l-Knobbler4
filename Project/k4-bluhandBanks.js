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
var updateParams = function () { };
var paramNameToIdx = null;
var state = {
    devicePath: null,
    currBank: 1,
    numBanks: 1,
    bankParamArr: [],
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
    var numBanks = Math.ceil(paramIds.length / 16);
    var currBank = 0;
    var blankRow = function () {
        return {
            name: 'Page ' + ++currBank,
            paramIdxArr: [],
        };
    };
    var currRow = null;
    paramIds.forEach(function (paramId, idx) {
        // set up a new row for the first one
        if (idx % 16 === 0) {
            if (currRow) {
                ret.push(currRow);
            }
            currRow = blankRow();
        }
        currRow.paramIdxArr.push(idx + 1);
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
    paramNameToIdx = {};
    // more "bespoke" setups get this
    var param = getUtilApi();
    paramIds.forEach(function (paramId, idx) {
        param.id = paramId;
        paramNameToIdx[param.get('name')] = idx;
        //log(`NAME TO IDX [${param.get('name')}]=${idx}`)
    });
    if (!deviceParamMap) {
        // nothing to customize, return the basic array
        //log('BASIC RETURN ' + JSON.stringify(paramArr))
        return paramArr;
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
                log('ERROR (' +
                    deviceType +
                    ') NO pIDX FOR NAME ' +
                    paramName +
                    ' ' +
                    JSON.stringify(Object.keys(paramNameToIdx)));
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
function gotoDevice(deviceId) {
    var api = getLiveSetViewApi();
    //log('GOTO DEVICE ' + deviceId)
    api.call('select_device', ['id', deviceId]);
}
function gotoChain(chainId) {
    var viewApi = getLiveSetViewApi();
    var api = getUtilApi();
    api.id = chainId;
    var devices = (0, utils_1.cleanArr)(api.get('devices'));
    if (devices && devices[0]) {
        viewApi.call('select_device', ['id', devices[0]]);
        return;
    }
}
function gotoTrack(trackId) {
    var api = getLiveSetViewApi();
    //log('GOTO TRACK ' + trackId)
    api.set('selected_track', ['id', trackId]);
}
function id(deviceId) {
    var api = getUtilApi();
    api.id = deviceId;
    var deviceType = api.get('class_display_name').toString();
    //log(JSON.stringify({ deviceType, name: api.get('name') }))
    var rawParams = api.get('parameters');
    var paramIds = [];
    rawParams.forEach(function (paramId, idx) {
        if (paramId === 'id') {
            return;
        }
        paramIds.push(paramId);
    });
    paramIds.shift(); // remove device on/off
    var canHaveChains = parseInt(api.get('can_have_chains'));
    //log('CAN_HAVE_CHAINS: ' + canHaveChains)
    if (canHaveChains) {
        // see if we should slice off some macros
        var numMacros = parseInt(api.get('visible_macro_count'));
        if (numMacros) {
            //log('GonNNA SlIcE ' + numMacros)
            paramIds = paramIds.slice(0, numMacros);
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
    var currMode = ctlApi.get('record_mode');
    ctlApi.set('record_mode', currMode == 1 ? 0 : 1);
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
