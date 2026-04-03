"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceParamMapFor = void 0;
const utils_1 = require("./utils");
const config_1 = require("./config");
const log = (0, utils_1.logFactory)(config_1.default);
const deviceParams_1 = require("./deviceParams");
function deviceParamMapFor(deviceName) {
    if (!deviceParams_1.BANK_NAME_DICT[deviceName]) {
        return null;
    }
    if (deviceParams_1.BANK_NAME_DICT[deviceName].length !== deviceParams_1.DEVICE_DICT[deviceName].length) {
        log('oopsie len mismatch ' + deviceName);
        return null;
    }
    const ret = [];
    //log('GOT HERE' + deviceName)
    for (let i = 0; i < deviceParams_1.BANK_NAME_DICT[deviceName].length; i++) {
        if (i % 2 === 0) {
            ret.push({
                name: deviceParams_1.BANK_NAME_DICT[deviceName][i],
                paramNames: deviceParams_1.DEVICE_DICT[deviceName][i],
            });
        }
        else {
            // odd numbered banks are appended to the prior one because knobbler has
            // 16 sliders and banks are in groups of 8
            const prev = ret[ret.length - 1];
            prev.name += ' / ' + deviceParams_1.BANK_NAME_DICT[deviceName][i];
            for (let j = 0; j < deviceParams_1.DEVICE_DICT[deviceName][i].length; j++) {
                prev.paramNames[8 + j] = deviceParams_1.DEVICE_DICT[deviceName][i][j];
            }
        }
    }
    return ret;
}
exports.deviceParamMapFor = deviceParamMapFor;
