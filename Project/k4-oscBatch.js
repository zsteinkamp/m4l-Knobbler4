"use strict";
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
const utils_1 = require("./utils");
const config_1 = require("./config");
autowatch = 1;
inlets = 1;
outlets = 1;
const log = (0, utils_1.logFactory)(config_1.default);
setinletassist(0, 'OSC messages to batch');
setoutletassist(0, 'Batched OSC messages to [udpsend]');
const OSC_FLUSH_MS = 10;
const OSC_MAX_BYTES = 1024;
const BYPASS_SUFFIXES = ['/start', '/end', '/chunk', '/meters'];
let batchEnabled = false;
let oscBuffer = {};
let oscBufferSize = 0;
let oscBufferBytes = 2; // opening/closing braces: {}
let oscFlushTask = null;
let oscFlushPending = false;
const batchOut = ['/batch', null];
function oscValBytes(val) {
    if (val === null)
        return 4; // "null"
    if (typeof val === 'string')
        return val.length + 2;
    return val.toString().length;
}
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
function checkClientCapabilities() {
    var caps = (0, utils_1.loadSetting)('clientCapabilities');
    batchEnabled = typeof caps === 'string' && caps.indexOf('batch') !== -1;
}
function anything(val) {
    var address = messagename;
    // /sendState fires right after /syn handshake — re-check capabilities
    if (address === '/sendState') {
        checkClientCapabilities();
    }
    if (shouldBypass(address) || !batchEnabled) {
        outlet(0, address, val);
        return;
    }
    if (val === undefined) {
        val = null;
    }
    if (!(address in oscBuffer)) {
        // "addr":val, — key quotes(2) + colon(1) + valBytes + comma(1)
        var entryBytes = address.length + 4 + oscValBytes(val);
        if (oscBufferSize > 0 && oscBufferBytes + entryBytes > OSC_MAX_BYTES) {
            flushOscBuffer();
        }
        oscBufferSize++;
        oscBufferBytes += entryBytes;
    }
    oscBuffer[address] = val;
    if (!oscFlushPending) {
        if (!oscFlushTask) {
            oscFlushTask = new Task(flushOscBuffer);
        }
        oscFlushTask.schedule(OSC_FLUSH_MS);
        oscFlushPending = true;
    }
}
function flushOscBuffer() {
    if (oscBufferSize === 0) {
        oscFlushPending = false;
        return;
    }
    batchOut[1] = JSON.stringify(oscBuffer);
    outlet(0, batchOut);
    oscBuffer = {};
    oscBufferSize = 0;
    oscBufferBytes = 2;
    if (oscFlushPending && oscFlushTask) {
        oscFlushTask.cancel();
    }
    oscFlushPending = false;
}
log('reloaded k4-oscBatch');
module.exports = {};
