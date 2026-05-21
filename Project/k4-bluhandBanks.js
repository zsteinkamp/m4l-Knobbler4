"use strict";
// Pure bank-layout computation for bluhand. Given a device's parameter ids,
// its class name, and a LiveAPI handle to the device, produces the rows of
// parameter indices that each bluhand "bank" page displays. Imported by
// k4-bluhand (the [v8] entry); owns no Max I/O or observers.
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
exports.getBankParamArr = void 0;
var consts_1 = require("./consts");
var k4_deviceParamMaps_1 = require("./k4-deviceParamMaps");
var deviceParams_1 = require("./deviceParams");
var nameLookupCache = {};
var lookupApi = null;
function getLookupApi() {
    if (!lookupApi) {
        lookupApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    return lookupApi;
}
function getMaxBanksParamArr(bankCount, deviceObj) {
    var rawBanks = [];
    for (var i = 0; i < bankCount; i++) {
        var bankName = deviceObj.call('get_bank_name', i);
        var bankParams = deviceObj.call('get_bank_parameters', i);
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
    else {
        ret.push(blankRow());
    }
    return ret;
}
function getBankParamArr(paramIds, deviceType, deviceObj) {
    if (deviceParams_1.MAX_DEVICES.indexOf(deviceType) > -1) {
        // Max device, look for live.banks
        var bankCount = deviceObj.call('get_bank_count') || 0;
        if (bankCount > 0) {
            return getMaxBanksParamArr(bankCount, deviceObj);
        }
    }
    // deviceParamMap is custom or crafted parameter organization
    var deviceParamMap = (0, k4_deviceParamMaps_1.deviceParamMapFor)(deviceType);
    if (!deviceParamMap) {
        // nothing to customize, return the basic array
        return getBasicParamArr(paramIds);
    }
    // cache id to name mapping because it is super slow with giant devices like
    // Operator and honestly it should just be a compile-time step of the data
    // files that need this information.
    var lookupCacheKey = deviceObj.id;
    var paramNameToIdx = nameLookupCache[lookupCacheKey];
    if (!paramNameToIdx) {
        paramNameToIdx = {};
        var param_1 = getLookupApi();
        paramIds.forEach(function (paramId, idx) {
            if (paramId <= 0) {
                return;
            }
            param_1.id = paramId;
            paramNameToIdx[param_1.get('name').toString()] = idx;
        });
        nameLookupCache[lookupCacheKey] = paramNameToIdx;
    }
    var ret = [];
    deviceParamMap.forEach(function (nameBank) {
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
                if (pIdx !== undefined) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                // the world of parameters is a complicated one
                return;
            }
            row.paramIdxArr.push(pIdx + 1);
        });
        ret.push(row);
    });
    return ret;
}
exports.getBankParamArr = getBankParamArr;
