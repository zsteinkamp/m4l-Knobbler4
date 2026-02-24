"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(0, 'OSC messages to rate-limit');
setoutletassist(0, 'Rate-limited OSC messages to [udpsend]');
var intervalMs = 30;
var entries = {};
// Reusable 2-element output array to avoid allocations in send()
var outMsg = ['', ''];
function setThrottleInterval(ms) {
    intervalMs = ms;
    log('throttle interval set to', ms, 'ms');
}
var BYPASS_SUFFIXES = ['/start', '/end', '/chunk'];
function shouldBypass(address) {
    for (var i = 0; i < BYPASS_SUFFIXES.length; i++) {
        var suffix = BYPASS_SUFFIXES[i];
        if (address.length >= suffix.length &&
            address.indexOf(suffix, address.length - suffix.length) !== -1) {
            return true;
        }
    }
    return false;
}
function anything(val) {
    var address = messagename;
    if (shouldBypass(address)) {
        outMsg[0] = address;
        outMsg[1] = val;
        outlet(0, outMsg);
        return;
    }
    var now = Date.now();
    var entry = entries[address];
    if (!entry) {
        var e = {
            address: address,
            arg: val,
            lastSentTime: now,
            task: null,
            deferredFn: null,
        };
        e.deferredFn = makeDeferred(e);
        entries[address] = e;
        outMsg[0] = address;
        outMsg[1] = val;
        outlet(0, outMsg);
        return;
    }
    if (now - entry.lastSentTime >= intervalMs) {
        if (entry.task) {
            entry.task.cancel();
            entry.task.freepeer();
            entry.task = null;
        }
        entry.arg = val;
        entry.lastSentTime = now;
        outMsg[0] = address;
        outMsg[1] = val;
        outlet(0, outMsg);
        return;
    }
    // Too soon — store latest value and schedule deferred send
    entry.arg = val;
    if (!entry.task) {
        var delay = entry.lastSentTime + intervalMs - now;
        entry.task = new Task(entry.deferredFn);
        entry.task.schedule(delay);
    }
}
function makeDeferred(entry) {
    return function () {
        entry.task = null;
        entry.lastSentTime = Date.now();
        outMsg[0] = entry.address;
        outMsg[1] = entry.arg;
        outlet(0, outMsg);
    };
}
log('reloaded k4-oscThrottle');
// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
