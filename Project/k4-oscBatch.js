"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(0, 'OSC messages to coalesce and batch');
setoutletassist(0, 'Coalesced/batched OSC messages to [udpsend]');
var BATCH_FLUSH_MS = 10;
var BATCH_MAX_BYTES = 1024;
var THROTTLE_MS = 15;
var BYPASS_SUFFIXES = ['/start', '/end', '/chunk', '/meters'];
var batchEnabled = false;
var oscBuffer = {};
var oscBufferSize = 0;
var oscBufferBytes = 2; // opening/closing braces: {}
var batchFlushTask = null;
var batchFlushPending = false;
// Pre-wrapped /batch outlet message. The JSON body is rebuilt per flush into
// a `new String(...)` so [v8] emits it as a t_string atom (no gensym).
var batchOut = ['/batch', null];
// --- Shared helpers ---
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
// Reusable 2-element output array to avoid allocations in send()
var outMsg = ['', ''];
function sendDirect(address, val) {
    outMsg[0] = address;
    outMsg[1] = val;
    outlet(0, outMsg);
}
// --- Batch path (coalesce into JSON, flush on timer or size) ---
function flushBatchBuffer() {
    if (oscBufferSize === 0) {
        batchFlushPending = false;
        return;
    }
    if (oscBufferSize === 1) {
        for (var address in oscBuffer) {
            sendDirect(address, oscBuffer[address]);
        }
    }
    else {
        batchOut[1] = new String(JSON.stringify(oscBuffer));
        outlet(0, batchOut);
    }
    oscBuffer = {};
    oscBufferSize = 0;
    oscBufferBytes = 2;
    if (batchFlushPending && batchFlushTask) {
        batchFlushTask.cancel();
    }
    batchFlushPending = false;
}
function addToBatch(address, val) {
    if (val === undefined) {
        val = null;
    }
    if (!(address in oscBuffer)) {
        // "addr":val, — key quotes(2) + colon(1) + valBytes + comma(1)
        var entryBytes = address.length + 4 + oscValBytes(val);
        if (oscBufferSize > 0 && oscBufferBytes + entryBytes > BATCH_MAX_BYTES) {
            flushBatchBuffer();
        }
        oscBufferSize++;
        oscBufferBytes += entryBytes;
    }
    oscBuffer[address] = val;
    if (!batchFlushPending) {
        if (!batchFlushTask) {
            batchFlushTask = new Task(flushBatchBuffer);
        }
        batchFlushTask.schedule(BATCH_FLUSH_MS);
        batchFlushPending = true;
    }
}
var throttleEntries = {};
function makeThrottleDeferred(entry) {
    return function () {
        entry.task = null;
        entry.lastSentTime = Date.now();
        sendDirect(entry.address, entry.val);
    };
}
function throttleSend(address, val) {
    var now = Date.now();
    var entry = throttleEntries[address];
    if (!entry) {
        var e = {
            address: address,
            val: val,
            lastSentTime: now,
            task: null,
            deferredFn: null,
        };
        e.deferredFn = makeThrottleDeferred(e);
        throttleEntries[address] = e;
        sendDirect(address, val);
        return;
    }
    if (now - entry.lastSentTime >= THROTTLE_MS) {
        if (entry.task) {
            entry.task.cancel();
            entry.task.freepeer();
            entry.task = null;
        }
        entry.val = val;
        entry.lastSentTime = now;
        sendDirect(address, val);
        return;
    }
    // Too soon — store latest value and schedule trailing dispatch
    entry.val = val;
    if (!entry.task) {
        var delay = entry.lastSentTime + THROTTLE_MS - now;
        entry.task = new Task(entry.deferredFn);
        entry.task.schedule(delay);
    }
}
// --- Entry point ---
function anything(val) {
    var address = messagename;
    // Re-check capabilities after handshake or ping (capabilities may arrive in either)
    if (address === '/sendState' || address === '/pong') {
        checkClientCapabilities();
    }
    if (shouldBypass(address)) {
        sendDirect(address, val);
        return;
    }
    if (batchEnabled) {
        addToBatch(address, val);
    }
    else {
        throttleSend(address, val);
    }
}
log('reloaded k4-oscBatch');
// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
