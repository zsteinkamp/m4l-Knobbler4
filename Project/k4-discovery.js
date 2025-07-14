"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var OUTLET_MSGS = 0;
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setoutletassist(OUTLET_MSGS, 'Output messages to umenu');
log('reloaded k4-discovery');
function filter() {
    var ret = [];
    for (var _i = 0, _a = arguments; _i < _a.length; _i++) {
        var elem = _a[_i];
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
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
