"use strict";
// [v8 knobbler] — the consolidated entry node. Receives OSC from [udpreceive]
// and dispatches by prefix to feature-module handlers via direct function calls
// (replacing the old [v8 router]'s outlet fan-out). Feature modules each export
// a `routes` table (the well-defined interface) and an optional `init`.
//
// Migration is incremental: this object and the old [v8 router] both sit on
// [udpreceive]. Routes that live here are removed from the router; unmatched
// addresses fall through (the router still handles them) until every module is
// folded in and the router is deleted.
var config_1 = require("./config");
var utils_1 = require("./utils");
var consts_1 = require("./consts");
var bluhand = require("./k4-bluhand");
var currentParam = require("./k4-currentParam");
var multiMixer = require("./k4-multiMixer");
var sidebarMixer = require("./k4-sidebarMixer");
var clipView = require("./k4-clipView");
var visibleTracks = require("./k4-visibleTracks");
var tracksDevices = require("./k4-tracksDevices");
var KnobblerCore = require("./knobblerCore");
var settings = require("./k4-settings");
var shortcuts = require("./k4-shortcuts");
var system = require("./k4-system");
autowatch = 1;
inlets = 1;
// Entry outlet map (see consts): 0 = OSC out, 1 = knobblerCore knob-slot
// bpatcher messages, 2 = shortcut name -> UI, 3 = ---LOOP, 4 = ---REFRESH_LOGIC,
// 5 = ---PAGE, 6 = ---CONFIGURE (udpsend).
outlets = 7;
var log = (0, utils_1.logFactory)(config_1.default);
// Orchestrator context handed to each module's init(ctx). The entry owns the
// live singletons; modules reach siblings through ctx (not direct imports —
// require() doesn't share module state across files in [v8]).
var ctx = {
    knobbler: { bkMap: KnobblerCore.bkMap },
    sidebar: { sidebarMeters: sidebarMixer.sidebarMeters },
    gotoDevice: bluhand.gotoDevice,
    notifyVisibleTracks: function () {
        clipView.visibleTracks();
        multiMixer.visibleTracks();
    },
    settings: { get: settings.get, set: settings.set },
};
// Patcher sends [settingsDictName ---settingsDict( on load (before init) — the
// resolved per-instance dict name. Open it once.
function settingsDictName(name) {
    settings.open(name.toString());
}
// Forward the device's dict prefix to the shared utils instance. One call
// serves every folded-in module — require() caches utils within one [v8], so
// the per-module setDictPrefix forwarding hack is gone.
function setDictPrefix(prefix) {
    (0, utils_1.setDictPrefix)(prefix);
}
// The Max UI "Meters" checkbox (chkMeters -> [sidebarMeters $1]) sends this
// Max message to the entry; forward it to the sidebar mixer.
function sidebarMeters(val) {
    sidebarMixer.sidebarMeters(val);
}
// Page changes drive meter flushing in both mixer modules AND switch the
// device's page UI (---PAGE), the latter formerly the router's pageHandler.
function pageDispatch(address) {
    var pageName = address.split('/')[2];
    multiMixer.page(pageName);
    sidebarMixer.page(pageName);
    outlet(consts_1.OUTLET_PAGE, 'page', pageName);
}
// Max message from the live.thisdevice version chain ([prepend setDeviceVersion]
// -> entry inlet). Selector matches this top-level fn, so Max calls it directly.
function setDeviceVersion(ver) {
    system.setDeviceVersion(ver);
}
// Routes owned by the entry itself (fan-outs that touch multiple modules).
var entryRoutes = [
    { prefix: '/page/', parse: 'custom', fn: pageDispatch },
];
// knobblerCore (the former [v8 knobbler4]) — OSC routes.
var knobblerRoutes = [
    { prefix: '/val', parse: 'slotVal', fn: KnobblerCore.val, coalesce: true },
    { prefix: '/unmap', parse: 'slot', fn: KnobblerCore.unmap },
    { prefix: '/xyJoin', parse: 'val', fn: KnobblerCore.xyJoin },
    { prefix: '/xySplit', parse: 'val', fn: KnobblerCore.xySplit },
    { prefix: '/defaultval', parse: 'slot', fn: KnobblerCore.setDefault },
    { prefix: '/default val', parse: 'slot', fn: KnobblerCore.setDefault },
    { prefix: '/track', parse: 'slot', fn: KnobblerCore.gotoTrackFor },
    { prefix: '/mkMap', parse: 'slotVal', fn: KnobblerCore.mkMap },
];
// Max-message handlers from the knob-slot bpatchers (UI / persistence params).
// These arrive as selectors on the entry inlet, not OSC.
function setMin(slot, val) {
    KnobblerCore.setMin(slot, val);
}
function setMax(slot, val) {
    KnobblerCore.setMax(slot, val);
}
function setPath(slot, paramPath) {
    KnobblerCore.setPath(slot, paramPath);
}
function setCustomName(slot, args) {
    KnobblerCore.setCustomName(slot, args);
}
function clearCustomName(slot) {
    KnobblerCore.clearCustomName(slot);
}
function clearPath(slot) {
    KnobblerCore.clearPath(slot);
}
// Load-chain trigger (was [v8 knobbler4]'s initAll).
function initAll() {
    KnobblerCore.initAll(ctx);
    KnobblerCore.refresh();
}
// --- Route table (merged from every migrated module) -----------------------
var ROUTES = [].concat(bluhand.routes, currentParam.routes, multiMixer.routes, sidebarMixer.routes, clipView.routes, visibleTracks.routes, shortcuts.routes, system.routes, knobblerRoutes, entryRoutes);
ROUTES.sort(function (a, b) { return (a.prefix.length > b.prefix.length ? -1 : 1); });
function getSlotNum(prefix, address) {
    var matches = address.substring(prefix.length).match(/^\d+/);
    return matches ? parseInt(matches[0]) : null;
}
function callRoute(route, address, value) {
    switch (route.parse) {
        case 'bare':
            return route.fn();
        case 'val':
            return route.fn(value);
        case 'slot':
            return route.fn(getSlotNum(route.prefix, address));
        case 'slotVal':
            return route.fn(getSlotNum(route.prefix, address), value);
        case 'custom':
            return route.fn(address, value);
    }
}
// --- Inbound coalescing (leading-edge, ported from router) -----------------
var COALESCE_MS = 15;
var coalesceEntries = {};
function makeCoalesceDeferred(entry) {
    return function () {
        entry.task = null;
        entry.lastSentTime = Date.now();
        callRoute(entry.route, entry.address, entry.val);
    };
}
function dispatchCoalesced(route, address, val) {
    var now = Date.now();
    var entry = coalesceEntries[address];
    if (!entry) {
        var e = {
            route: route,
            address: address,
            val: val,
            lastSentTime: now,
            task: null,
            deferredFn: null,
        };
        e.deferredFn = makeCoalesceDeferred(e);
        coalesceEntries[address] = e;
        callRoute(route, address, val);
        return;
    }
    if (now - entry.lastSentTime >= COALESCE_MS) {
        if (entry.task) {
            entry.task.cancel();
            entry.task.freepeer();
            entry.task = null;
        }
        entry.val = val;
        entry.lastSentTime = now;
        callRoute(route, address, val);
        return;
    }
    entry.val = val;
    if (!entry.task) {
        var delay = entry.lastSentTime + COALESCE_MS - now;
        entry.task = new Task(entry.deferredFn);
        entry.task.schedule(delay);
    }
}
// --- Dispatch core ---------------------------------------------------------
function dispatch(address, value) {
    for (var _i = 0, ROUTES_1 = ROUTES; _i < ROUTES_1.length; _i++) {
        var route = ROUTES_1[_i];
        if (address.indexOf(route.prefix) === 0) {
            if (route.coalesce) {
                return dispatchCoalesced(route, address, value);
            }
            return callRoute(route, address, value);
        }
    }
    // Unmatched: ignore. During the dual-run migration the old [v8 router]
    // still handles addresses that haven't been folded in here yet.
}
function anything(value) {
    var address = messagename;
    if (address === '/batch') {
        try {
            var batch = JSON.parse(value);
            var keys = Object.keys(batch);
            for (var i = 0; i < keys.length; i++) {
                dispatch(keys[i], batch[keys[i]]);
            }
        }
        catch (e) {
            log('bad inbound /batch: ' + e);
        }
        return;
    }
    dispatch(address, value);
}
// --- Lifecycle -------------------------------------------------------------
// Called from live.thisdevice on load and from the ---REFRESH chain. Each
// migrated module's init() is idempotent and re-pushes its state.
function init() {
    bluhand.init(ctx);
    currentParam.init();
    multiMixer.init(ctx);
    sidebarMixer.init(ctx);
    clipView.init();
    visibleTracks.init(ctx);
    tracksDevices.init();
    shortcuts.init(ctx);
    KnobblerCore.initAll(ctx); // idempotent slot setup
    KnobblerCore.refresh(); // re-push slot names/values/xy state
}
log('reloaded knobbler');
// NOTE: required boilerplate so tsc emits valid CommonJS for the [v8] object.
var module = {};
module.exports = {};
