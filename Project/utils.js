"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanArr = exports.sendChunkedData = exports.numArrToJson = exports.SEND_ADDR = exports.pauseUnpause = exports.buildOscPacket = exports.osc = exports.setOscSink = exports.meterVal = exports.getVisibleTracksList = exports.setVisibleTracks = exports.loadInstanceSetting = exports.saveInstanceSetting = exports.loadSetting = exports.saveSetting = exports.setDictPrefix = exports.debouncedTask = exports.isDeviceSupported = exports.truncate = exports.colorToString = exports.isValidPath = exports.dequote = exports.fixFloat = exports.logFactory = exports.detach = void 0;
var consts_1 = require("./consts");
// Safely tear down a LiveAPI observer: unsubscribe from property notifications
// before detaching, to prevent callbacks firing on invalidated objects
// (which can crash SpiderMonkey via JS_EncodeString null pointer).
function detach(api) {
    if (!api)
        return;
    api.property = '';
    api.id = 0;
}
exports.detach = detach;
function logFactory(_a) {
    var _b = _a.outputLogs, outputLogs = _b === void 0 ? true : _b;
    function log() {
        var args = [];
        for (var _a = 0; _a < arguments.length; _a++) {
            args[_a] = arguments[_a];
        }
        post(args
            .map(function (a) {
            return typeof a === 'string' ? a : JSON.stringify(a);
        })
            .join(' '), '\n');
    }
    if (!outputLogs) {
        return function () { };
    }
    return log;
}
exports.logFactory = logFactory;
// Format a float for LiveAPI.call() which stringifies args internally.
// Avoids scientific notation (e.g. 7.26e-05) which LiveAPI can't parse.
function fixFloat(val) {
    return val.toFixed(10);
}
exports.fixFloat = fixFloat;
function dequote(str) {
    //log(str, typeof str)
    return str.toString().replace(/^"|"$/g, '');
}
exports.dequote = dequote;
function isValidPath(path) {
    return typeof path === 'string' && path.match(/^live_set /);
}
exports.isValidPath = isValidPath;
function colorToString(colorVal) {
    if (!colorVal) {
        return consts_1.DEFAULT_COLOR;
    }
    var retString = parseInt(colorVal.toString()).toString(16).toUpperCase();
    var strlen = retString.length;
    for (var i = 0; i < 6 - strlen; i++) {
        retString = '0' + retString;
    }
    return retString;
}
exports.colorToString = colorToString;
function truncate(str, len) {
    //post('IN TRUNCATE ' + JSON.stringify({ str, len }) + '\n')
    if (str.length < len) {
        return str;
    }
    return str.substring(0, len - 2) + '…';
}
exports.truncate = truncate;
function isDeviceSupported(obj) {
    return !!obj.info.match(/property/);
}
exports.isDeviceSupported = isDeviceSupported;
var tasks = {};
function debouncedTask(key, slot, task, delayMs) {
    if (!tasks[key]) {
        tasks[key] = [];
    }
    if (tasks[key][slot]) {
        tasks[key][slot].cancel();
        tasks[key][slot].freepeer();
        tasks[key][slot] = null;
    }
    tasks[key][slot] = task;
    tasks[key][slot].schedule(delayMs);
}
exports.debouncedTask = debouncedTask;
// Cross-instance RUNTIME store (clientCapabilities, visibleTracks) — re-derived
// each session, never persisted. Named (not ---) so every module's utils
// instance shares it. Deliberately NOT 'settingsDict': that name now belongs to
// the re-added parameter-enabled [dict settingsDict] (the legacy-set bridge,
// read via a single ref in k4-settings) — pointing utils' ~15 instances at a
// parameter-enabled dict would risk the new-Dict-resets-contents gotcha.
var _settingsDict = new Dict('k4Runtime');
var _instancePrefix = '';
function setDictPrefix(prefix) {
    _instancePrefix = String(prefix) + '_';
}
exports.setDictPrefix = setDictPrefix;
function saveSetting(key, value) {
    _settingsDict.set(key, value);
}
exports.saveSetting = saveSetting;
function loadSetting(key) {
    return _settingsDict.get(key);
}
exports.loadSetting = loadSetting;
function saveInstanceSetting(key, value) {
    _settingsDict.set(_instancePrefix + key, value);
}
exports.saveInstanceSetting = saveInstanceSetting;
function loadInstanceSetting(key) {
    return _settingsDict.get(_instancePrefix + key);
}
exports.loadInstanceSetting = loadInstanceSetting;
// Cached typed accessor for the shared visibleTracks dict entry. Each [v8]
// module has its own utils instance (Max require() does not cache modules),
// so the cache is per-consumer. A version counter stored alongside the JSON
// payload keeps consumers in sync with the producer without re-parsing on
// every call.
var _visibleTracksCache = null;
var _visibleTracksCacheVersion = -1;
var VISIBLE_TRACKS_VERSION_MOD = 1048576;
function setVisibleTracks(value) {
    _settingsDict.set('visibleTracks', JSON.stringify(value));
    var prev = parseInt(_settingsDict.get('visibleTracksVersion')) || 0;
    var next = (prev + 1) % VISIBLE_TRACKS_VERSION_MOD;
    _settingsDict.set('visibleTracksVersion', next);
    _visibleTracksCache = value;
    _visibleTracksCacheVersion = next;
}
exports.setVisibleTracks = setVisibleTracks;
function getVisibleTracksList() {
    var version = parseInt(_settingsDict.get('visibleTracksVersion')) || 0;
    if (_visibleTracksCache && version === _visibleTracksCacheVersion) {
        return _visibleTracksCache;
    }
    var raw = _settingsDict.get('visibleTracks');
    if (!raw) {
        _visibleTracksCache = [];
        _visibleTracksCacheVersion = version;
        return _visibleTracksCache;
    }
    try {
        _visibleTracksCache = JSON.parse(raw.toString());
    }
    catch (e) {
        _visibleTracksCache = [];
    }
    _visibleTracksCacheVersion = version;
    return _visibleTracksCache;
}
exports.getVisibleTracksList = getVisibleTracksList;
function meterVal(raw) {
    return Math.round((parseFloat(raw) || 0) * 100) / 100;
}
exports.meterVal = meterVal;
// Reusable output array. All sends ship a complete OSC packet (built here) to
// the [node.script] sender as `packet <byte…>` — see k4-oscBatch. 'packet' is a
// fixed selector; the rest are byte ints (no symbol-table interaction).
var oscPktOut = ['packet'];
// OSC output sink — the orchestrator's oscBatch singleton, reached via ctx.
// Each module wires its own utils instance in init() with setOscSink(ctx.osc):
// Max require() does NOT cache modules, so every file gets its OWN utils
// instance with its own `oscSink`, and each must be pointed at the one shared
// oscBatch.send the entry put on ctx. When unset (standalone tools, or before
// init) osc() falls back to emitting directly to OUTLET_OSC.
var oscSink = null;
function setOscSink(fn) {
    oscSink = fn;
}
exports.setOscSink = setOscSink;
function osc(addr, val) {
    if (oscSink) {
        oscSink(addr, val);
        return;
    }
    // Fallback (no sink wired): build the packet and emit it the same way the
    // oscBatch sink would, so a node.script sender downstream handles it.
    var v = typeof val === 'number' && val !== (val | 0)
        ? Math.round(val * 1000000) / 1000000
        : val;
    var bytes = buildOscPacket(addr, v);
    oscPktOut.length = 1;
    for (var i = 0; i < bytes.length; i++) {
        oscPktOut.push(bytes[i]);
    }
    outlet(consts_1.OUTLET_OSC, oscPktOut);
}
exports.osc = osc;
// Build an OSC packet (address + single arg) as a flat array of byte values
// (0..255), handed to the [node.script] sender to transmit as a raw UDP
// datagram. Building the wire packet in JS keeps the payload out of Max's atom
// system entirely, avoiding the symbol-table bloat that emitting string args
// to a Max object would otherwise create by gensym'ing them.
//
// Arg encoding inferred from JS value type:
//   number (integer in int32 range)  → 'i', 4 bytes big-endian
//   number (other)                   → 'f', 4 bytes big-endian
//   string                           → 's', null-terminated, padded to 4
//   object / array / null / undefined → 's' with JSON.stringify (or 'null')
var _f32buf = new ArrayBuffer(4);
var _f32view = new DataView(_f32buf);
var _f32bytes = new Uint8Array(_f32buf);
function buildOscPacket(addr, value) {
    // No-arg OSC message (value omitted): just the address + an empty type-tag
    // string ",". Used for bare control sends like /page/X and /loop.
    if (value === undefined) {
        var noArg = [];
        for (var i = 0; i < addr.length; i++)
            noArg.push(addr.charCodeAt(i) & 0xff);
        noArg.push(0);
        while (noArg.length & 0x3)
            noArg.push(0);
        noArg.push(0x2c, 0, 0, 0); // "," null + pad, no arg bytes
        return noArg;
    }
    var tag;
    var intVal = 0;
    var floatVal = 0;
    var strVal = '';
    if (typeof value === 'number') {
        if ((value | 0) === value && value >= -2147483648 && value <= 2147483647) {
            tag = 'i';
            intVal = value;
        }
        else {
            tag = 'f';
            floatVal = value;
        }
    }
    else if (typeof value === 'string') {
        tag = 's';
        strVal = value;
    }
    else if (value === null || value === undefined) {
        tag = 's';
        strVal = String(value);
    }
    else {
        tag = 's';
        strVal = JSON.stringify(value);
    }
    var out = [];
    // address, null-terminated, padded to 4-byte boundary
    for (var i = 0; i < addr.length; i++)
        out.push(addr.charCodeAt(i) & 0xff);
    out.push(0);
    while (out.length & 0x3)
        out.push(0);
    // type tag string ",X" — 2 chars + null + 1 pad = 4 bytes, already aligned
    out.push(0x2c, tag.charCodeAt(0), 0, 0);
    // arg
    if (tag === 'i') {
        out.push((intVal >>> 24) & 0xff, (intVal >>> 16) & 0xff, (intVal >>> 8) & 0xff, intVal & 0xff);
    }
    else if (tag === 'f') {
        _f32view.setFloat32(0, floatVal, false);
        out.push(_f32bytes[0], _f32bytes[1], _f32bytes[2], _f32bytes[3]);
    }
    else {
        for (var i = 0; i < strVal.length; i++)
            out.push(strVal.charCodeAt(i) & 0xff);
        out.push(0);
        while (out.length & 0x3)
            out.push(0);
    }
    return out;
}
exports.buildOscPacket = buildOscPacket;
function pauseUnpause(p, delayMs) {
    if (p.task) {
        p.task.cancel();
    }
    else {
        p.task = new Task(function () {
            p.paused = false;
        });
    }
    p.paused = true;
    p.task.schedule(delayMs);
}
exports.pauseUnpause = pauseUnpause;
// Pre-computed OSC address strings for sends
exports.SEND_ADDR = [];
for (var _i = 0; _i < consts_1.MAX_SENDS; _i++) {
    exports.SEND_ADDR[_i] = '/mixer/send' + (_i + 1);
}
function numArrToJson(arr) {
    return '[' + arr.join(',') + ']';
}
exports.numArrToJson = numArrToJson;
var CHUNK_MAX_BYTES = 1024;
function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
}
function sendChunkedData(prefix, items) {
    var caps = loadSetting('clientCapabilities');
    var chunked = caps && (' ' + caps.toString() + ' ').indexOf(' cNav ') !== -1;
    if (chunked) {
        osc(prefix + '/start', items.length);
        var chunkItems = [];
        var chunkSize = 2;
        var allParts = [];
        for (var i = 0; i < items.length; i++) {
            var itemJson = JSON.stringify(items[i]);
            allParts.push(itemJson);
            var added = (chunkItems.length > 0 ? 1 : 0) + itemJson.length;
            if (chunkItems.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
                osc(prefix + '/chunk', chunkItems);
                chunkItems = [];
                chunkSize = 2;
            }
            chunkItems.push(items[i]);
            chunkSize += added;
        }
        if (chunkItems.length > 0) {
            osc(prefix + '/chunk', chunkItems);
        }
        var checksum = simpleHash('[' + allParts.join(',') + ']');
        osc(prefix + '/end', checksum);
    }
    if (!chunked) {
        osc(prefix, items);
    }
}
exports.sendChunkedData = sendChunkedData;
// Filter an id-observer arg down to its numeric ids, returning them AS
// numbers. The arg comes from LiveAPI as strings (e.g. ["id", "42", "id",
// "55"]); each numeric-looking string round-trips through parseInt and the
// rest are dropped. Returning numbers (matching the declared IdArr type) is
// required by [v8]'s LiveAPI .id setter, which rejects strings.
function cleanArr(arr) {
    if (!arr)
        return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
        var e = arr[i];
        var n = parseInt(e);
        if (!isNaN(n) && n.toString() === e.toString()) {
            out.push(n);
        }
    }
    return out;
}
exports.cleanArr = cleanArr;
