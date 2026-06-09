"use strict";
// Debug / instrumentation routes for the integration-test harness.
//
// These let the app emulator poll runtime diagnostics OVER OSC, turning the
// manual k4-symbolTest investigation into an automated gate. Two routes:
//
//   /debug/symbolCount  -> replies /debug/symbolCount <n>   (absolute count)
//   /debug/bench        -> replies /debug/bench <medianMs>  (relative leak signal)
//
// --- /debug/symbolCount: why the file round-trip -----------------------------
// Max's global symbol-table count is NOT reachable programmatically: the
// `; max size` report only PRINTS to the Max Console; the [console] object has
// no outlets; and no `max` message replies to a [receive]. (Confirmed against
// the Cycling '74 "Messages to Max" + [console] reference, June 2026.) The one
// capture path is via a file:
//   1. (first poll only) create a [console]; clear it  (clear hits the GLOBAL console)
//   2. messnamed('max','size')          -> posts "<n> symbols ..." to the console
//   3. [console] write <file>           -> dumps the console text to disk
//   4. read the file here, regex the integer, OSC it back
// Steps 2->3 and 3->4 need a scheduler tick so the post lands / the write flushes.
//
// NO resident patcher object in the shipped device: the [console] is created via
// the scripting API (patcher.newdefault) LAZILY on the first poll and kept for
// the session. A device that never receives this route never creates it -> ZERO
// debug footprint. Reusing ONE [console] across polls (vs create+remove each
// time) keeps per-poll interning at ~0, so a long monitoring session doesn't bias
// its own symbol-count curve upward (~7 symbols/poll would compound to thousands
// over an hour at 5s polling). clear/write act on the GLOBAL Max console (not a
// buffer the object owns), so it works immediately. `; max size` hits the global
// `max` object via messnamed('max','size').
//
// --- /debug/bench: relative leak tripwire ------------------------------------
// Re-looks-up a one-time-seeded cohort of shared-prefix symbols and times it; a
// bloated table makes the gensym lookups slower, so a rising median across a
// session signals symbol growth even without the absolute count. NOTE: seeding
// the cohort itself interns BENCH_COUNT symbols ONCE (a constant offset). Don't
// interleave /debug/bench with /debug/symbolCount in a run where you want clean
// absolute numbers — seed pollutes the very table symbolCount measures.
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.routes = void 0;
var utils_1 = require("./utils");
var k4_config_1 = require("./k4-config");
var log = (0, utils_1.logFactory)(k4_config_1.default);
var SYMCOUNT_FILE = '/tmp/k4_symcount.txt';
var WRITE_DELAY_MS = 80; // let `; max size`'s post reach the console buffer
var READ_DELAY_MS = 80; // let [console] finish flushing the file to disk
// Reusable Tasks (created once, rescheduled) — never per-call new Task (leak).
var writeTask = null;
var readTask = null;
// The [console], created lazily on the first poll and kept for the session (see
// header). null until the route is first called, so an unused device has none.
var consoleObj = null;
function now() {
    return new Date().getTime();
}
// --- /debug/symbolCount ------------------------------------------------------
function readSymCountFile() {
    try {
        var f = new File(SYMCOUNT_FILE, 'read');
        if (!f.isopen) {
            log('symbolCount: cannot open ' + SYMCOUNT_FILE + ' (console wiring set up?)');
            return -1;
        }
        var text = f.readstring(f.eof);
        f.close();
        // Tolerant of Max's exact wording / thousands separators:
        // "There are 48213 symbols in memory." / "48,213 symbols defined."
        var m = text.match(/([\d,]+)\s+symbols?\b/i);
        if (!m) {
            log('symbolCount: no "<n> symbols" line in console dump');
            return -1;
        }
        return parseInt(m[1].replace(/,/g, ''), 10);
    }
    catch (e) {
        log('symbolCount read error: ' + e);
        return -1;
    }
}
// Create the [console] once, on first use, and keep it. newdefault places it in
// the patching layer (not presentation), so it's invisible in the Live device
// view; it persists until the device reloads.
function ensureConsole() {
    if (!consoleObj) {
        consoleObj = patcher.newdefault(0, 0, 'console');
    }
}
function onWriteTick() {
    consoleObj.message('write', SYMCOUNT_FILE);
    if (!readTask) {
        readTask = new Task(function () {
            (0, utils_1.osc)('/debug/symbolCount', readSymCountFile());
        });
    }
    readTask.schedule(READ_DELAY_MS);
}
function symbolCount() {
    ensureConsole();
    consoleObj.message('clear'); // start from an empty console
    messnamed('max', 'size'); // post "<n> symbols ..." to the console
    if (!writeTask) {
        writeTask = new Task(onWriteTick);
    }
    writeTask.schedule(WRITE_DELAY_MS);
}
// --- /debug/bench ------------------------------------------------------------
var BENCH_PREFIX = 'k4dbg_';
var BENCH_REPS = 5;
var BENCH_COUNT_DEFAULT = 50000;
var benchDict = null;
var benchCount = 0; // 0 until seeded
// Seed the cohort once via Dict-key sets (key writes intern ~1:1). Re-setting an
// EXISTING key later is a pure gensym lookup (no new symbol) — that's the bench.
function ensureBenchSeed(count) {
    if (benchCount > 0) {
        return;
    }
    benchDict = new Dict('k4dbgBenchDict');
    for (var i = 0; i < count; i++) {
        benchDict.set(BENCH_PREFIX + i, 1);
    }
    benchCount = count;
    log('bench: seeded ' + count + ' symbols (one-time table offset)');
}
function bench(arg) {
    var requested = parseInt(arg) || BENCH_COUNT_DEFAULT;
    ensureBenchSeed(requested);
    var times = [];
    for (var r = 0; r < BENCH_REPS; r++) {
        var t0 = now();
        // Re-set the seeded keys: each is a gensym lookup against the live table.
        for (var i = 0; i < benchCount; i++) {
            benchDict.set(BENCH_PREFIX + i, 1);
        }
        times.push(now() - t0);
    }
    times.sort(function (a, b) { return a - b; });
    (0, utils_1.osc)('/debug/bench', times[Math.floor(times.length / 2)]);
}
// --- lifecycle ---------------------------------------------------------------
function init(c) {
    (0, utils_1.setOscSink)(c.osc); // own utils instance -> shared batch buffer (see CLAUDE.md)
}
exports.init = init;
log('reloaded k4-debug');
var routes = [
    { prefix: '/debug/symbolCount', parse: 'bare', fn: symbolCount },
    { prefix: '/debug/bench', parse: 'val', fn: bench },
];
exports.routes = routes;
