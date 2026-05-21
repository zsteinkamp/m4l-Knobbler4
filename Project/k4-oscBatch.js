"use strict";
// Outbound OSC coalescing — folded into the entry [v8 knobbler]. utils.osc()
// feeds send() in-process (registered via setOscSink); send() batches numeric
// values into a /batch JSON envelope (batch-capable clients) or rate-limits
// per-address (others), then emits to OUTLET_OSC -> [s ---UDPSEND] -> the
// OSC-out gate -> [udpsend]. Non-numeric payloads (strings, JSON, chunks) are
// built into raw OSC packets here and sent via udpsend's `rawbytes` message so
// the variable content never interns into Max's symbol table.
Object.defineProperty(exports, "__esModule", { value: true });
exports.send = void 0;
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(config_1.default);
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
// Reusable 2-element output array for numeric fast-path sends.
var outMsg = ['', ''];
// Reusable rawbytes output array for non-numeric sends. The first atom is
// the fixed 'rawbytes' selector (gensym'd once and reused); the rest are
// byte values (numeric atoms — no symbol-table interaction).
var rawOut = ['rawbytes'];
function sendRawBytes(bytes) {
    rawOut.length = 1;
    for (var i = 0; i < bytes.length; i++)
        rawOut.push(bytes[i]);
    outlet(consts_1.OUTLET_OSC, rawOut);
}
// For numeric args we keep the existing path — [udpsend]'s default OSC
// formatter handles them cleanly and they don't intern. For anything else
// (strings, JSON-encoded objects), we build the wire packet ourselves and
// hand [udpsend] the bytes via its rawbytes message, bypassing its OSC
// formatter entirely so the variable-content payload never becomes a Max
// atom.
function sendDirect(address, val) {
    if (typeof val === 'number') {
        outMsg[0] = address;
        outMsg[1] = val;
        outlet(consts_1.OUTLET_OSC, outMsg);
    }
    else {
        sendRawBytes((0, utils_1.buildOscPacket)(address, val));
    }
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
        // /batch envelope always has a JSON-string arg — build the wire packet
        // here so the JSON never becomes a Max atom.
        sendRawBytes((0, utils_1.buildOscPacket)('/batch', oscBuffer));
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
// Registered as utils' osc() sink. Every module's osc(addr, val) lands here.
function send(address, val) {
    // Capabilities may arrive in the handshake or a ping; both pass through here
    // (k4-system sends /sendState and /pong via osc()), so re-check on either.
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
exports.send = send;
log('reloaded k4-oscBatch');
