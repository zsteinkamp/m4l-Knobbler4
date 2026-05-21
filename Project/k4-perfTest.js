"use strict";
// Performance test: [js] vs [v8] comparison harness
// Load in both [js k4-perfTest] and [v8 k4-perfTest] (each with 1 inlet, 2 outlets)
// Send "run" to execute all benchmarks, or run individual tests:
//   runLiveApi, runOutlets, runRequire, runCompute
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
autowatch = 1;
inlets = 1;
outlets = 2;
var OUTLET_RESULTS = 0;
var OUTLET_DUMP = 1;
var noFn = function () { };
var ITERATIONS = 500;
function post_line() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    post(args.join(' ') + '\n');
}
// ---------------------------------------------------------------------------
// Timing helper — runs fn() `reps` times and returns [min, median, max] in ms
// ---------------------------------------------------------------------------
function benchmark(label, reps, fn) {
    var times = [];
    for (var r = 0; r < reps; r++) {
        times.push(fn());
    }
    times.sort(function (a, b) { return a - b; });
    var result = {
        label: label,
        min: times[0],
        median: times[Math.floor(times.length / 2)],
        max: times[times.length - 1],
    };
    post_line("  ".concat(label, ": min=").concat(result.min, "ms  median=").concat(result.median, "ms  max=").concat(result.max, "ms"));
    return result;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getTrackPaths() {
    var api = new LiveAPI(noFn, 'live_set');
    var ids = [];
    var raw = api.get('tracks');
    for (var i = 0; i < raw.length; i++) {
        var n = parseInt(raw[i].toString());
        if (n.toString() === raw[i].toString())
            ids.push(n);
    }
    var paths = [];
    for (var i = 0; i < ids.length; i++) {
        api.id = ids[i];
        paths.push(api.unquotedpath);
    }
    // add return tracks
    api.path = 'live_set';
    var retRaw = api.get('return_tracks');
    for (var i = 0; i < retRaw.length; i++) {
        var n = parseInt(retRaw[i].toString());
        if (n.toString() === retRaw[i].toString()) {
            api.id = n;
            paths.push(api.unquotedpath);
        }
    }
    // add master
    paths.push('live_set master_track');
    return paths;
}
function getTrackIds() {
    var api = new LiveAPI(noFn, 'live_set');
    var ids = [];
    var raw = api.get('tracks');
    for (var i = 0; i < raw.length; i++) {
        var n = parseInt(raw[i].toString());
        if (n.toString() === raw[i].toString())
            ids.push(n);
    }
    var retRaw = api.get('return_tracks');
    for (var i = 0; i < retRaw.length; i++) {
        var n = parseInt(retRaw[i].toString());
        if (n.toString() === retRaw[i].toString())
            ids.push(n);
    }
    var masterRaw = api.get('master_track');
    var m = parseInt(masterRaw[0].toString());
    if (!isNaN(m))
        ids.push(m);
    return ids;
}
// ---------------------------------------------------------------------------
// LiveAPI tests
// ---------------------------------------------------------------------------
function testCreateDestroy(paths, n) {
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        var p = paths[i % paths.length];
        var api = new LiveAPI(noFn, p);
        api.get('name');
        api.id = 0;
    }
    return new Date().getTime() - t0;
}
function testReusePath(paths, n) {
    var api = new LiveAPI(noFn, 'live_set');
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        api.path = paths[i % paths.length];
        api.get('name');
    }
    var elapsed = new Date().getTime() - t0;
    api.id = 0;
    return elapsed;
}
function testReuseId(ids, n) {
    var api = new LiveAPI(noFn, 'live_set');
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        api.id = ids[i % ids.length];
        api.get('name');
    }
    var elapsed = new Date().getTime() - t0;
    api.id = 0;
    return elapsed;
}
function testCreateWithObserver(paths, n) {
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        var p = paths[i % paths.length] + ' mixer_device volume';
        var api = new LiveAPI(function () { }, p);
        api.property = 'value';
        api.get('value');
        api.id = 0;
    }
    return new Date().getTime() - t0;
}
function testReuseWithObserver(paths, n) {
    var api = new LiveAPI(function () { }, 'live_set');
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        api.path = paths[i % paths.length] + ' mixer_device volume';
        api.property = 'value';
        api.get('value');
    }
    var elapsed = new Date().getTime() - t0;
    api.id = 0;
    return elapsed;
}
// ---------------------------------------------------------------------------
// Outlet tests
// ---------------------------------------------------------------------------
function testOutletSimple(n) {
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        outlet(OUTLET_DUMP, 'test', i);
    }
    return new Date().getTime() - t0;
}
function testOutletList(n) {
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        outlet(OUTLET_DUMP, 'list', i, i * 0.5, 'hello', i + 1, i * 0.25, 'world');
    }
    return new Date().getTime() - t0;
}
function testOutletJson(n) {
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        var payload = JSON.stringify({
            type: 'update',
            slot: i % 32,
            value: Math.random(),
            name: 'Parameter ' + (i % 32),
        });
        outlet(OUTLET_DUMP, 'json', payload);
    }
    return new Date().getTime() - t0;
}
// ---------------------------------------------------------------------------
// Computation tests (pure JS, no Max API)
// ---------------------------------------------------------------------------
function testJsonSerialize(n) {
    var objects = [];
    for (var i = 0; i < 100; i++) {
        objects.push({
            id: i,
            name: 'Track ' + i,
            color: '#' + ((i * 12345) & 0xffffff).toString(16),
            params: Array.from({ length: 8 }, function (_, j) { return ({
                idx: j,
                value: Math.random(),
                name: 'Param ' + j,
            }); }),
        });
    }
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        JSON.stringify(objects[i % objects.length]);
        JSON.parse(JSON.stringify(objects[i % objects.length]));
    }
    return new Date().getTime() - t0;
}
function testArrayOps(n) {
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        var arr = Array.from({ length: 200 }, function (_, j) { return j * Math.random(); });
        arr.sort(function (a, b) { return a - b; });
        arr.filter(function (v) { return v > 50; });
        arr.map(function (v) { return v * 2; });
        arr.reduce(function (sum, v) { return sum + v; }, 0);
    }
    return new Date().getTime() - t0;
}
function testStringOps(n) {
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        var s = '';
        for (var j = 0; j < 100; j++) {
            s += 'track_' + j + '/device_' + (j % 5) + '/param_' + (j % 8) + ' ';
        }
        s.split(' ').filter(function (p) { return p.length > 0; });
        s.replace(/track_(\d+)/g, 'T$1');
    }
    return new Date().getTime() - t0;
}
// ---------------------------------------------------------------------------
// require() test — measure module loading overhead
// ---------------------------------------------------------------------------
function testRequire(n) {
    // Use eval to bypass TypeScript's require checks — we want runtime require()
    var req = eval('require');
    var t0 = new Date().getTime();
    for (var i = 0; i < n; i++) {
        req('./consts');
        req('./config');
    }
    return new Date().getTime() - t0;
}
// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------
function runLiveApi() {
    var paths = getTrackPaths();
    var ids = getTrackIds();
    var n = ITERATIONS;
    var reps = 5;
    post_line('=== LiveAPI Benchmarks ===');
    post_line('Tracks:', paths.length, ' Iterations:', n, ' Reps:', reps);
    // warm up
    testCreateDestroy(paths, 10);
    testReusePath(paths, 10);
    benchmark('create & destroy', reps, function () { return testCreateDestroy(paths, n); });
    benchmark('reuse, set path', reps, function () { return testReusePath(paths, n); });
    benchmark('reuse, set id', reps, function () { return testReuseId(ids, n); });
    benchmark('create w/ observer', reps, function () {
        return testCreateWithObserver(paths, n);
    });
    benchmark('reuse w/ observer', reps, function () {
        return testReuseWithObserver(paths, n);
    });
    post_line('');
}
function runOutlets() {
    var n = ITERATIONS * 10;
    var reps = 5;
    post_line('=== Outlet Benchmarks ===');
    post_line('Iterations:', n, ' Reps:', reps);
    benchmark('simple outlet', reps, function () { return testOutletSimple(n); });
    benchmark('list outlet', reps, function () { return testOutletList(n); });
    benchmark('json outlet', reps, function () { return testOutletJson(n); });
    post_line('');
}
function runCompute() {
    var n = ITERATIONS;
    var reps = 5;
    post_line('=== Computation Benchmarks ===');
    post_line('Iterations:', n, ' Reps:', reps);
    benchmark('JSON ser/deser', reps, function () { return testJsonSerialize(n); });
    benchmark('array ops', reps, function () { return testArrayOps(n); });
    benchmark('string ops', reps, function () { return testStringOps(n); });
    post_line('');
}
function runRequire() {
    var n = ITERATIONS * 10;
    var reps = 5;
    post_line('=== require() Benchmarks ===');
    post_line('Iterations:', n, ' Reps:', reps);
    benchmark('require (cached)', reps, function () { return testRequire(n); });
    post_line('');
}
function run() {
    post_line('');
    post_line('########################################');
    post_line('# Performance Test Harness');
    post_line('########################################');
    post_line('');
    runLiveApi();
    runOutlets();
    runCompute();
    runRequire();
    post_line('=== All done ===');
}
module.exports = {};
