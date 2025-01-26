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
    var param = new LiveAPI(function () { }, '');
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
    var api = new LiveAPI(consts_1.noFn, 'live_set view');
    //log('GOTO DEVICE ' + deviceId)
    api.call('select_device', ['id', deviceId]);
}
function gotoTrack(trackId) {
    var api = new LiveAPI(consts_1.noFn, 'live_set view');
    //log('GOTO TRACK ' + trackId)
    api.set('selected_track', ['id', trackId]);
}
function id(deviceId) {
    var api = new LiveAPI(updateParams, 'id ' + deviceId.toString());
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
    var canHaveChains = api.get('can_have_chains');
    //log('CAN_HAVE_CHAINS: ' + canHaveChains)
    if (canHaveChains) {
        // see if we should slice off some macros
        var numMacros = api.get('visible_macro_count');
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
function toggleMetronome() {
    var api = new LiveAPI(consts_1.noFn, 'live_set');
    var metroVal = parseInt(api.get('metronome'));
    api.set('metronome', metroVal ? 0 : 1);
}
function tapTempo() {
    var api = new LiveAPI(consts_1.noFn, 'live_set');
    api.call('tap_tempo', null);
}
function setTempo(val) {
    var api = new LiveAPI(consts_1.noFn, 'live_set');
    api.set('tempo', val);
}
function trackDelta(delta) {
    //log('TRACK DELTA ' + delta)
    var setObj = new LiveAPI(function () { }, 'live_set');
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
function deviceDelta(delta) {
    var devObj = new LiveAPI(function () { }, 'live_set appointed_device');
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
function btnSkipPrev() {
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    ctlApi.call('jump_to_prev_cue', null);
}
function btnSkipNext() {
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    ctlApi.call('jump_to_next_cue', null);
}
function btnReEnableAutomation() {
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    ctlApi.call('re_enable_automation', null);
}
function btnLoop() {
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    var isLoop = parseInt(ctlApi.get('loop'));
    ctlApi.set('loop', isLoop ? 0 : 1);
}
function btnCaptureMidi() {
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    ctlApi.call('capture_midi', null);
}
function btnArrangementOverdub() {
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    var isOverdub = parseInt(ctlApi.get('arrangement_overdub'));
    ctlApi.set('arrangement_overdub', isOverdub ? 0 : 1);
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
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    var currMode = ctlApi.get('record_mode');
    ctlApi.set('record_mode', currMode == 1 ? 0 : 1);
}
function ctlPlay() {
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    ctlApi.call('start_playing', null);
}
function ctlStop() {
    var ctlApi = new LiveAPI(function () { }, 'live_set');
    ctlApi.call('stop_playing', null);
}
log('reloaded k4-bluhandBanks');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
