"use strict";
// Background prefetch: walk the parts of a large set that are NOT on screen,
// reading their state directly (no observers), and hand it to the app in small
// batches so a scroll paints from a warm cache instead of waiting for a
// /mixerView or /clipView round trip.
//
// This file holds only the scheduling and ordering, shared by k4-multiMixer and
// k4-clipView. It has no LiveAPI in it, so the policy is unit-testable.
//
// COST MODEL — the thing to protect is Live's main thread. LiveAPI reads run
// there (not on the audio thread), so an unbounded sweep would not drop audio
// but WOULD make Live's UI and Max's scheduler sluggish. Three bounds:
//
//   1. A pass runs in slices of at most SLICE_MS, then yields GAP_MS to the
//      scheduler. The deadline is checked after every unit (one strip, one clip
//      slot), so a slice overshoots by at most one unit. While a pass is running
//      it can hold at most SLICE_MS / (SLICE_MS + GAP_MS) of the thread.
//   2. Full passes happen only when the app's cache is known to be invalid: on
//      connect/refresh and on a track or scene structure change.
//   3. Repeat passes (which pick up changes made off-screen, e.g. from a Push)
//      wait IDLE_FACTOR times the previous pass's measured busy time, and never
//      less than MIN_IDLE_MS. The long-run average is therefore at most
//      1 / (1 + IDLE_FACTOR) of one thread REGARDLESS OF SET SIZE — a bigger set
//      simply re-sweeps less often. They also stop when the app stops pinging.
//
// Every pass records its own busy time; /debug/prefetch reports it, so the cost
// is a measured number for a real set rather than an estimate.
Object.defineProperty(exports, "__esModule", { value: true });
exports.maxScheduler = exports.createSweep = exports.idleAfter = exports.nearestFirst = exports.FLUSH_MS = exports.IDLE_FACTOR = exports.MIN_IDLE_MS = exports.GAP_MS = exports.SLICE_MS = exports.CAPABILITY_PREFETCH = void 0;
exports.CAPABILITY_PREFETCH = 'pre';
exports.SLICE_MS = 4;
exports.GAP_MS = 20;
exports.MIN_IDLE_MS = 5000;
exports.IDLE_FACTOR = 20;
// Batches are sent at most this often. Each batch costs the app a commit (the
// clip grid re-serializes the whole matrix per message), so fewer, larger
// batches are cheaper there than a stream of tiny ones.
exports.FLUSH_MS = 250;
// All of [0, n), with the window [lo, hi) first and then alternating outward
// (right, left, right, …) — so the strips a scroll is most likely to reveal next
// are read first. A window outside the list (e.g. -1 before a page has ever
// opened) degrades to plain ascending order.
function nearestFirst(n, lo, hi) {
    var out = [];
    if (n <= 0)
        return out;
    var start = Math.min(Math.max(lo, 0), n);
    var end = Math.min(Math.max(hi, start), n);
    for (var i = start; i < end; i++)
        out.push(i);
    var right = end;
    var left = start - 1;
    while (right < n || left >= 0) {
        if (right < n)
            out.push(right++);
        if (left >= 0)
            out.push(left--);
    }
    return out;
}
exports.nearestFirst = nearestFirst;
// Idle time before the next repeat pass, given how long the last one worked.
function idleAfter(busyMs) {
    return Math.max(exports.MIN_IDLE_MS, busyMs * exports.IDLE_FACTOR);
}
exports.idleAfter = idleAfter;
// `schedule` is injected so the policy can be tested without Max's Task.
function createSweep(hooks, schedule) {
    var stats = {
        passes: 0,
        lastBusyMs: 0,
        lastWallMs: 0,
        lastUnits: 0,
        lastSent: 0,
        lastIdleMs: 0,
    };
    var pending = null;
    var fresh = true;
    var passStart = 0;
    var busy = 0;
    var units = 0;
    var sent = 0;
    function next(ms) {
        pending = schedule(tick, ms);
    }
    function tick() {
        pending = null;
        if (fresh) {
            fresh = false;
            if (!hooks.begin()) {
                // Declined — typically because the app's capabilities haven't reached
                // us yet: the connect refresh can run before the handshake that carries
                // them. Check again later rather than never, while an app is there.
                if (hooks.repeat()) {
                    fresh = true;
                    next(exports.MIN_IDLE_MS);
                }
                return;
            }
            passStart = Date.now();
            busy = 0;
            units = 0;
            sent = 0;
        }
        var t0 = Date.now();
        var deadline = t0 + exports.SLICE_MS;
        var done = false;
        do {
            var r = hooks.step();
            if (r < 0) {
                done = true;
                break;
            }
            units += r;
        } while (Date.now() < deadline);
        busy += Date.now() - t0;
        hooks.flush(done);
        if (!done) {
            next(exports.GAP_MS);
            return;
        }
        stats.passes++;
        stats.lastBusyMs = busy;
        stats.lastWallMs = Date.now() - passStart;
        stats.lastUnits = units;
        stats.lastSent = sent;
        stats.lastIdleMs = 0;
        if (hooks.repeat()) {
            stats.lastIdleMs = idleAfter(busy);
            fresh = true;
            next(stats.lastIdleMs);
        }
    }
    return {
        stats: stats,
        start: function () {
            if (pending)
                pending.cancel();
            fresh = true;
            next(0);
        },
        stop: function () {
            if (pending)
                pending.cancel();
            pending = null;
        },
        noteSent: function () {
            sent++;
        },
    };
}
exports.createSweep = createSweep;
// Max's Task, wrapped to the shape createSweep wants. One Task per sweep,
// re-scheduled rather than re-created.
function maxScheduler() {
    var task = null;
    var current = null;
    var handle = {
        cancel: function () {
            if (task)
                task.cancel();
        },
    };
    return function (fn, ms) {
        current = fn;
        if (!task) {
            task = new Task(function () {
                current();
            });
        }
        task.cancel();
        task.schedule(ms);
        return handle;
    };
}
exports.maxScheduler = maxScheduler;
