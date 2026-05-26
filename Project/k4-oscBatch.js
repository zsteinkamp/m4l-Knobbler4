"use strict";
// Outbound OSC coalescing — folded into the entry [v8 knobbler]. utils.osc()
// feeds send() in-process (registered via setOscSink); send() batches numeric
// values into a /batch JSON envelope (batch-capable clients) or rate-limits
// per-address (others). Output goes to [udpsend] via OUTLET_OSC, version-gated:
//   Max 9.1.0+ (Live 12.4+): build the OSC packet in JS and ship it as
//     `rawbytes <byte…>` — no string interning, /batch JSON rides as bytes.
//   Max < 9.1.0 (Live 12.3.x): `rawbytes` would crash the app's parser, so send
//     native `addr value` for [udpsend] to format. Numerics don't intern; only
//     low-churn strings (names/colors) do, and batching is disabled (its /batch
//     JSON would be the big interning source).
// See RAWBYTES_OK in utils.
Object.defineProperty(exports, "__esModule", { value: true });
exports.send = exports.setDebug = exports.setOutputBlocked = void 0;
var utils_1 = require("./utils");
var k4_config_1 = require("./k4-config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(k4_config_1.default);
log('reloaded k4-oscBatch: max.version=' + utils_1.MAX_VERSION_RAW + ' rawbytes=' + utils_1.RAWBYTES_OK);
var BATCH_FLUSH_MS = 10;
var BATCH_MAX_BYTES = 1024;
var CHUNK_MAX_BYTES = 1024;
var THROTTLE_MS = 15;
var BYPASS_SUFFIXES = ['/start', '/end', '/chunk', '/meters'];
// Addresses an OLD (cNav-only) app reassembles into oscDataRef[prefix] directly
// (no per-address merge logic). The pipeline may chunk these for such apps.
// `chunkAny` apps can reassemble+dispatch ANY address, so they aren't limited
// to this list. See checkClientCapabilities / shouldChunk.
var LEGACY_CHUNK_ADDRS = [
    '/nav/devices',
    '/clips/scenes',
    '/visibleTracks',
    '/browser/items',
];
var batchEnabled = false;
var cNavEnabled = false;
var chunkAnyEnabled = false;
var columnarEnabled = false;
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
    // Treat the space-delimited capability string as an array — exact membership,
    // no substring false-matches (e.g. 'col' can't match inside another token).
    var list = (typeof caps === 'string' ? caps : '').split(' ');
    var has = function (c) { return list.indexOf(c) !== -1; };
    // Only batch when the client supports it AND we can ship the /batch JSON as
    // rawbytes — on older Max the envelope would intern a fresh string per flush.
    batchEnabled = utils_1.RAWBYTES_OK && has('batch');
    cNavEnabled = has('cNav');
    chunkAnyEnabled = has('chunkAny');
    columnarEnabled = has('col');
}
// rawbytes path: a complete OSC packet (built in JS) shipped to [udpsend] as
// `rawbytes <byte…>`. 'rawbytes' is a fixed selector (gensym'd once); the rest
// are byte ints — no symbol-table interaction. Max 9.1.0+ only.
var rawOut = ['rawbytes'];
// Feedback-loop guard: when the configured output host:port equals our own
// [udpreceive], every packet echoes straight back and storms. knobbler.ts pings
// /loop on connect and, on hearing the echo, blocks output here. The probe ping
// is sent while unblocked (the entry clears this first), so it always goes out;
// a fresh /connect re-probes. See the /loop guard in knobbler.ts.
var outputBlocked = false;
function setOutputBlocked(v) {
    outputBlocked = v;
}
exports.setOutputBlocked = setOutputBlocked;
// Debug-output logging — driven by the patcher's debug checkbox (`debug 1`/`0`
// -> entry -> setDebug). When on, each outgoing OSC message is logged from the
// send path BEFORE encoding, so we log the original address+value directly (no
// need to decode the rawbytes packet) tagged with the transport that was used.
var debugOut = false;
function setDebug(v) {
    debugOut = !!v;
}
exports.setDebug = setDebug;
// Set true while sendChunked emits its /start//chunk//end pieces, so they don't
// each log an OSC OUT line — chunked sends get one summary line instead.
var suppressOutLog = false;
// Format: OSC OUT <bytes> <transport> <address> <value>
//   e.g.   OSC OUT 1203 raw /mixer/foo {"bar":"baz"}
// transport: 'raw' | 'native'. byteLen < 0 = unknown (native, unencoded) -> '?'.
function logOut(transport, address, value, byteLen) {
    var vs = value;
    if (typeof vs === 'object' && vs !== null)
        vs = JSON.stringify(vs);
    var sz = byteLen >= 0 ? byteLen : '?';
    log('OSC OUT ' + sz + ' ' + transport + ' ' + address + ' ' + vs);
}
function emitRawbytes(bytes) {
    if (outputBlocked) {
        return;
    }
    rawOut.length = 1;
    for (var i = 0; i < bytes.length; i++) {
        rawOut.push(bytes[i]);
    }
    outlet(consts_1.OUTLET_OSC, rawOut);
}
// Native path (Max < 9.1.0): emit `addr value` for [udpsend] to OSC-format.
// Objects/arrays are stringified; undefined sends a bare (no-arg) address.
function sendNative(address, val) {
    if (outputBlocked) {
        return;
    }
    if (val === undefined) {
        outlet(consts_1.OUTLET_OSC, address);
    }
    else if (typeof val === 'object' && val !== null) {
        outlet(consts_1.OUTLET_OSC, address, JSON.stringify(val));
    }
    else {
        outlet(consts_1.OUTLET_OSC, address, val);
    }
}
function sendDirect(address, val) {
    if (utils_1.RAWBYTES_OK) {
        var bytes = (0, utils_1.buildOscPacket)(address, val);
        if (debugOut && !suppressOutLog)
            logOut('raw', address, val, bytes.length);
        emitRawbytes(bytes);
    }
    else {
        if (debugOut && !suppressOutLog)
            logOut('native', address, val, -1);
        sendNative(address, val);
    }
}
// --- Chunking (transport stage; callers never split payloads themselves) ---
function shouldChunk(address, arr) {
    // Small arrays fit one packet — no need to chunk.
    if (JSON.stringify(arr).length <= CHUNK_MAX_BYTES)
        return false;
    if (chunkAnyEnabled)
        return true;
    return cNavEnabled && LEGACY_CHUNK_ADDRS.indexOf(address) !== -1;
}
// Split a large array into the /start//chunk//end protocol the app reassembles.
// Pieces go via sendDirect (so they bypass batching and don't re-enter chunking).
// The /end checksum is simpleHash(JSON.stringify(items)) — '[' + per-item JSON
// joined + ']' is identical to JSON.stringify(array) — which the app re-derives
// from the reassembled items to verify integrity.
function sendChunked(address, items) {
    // Suppress per-piece OSC OUT logs; a chunked send gets one summary after /end.
    suppressOutLog = true;
    sendDirect(address + '/start', items.length);
    var chunkItems = [];
    var chunkSize = 2;
    var chunkCount = 0;
    var allParts = [];
    for (var i = 0; i < items.length; i++) {
        var itemJson = JSON.stringify(items[i]);
        allParts.push(itemJson);
        var added = (chunkItems.length > 0 ? 1 : 0) + itemJson.length;
        if (chunkItems.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
            sendDirect(address + '/chunk', chunkItems);
            chunkCount++;
            chunkItems = [];
            chunkSize = 2;
        }
        chunkItems.push(items[i]);
        chunkSize += added;
    }
    if (chunkItems.length > 0) {
        sendDirect(address + '/chunk', chunkItems);
        chunkCount++;
    }
    var totalBytes = allParts.join(',').length + 2; // ~JSON.stringify(items) length
    sendDirect(address + '/end', (0, utils_1.simpleHash)('[' + allParts.join(',') + ']'));
    suppressOutLog = false;
    if (debugOut) {
        log('OSC OUT ' +
            totalBytes +
            ' chunked ' +
            address +
            ' (' +
            items.length +
            ' items, ' +
            chunkCount +
            ' chunks)');
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
        // /batch envelope always has a JSON-string arg — ship as rawbytes so the
        // JSON never becomes a Max atom. (Only reached when batchEnabled, which
        // requires RAWBYTES_OK.)
        var bytes = (0, utils_1.buildOscPacket)('/batch', oscBuffer);
        if (debugOut)
            logOut('raw', '/batch', oscBuffer, bytes.length);
        emitRawbytes(bytes);
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
// --- Columnar encoding (array-of-objects -> { key, columns, data }) ---
function isArrayOfObjects(v) {
    // Array of >=2 plain objects. Arrays-of-arrays (e.g. /nav/devices,
    // /visibleTracks) are already positional, so v[0] being an array excludes them.
    // <2 records isn't worth the columns overhead.
    return (Array.isArray(v) &&
        v.length >= 2 &&
        typeof v[0] === 'object' &&
        v[0] !== null &&
        !Array.isArray(v[0]));
}
// Flat array: [ originalKey, columns, ...rows ]. columns = union of record keys
// (first-seen order); each row holds values in column order, absent fields as
// null. Lossless — the app omits null fields on decode, so a present 0 stays 0.
// The flat-array shape (vs an object) lets a large /columnar ride the existing
// array chunker; element 0 is a string, so it's never re-columnarized.
function columnarize(address, arr) {
    var columns = [];
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
        for (var k in arr[i]) {
            if (!seen[k]) {
                seen[k] = true;
                columns.push(k);
            }
        }
    }
    var out = [address, columns];
    for (var i = 0; i < arr.length; i++) {
        var rec = arr[i];
        var row = [];
        for (var j = 0; j < columns.length; j++) {
            var v = rec[columns[j]];
            row.push(v === undefined ? null : v);
        }
        out.push(row);
    }
    return out;
}
// --- Entry point ---
// Registered as utils' osc() sink. Every module's osc(addr, val) lands here.
function send(address, val) {
    // Capabilities may arrive in the handshake or a ping; both pass through here
    // (k4-system sends /sendState and /pong via osc()), so re-check on either.
    if (address === '/sendState' || address === '/pong') {
        checkClientCapabilities();
    }
    // Columnar transform: an array of plain objects repeats its keys per record.
    // Rewrite to a compact /columnar flat array [ key, columns, ...rows ]; the app
    // de-columnarizes and re-dispatches to the original key. Transparent to
    // callers, capability-gated ('col'). Re-entering send() routes it like any
    // array — so a large one chunks via the normal path below (and element 0 is a
    // string, so isArrayOfObjects won't re-columnarize it).
    if (columnarEnabled && address !== '/columnar' && isArrayOfObjects(val)) {
        send('/columnar', columnarize(address, val));
        return;
    }
    // Only NUMERIC values ever go in the /batch envelope. Non-numeric payloads
    // (strings, JSON-encoded arrays/objects) are emitted immediately as their own
    // OSC packet — the app's /batch parser expects numeric values only, and
    // pre-fold osc() never batched non-numerics either.
    // Chunk-protocol pieces (/start//chunk//end) and meters go straight out; this
    // guard also stops the /chunk arrays emitted below from re-entering chunking.
    if (shouldBypass(address)) {
        sendDirect(address, val);
        return;
    }
    // Transport-level chunking: a large array is split into /start//chunk//end so
    // feature code never deals with packet size. Capability-gated (see shouldChunk).
    if (Array.isArray(val) && shouldChunk(address, val)) {
        sendChunked(address, val);
        return;
    }
    if (typeof val !== 'number') {
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
