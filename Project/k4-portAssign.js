"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(0, 'Resolved services from zero.resolve');
setoutletassist(0, 'Assigned port number');
var BASE_PORT = 2346;
var SCAN_TIMEOUT_MS = 200;
var resolvedPorts = [];
var scanTimer = null;
function anything() {
    // Receives all browse results as one message
    // Reconstruct full text and find Knobbler4 Device entries with ports
    var parts = [messagename];
    for (var i = 0; i < arguments.length; i++) {
        parts.push(String(arguments[i]));
    }
    var text = parts.join(' ');
    // Match patterns like "Knobbler4 Device :2346" or "Knobbler4 Device"
    var matches = text.match(/Knobbler4 Device\s*:(\d+)/g);
    if (matches) {
        for (var j = 0; j < matches.length; j++) {
            var portMatch = matches[j].match(/:(\d+)/);
            if (portMatch) {
                resolvedPorts.push(parseInt(portMatch[1]));
            }
        }
    }
    resetTimer();
}
function scan() {
    // Called to start the scan — sets a timer so assignPort fires
    // even if no Knobbler4 Device services are found
    resolvedPorts = [];
    resetTimer();
}
function assignPort() {
    var chosen = BASE_PORT;
    if (resolvedPorts.length > 0) {
        resolvedPorts.sort(function (a, b) { return a - b; });
        chosen = resolvedPorts[resolvedPorts.length - 1] + 2;
    }
    log('assignPort: found ports=' + JSON.stringify(resolvedPorts) + ' chosen=' + chosen);
    outlet(0, ['port', chosen]);
}
function resetTimer() {
    cancelTimer();
    scanTimer = new Task(function () {
        assignPort();
    });
    scanTimer.schedule(SCAN_TIMEOUT_MS);
}
function cancelTimer() {
    if (scanTimer) {
        scanTimer.cancel();
        scanTimer.freepeer();
        scanTimer = null;
    }
}
log('reloaded k4-portAssign');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
