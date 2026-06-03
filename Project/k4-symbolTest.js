"use strict";
// Symbol-table bloat test harness.
//
// Goal: determine whether various Max data paths leak strings into Max's
// global symbol table (t_symbol hash) by measuring whether shared-prefix
// gensym lookups slow down after the path is exercised.
//
// Workflow (run in a FRESH Max launch each time to isolate the result):
//   1. prep             — pre-creates BENCH_COUNT shared-prefix symbols
//   2. bench            — baseline: outlet those existing symbols, measure time
//   3. <stressOp> N     — exercises one candidate path with N fresh strings
//   4. bench            — repeat measurement; slowdown = symbols leaked
//
// Outlet 1 is patched to a [; max size] message; anything() bangs it after each
// command so the resulting symbol-table size prints to the Max console — one
// clean print per command. (Outlet 0 is the probe used for string interning;
// keeping it separate means the per-iteration outlet ops don't trigger size.)
//
// Comparing the ratio across stress ops tells us which paths intern strings.
//
// Stress ops:
//   stressOutlet N        — outlet(0, [addr, str]) — primitive JS string
//   stressOutletObj N     — outlet(0, [addr, new String(str)]) — wrapped
//   stressDictVal N       — dict.set(fixedKey, freshStr)
//   stressDictKey N       — dict.set(freshKey, fixedVal)
//   stressDictSerialize N — write+serialize+outlet the serialized result
//
//   stressReadStrSweep N  — api.call('str_for_value', v) over N DISTINCT values
//                           (master volume). Collects distinct OUTPUT strings in
//                           JS. MEASURED RESULT: reads do NOT intern in [v8] —
//                           59,715 distinct display strings cost +13 symbols, no
//                           bench slowdown. [v8] returns LiveAPI strings as
//                           t_string (like the new String(...) outlet adapter),
//                           NOT gensym'd t_symbol. So display-string reads are
//                           not a symbol-table source; this op now stands as the
//                           proof of that negative.
//   stressReadStrSame N   — control: str_for_value(0.5) N times → 1 distinct
//                           output. Confirms repeated identical reads are
//                           idempotent (only DISTINCT returned strings bloat).
//   stressPathSet N       — assign N distinct path strings to a reused LiveAPI
//                           (.path = ...). Tests whether LiveAPI PATH WRITES
//                           intern (observers / scratch reads / scroll / nav).
//                           Prints [v8] "invalid path" warnings; read the final
//                           size, not the warnings. MEASURED: 1000 paths ->
//                           +1014 symbols. Path WRITES intern ~1:1 (idempotent
//                           on revisit, so bounded by distinct paths built).
//                           Lever: prefer .id = N (numeric, no intern) over
//                           .path = 'id N' wherever the id is already known.
//
// Same compiled file loads in BOTH [js k4-symbolTest.js] and [v8 k4-symbolTest.js].
// To test whether [v8] strings intern as t_string (no bloat) vs t_symbol (bloat):
//   - load both engines side-by-side
//   - run prep/bench on the [js] instance (bench measurement is engine-agnostic
//     because the symbol table is global to the Max process)
//   - run stressOutlet / stressOutletObj on the [v8] instance
//   - re-run bench on the [js] instance — slowdown ⇒ [v8] also gensyms
// ---------------------------------------------------------------------------
// CONNECT-TIME ATTRIBUTION PROTOCOL
//
// Goal: split the ~45k symbols present after "open set + connect Knobbler" into
//   (1) Live's own set-load interning — device/parameter/clip/sample names Live
//       reads regardless of Knobbler. A FIXED cost we cannot reduce.
//   (2) Knobbler's connect burst — names/paths/value_items it reads on connect.
//       BOUNDED + idempotent (re-reading the same string adds no symbol).
//   (3) the session CLIMB (45k -> 100k) — LiveAPI PATH WRITES: every observer /
//       scratch read on the clips, mixer, and session pages assigns a distinct
//       path string (~1 symbol each). Bounded per set (idempotent on revisit)
//       but large, and bigger sets = more cells/strips = more paths. The real,
//       Knobbler-controllable growing class. (str_for_value reads were DISPROVEN
//       — see stressReadStrSweep above.)
//
// Procedure (record your symbol-table stat at each numbered step):
//   1. Open the set. Do NOT connect/Test Knobbler yet.            -> S1
//   2. Connect Knobbler; let the connect burst settle (~2-3 s:    -> S2
//      nav tree + visibleTracks + clip window + initial slot/strip pushes).
//   3. Sit IDLE (transport stopped, no automation, no knob moves) -> S3
//      for ~60 s. S3 - S2 should be ~0 — connect reads are bounded.
//   4. Navigate: open the clips, mixer, and session pages and scroll  -> S4..Sn
//      the grid / mixer on a large set. Sample after each. This is where
//      path-write symbols pile up fastest (observed empirically).
//
// Read it as:
//   S1            = Live's set-load floor (NOT ours).
//   S2 - S1       = Knobbler's bounded connect burst.
//   slope of S4.. = path-write growth from clips/mixer/session navigation.
//
// To prove the mechanisms with no special set: stressPathSet shows path writes
// intern (~1:1); stressReadStrSweep shows str_for_value reads do NOT. Run `bench`
// before/after to confirm the gensym table slowed only for the interning op.
// ---------------------------------------------------------------------------
var module = { exports: {} };
autowatch = 1;
inlets = 1;
// outlet 0: probe — the string-interning mechanism (stressOutlet outlets here).
// outlet 1: size report — wire to a [; max size] message; reportSize() bangs it
//           after every command so the symbol count prints, WITHOUT the
//           per-iteration probe outlets spamming it.
outlets = 2;
var PREFIX = 'sym_';
var BENCH_COUNT = 200000;
var BENCH_REPS = 5;
function p() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    post(args.join(' ') + '\n');
}
function now() {
    return new Date().getTime();
}
// Pre-created benchmark strings — populated by prep().
// These get gensym'd into the symbol table during prep, then re-looked-up
// repeatedly during bench. If subsequent stress ops bloat the table with
// shared-prefix strings, these lookups slow down.
var benchStrings = [];
var outMsg = ['/probe', null];
function outletString(s) {
    outMsg[1] = s;
    outlet(0, outMsg);
}
// Bang outlet 1 — wired in the patch to a [; max size] message — so the current
// symbol-table size prints to the Max console right after each op's own log
// line. anything() calls this after every command, giving "log the op, then
// show the resulting symbol count" with no manual bang. Separate from the probe
// outlet (0) so the per-iteration interning outlets never trigger it.
function reportSize() {
    outlet(1, 'bang');
}
var _testDict = null;
function testDict() {
    if (!_testDict)
        _testDict = new Dict('symTestDict');
    return _testDict;
}
// ---------------------------------------------------------------------------
function prep() {
    benchStrings = [];
    for (var i = 0; i < BENCH_COUNT; i++) {
        benchStrings.push(PREFIX + i);
    }
    // First call to outletString interns the symbol. Do all of them so the
    // bench step is pure lookup, not first-insert.
    for (var i = 0; i < BENCH_COUNT; i++) {
        outletString(benchStrings[i]);
    }
    p('prep: seeded', BENCH_COUNT, 'symbols with prefix', PREFIX);
}
function bench() {
    if (benchStrings.length === 0) {
        p('bench: run prep first');
        return;
    }
    var times = [];
    for (var r = 0; r < BENCH_REPS; r++) {
        var t0 = now();
        for (var i = 0; i < BENCH_COUNT; i++) {
            outletString(benchStrings[i]);
        }
        times.push(now() - t0);
    }
    times.sort(function (a, b) { return a - b; });
    p('bench: min=' +
        times[0] +
        'ms  median=' +
        times[Math.floor(times.length / 2)] +
        'ms  max=' +
        times[times.length - 1] +
        'ms');
}
// ---------------------------------------------------------------------------
// Stress ops — each generates N fresh shared-prefix strings via a different
// path. Use a high offset (1e6) so they never collide with benchStrings.
function freshStr(i) {
    return PREFIX + (1000000 + i);
}
function stressOutlet(n) {
    var t0 = now();
    for (var i = 0; i < n; i++) {
        outletString(freshStr(i));
    }
    p('stressOutlet:', n, 'in', now() - t0, 'ms');
}
// Same as stressOutlet but wraps the string in `new String(...)`. In [v8]
// this may produce a t_string atom rather than t_symbol — the whole point of
// testing this variant. In [js] it likely behaves the same as the primitive
// (both gensym), giving us a control comparison.
var outMsgObj = ['/probe', null];
function stressOutletObj(n) {
    var t0 = now();
    for (var i = 0; i < n; i++) {
        outMsgObj[1] = new String(freshStr(i));
        outlet(0, outMsgObj);
    }
    p('stressOutletObj:', n, 'in', now() - t0, 'ms');
}
function stressDictVal(n) {
    var d = testDict();
    var t0 = now();
    for (var i = 0; i < n; i++) {
        d.set('fixedKey', freshStr(i));
    }
    p('stressDictVal:', n, 'in', now() - t0, 'ms');
}
function stressDictKey(n) {
    var d = testDict();
    var t0 = now();
    for (var i = 0; i < n; i++) {
        d.set(freshStr(i), 1);
    }
    p('stressDictKey:', n, 'in', now() - t0, 'ms');
}
function stressDictSerialize(n) {
    var d = testDict();
    var t0 = now();
    for (var i = 0; i < n; i++) {
        d.set('payload', { v: freshStr(i) });
        // .stringify() returns a JSON string. If we don't outlet it, it never
        // becomes a Max atom — but if Max also gensyms during the serialize call
        // itself, this still bloats. We compare against a variant that outlets too.
        d.stringify();
    }
    p('stressDictSerialize:', n, 'in', now() - t0, 'ms');
}
// ---------------------------------------------------------------------------
// Read-side interning: a LiveAPI string read (.call('str_for_value', …)) returns
// a t_symbol atom, interning it. These ops measure that path. They use the
// master track volume, which exists in every Live set — no set-specific setup.
function noFn() { }
function fixFloat(v) {
    // Match utils.fixFloat: avoid scientific notation, which LiveAPI can't parse.
    return v.toFixed(10);
}
var _volApi = null;
function volApi() {
    if (!_volApi) {
        _volApi = new LiveAPI(noFn, 'live_set master_track mixer_device volume');
    }
    return _volApi;
}
// Sweep N distinct raw values [0,1] through str_for_value. The distinct OUTPUT
// count (collected in JS, no Set so it compiles to ES5) is exactly how many
// symbols this interned — typically << N, because Live rounds to display
// resolution. THIS is the proof that the symbol floor = distinct display
// strings, not call count.
function stressReadStrSweep(n) {
    var api = volApi();
    var seen = {};
    var distinct = 0;
    var t0 = now();
    for (var i = 0; i < n; i++) {
        var v = n > 1 ? i / (n - 1) : 0;
        var s = api.call('str_for_value', fixFloat(v)).toString();
        if (!seen[s]) {
            seen[s] = 1;
            distinct++;
        }
    }
    p('stressReadStrSweep:', n, 'calls in', now() - t0, 'ms; distinct display strings =', distinct, '(= symbols interned)');
}
// Control: same value every time → 1 distinct output → ~0 new symbols. Confirms
// repeated identical reads are idempotent. Run `bench` after — it should NOT
// have slowed, unlike after stressReadStrSweep.
function stressReadStrSame(n) {
    var api = volApi();
    var fixed = fixFloat(0.5);
    var t0 = now();
    for (var i = 0; i < n; i++) {
        api.call('str_for_value', fixed);
    }
    p('stressReadStrSame:', n, 'identical reads in', now() - t0, 'ms; 1 distinct string (control — should NOT bloat)');
}
// Assign N DISTINCT path strings to a reused LiveAPI (the hot path for scratch
// reads, observer re-pointing, clip-grid scroll, nav rebuilds). The string→Max
// conversion the .path setter performs is the candidate intern point. Uses
// non-existent high track indices so the strings are guaranteed distinct — this
// WILL print [v8] "invalid path" warnings (cosmetic); read the final `; max
// size` print, not the warnings. Keep N modest to limit warning volume.
// If size jumps by ~N here, path writes are the session-growth source.
function stressPathSet(n) {
    var api = volApi();
    var t0 = now();
    for (var i = 0; i < n; i++) {
        api.path = 'live_set tracks ' + (1000000 + i) + ' mixer_device volume';
    }
    p('stressPathSet:', n, 'distinct .path assignments in', now() - t0, 'ms');
}
// ---------------------------------------------------------------------------
function anything() {
    var cmd = messagename;
    var a = arrayfromargs(arguments);
    if (cmd === 'prep')
        prep();
    else if (cmd === 'bench')
        bench();
    else if (cmd === 'stressOutlet')
        stressOutlet(parseInt(a[0]) || 1000);
    else if (cmd === 'stressOutletObj')
        stressOutletObj(parseInt(a[0]) || 1000);
    else if (cmd === 'stressDictVal')
        stressDictVal(parseInt(a[0]) || 1000);
    else if (cmd === 'stressDictKey')
        stressDictKey(parseInt(a[0]) || 1000);
    else if (cmd === 'stressDictSerialize')
        stressDictSerialize(parseInt(a[0]) || 1000);
    else if (cmd === 'stressReadStrSweep')
        stressReadStrSweep(parseInt(a[0]) || 100000);
    else if (cmd === 'stressReadStrSame')
        stressReadStrSame(parseInt(a[0]) || 100000);
    else if (cmd === 'stressPathSet')
        stressPathSet(parseInt(a[0]) || 10000);
    else
        p('unknown cmd:', cmd);
    // Print the resulting symbol-table size (outlet 0 -> [; max size]).
    reportSize();
}
p('reloaded k4-symbolTest');
var _module = {};
module.exports = {};
