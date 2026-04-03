"use strict";
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
const utils_1 = require("./utils");
const config_1 = require("./config");
const consts_1 = require("./consts");
const OUTLET_MSGS = 0;
autowatch = 1;
inlets = 1;
outlets = 1;
const log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setoutletassist(OUTLET_MSGS, 'Output messages to umenu');
log('reloaded k4-discovery');
function filter() {
    const ret = [];
    for (const elem of arguments) {
        if (!elem.match(/Knobbler4 Device/i)) {
            ret.push(elem);
        }
    }
    if (ret.length === 0) {
        ret.unshift('* No Knobbler Apps found');
    }
    else {
        ret.unshift('* Select a Knobbler App');
    }
    outlet(OUTLET_MSGS, ret);
}
module.exports = {};
