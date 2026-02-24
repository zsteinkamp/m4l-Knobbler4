"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(0, 'OSC messages to rate-limit');
setoutletassist(0, 'Rate-limited OSC messages to [udpsend]');
var intervalMs = 20;
var entries = {};
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
function anything() {
    var address = messagename;
    var args = arrayfromargs(arguments);
    if (shouldBypass(address)) {
        send(address, args);
        return;
    }
    var now = new Date().getTime();
    var entry = entries[address];
    if (!entry) {
        entries[address] = {
            args: args,
            lastSentTime: now,
            task: null,
        };
        send(address, args);
        return;
    }
    if (now - entry.lastSentTime >= intervalMs) {
        if (entry.task) {
            entry.task.cancel();
            entry.task.freepeer();
            entry.task = null;
        }
        entry.args = args;
        entry.lastSentTime = now;
        send(address, args);
        return;
    }
    // Too soon — store latest value and schedule deferred send
    log('throttled', address, args.join(' '));
    entry.args = args;
    if (!entry.task) {
        var delay = entry.lastSentTime + intervalMs - now;
        entry.task = new Task(makeDeferred(address));
        entry.task.schedule(delay);
    }
}
function makeDeferred(address) {
    return function () {
        var entry = entries[address];
        if (entry) {
            entry.task = null;
            entry.lastSentTime = new Date().getTime();
            send(address, entry.args);
        }
    };
}
function send(address, args) {
    outlet(0, [address].concat(args));
}
log('reloaded k4-oscThrottle');
// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
