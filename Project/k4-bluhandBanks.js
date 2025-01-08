"use strict";
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
    currBank: 1,
    numBanks: 1,
    bankParamArr: null,
};
function getBasicParamArr(paramIds) {
    var ret = [];
    var numBanks = Math.ceil(paramIds.length / 16);
    var currBank = 0;
    var blankRow = function () {
        return {
            name: 'Page ' + ++currBank + ' of ' + numBanks,
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
    ret.push(currRow);
    //log('RET ' + JSON.stringify(ret))
    return ret;
}
function getBankParamArr(paramIds, deviceType) {
    var deviceParamMap = k4_deviceParamMaps_1.DeviceParamMaps[deviceType];
    var paramArr = getBasicParamArr(paramIds);
    paramNameToIdx = {};
    // more "bespoke" setups get this
    paramIds.forEach(function (paramId, idx) {
        var param = new LiveAPI(function () { }, 'id ' + paramId);
        paramNameToIdx[param.get('name')] = idx;
        log("NAME TO IDX [".concat(param.get('name'), "]=").concat(idx));
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
function sendCurrBank() {
    //log('SEND CURR BANK ' + JSON.stringify(state))
    var currBankIdx = state.currBank - 1;
    if (!state.bankParamArr || !state.bankParamArr[currBankIdx]) {
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
        ////log(JSON.stringify({ str: 'MSG', target: idx + 1, paramIdx }))
    });
}
function id(deviceId) {
    var api = new LiveAPI(updateParams, 'id ' + deviceId.toString());
    var deviceType = api.get('class_display_name');
    log(JSON.stringify({ deviceType: deviceType, name: api.get('name') }));
    var rawParams = api.get('parameters');
    var paramIds = [];
    rawParams.forEach(function (paramId, idx) {
        if (paramId === 'id') {
            return;
        }
        paramIds.push(paramId);
    });
    paramIds.shift(); // remove device on/off
    //log('PARAMIDS ' + JSON.stringify(paramIds))
    state.currBank = 1;
    state.bankParamArr = getBankParamArr(paramIds, deviceType);
    state.numBanks = state.bankParamArr.length;
    //log('STATE CHECK ' + JSON.stringify(state))
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
log('reloaded k4-bluhandBanks');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
// if we know about this device type, then we want to set up mapping by name
//   foreach parameter
//      build map of parameter name => parameter index (indexOf?)
//
