"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
// Coalescing and throttling now handled by k4-oscBatch.
// This module is a passthrough to avoid .amxd patching.
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(0, 'OSC passthrough');
setoutletassist(0, 'OSC passthrough');
function anything(val) {
    outlet(0, messagename, val);
}
log('reloaded k4-oscThrottle (passthrough)');
// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
