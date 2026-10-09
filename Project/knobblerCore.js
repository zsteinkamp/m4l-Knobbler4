"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.xySplit = exports.xyJoin = exports.viewUnmap = exports.viewName = exports.viewMin = exports.viewMax = exports.viewClearName = exports.val = exports.unmap = exports.uiPageSelect = exports.swap = exports.showPage = exports.showLegacyPage = exports.setPageOrder = exports.setDictPrefix = exports.setDefault = exports.renamePage = exports.refresh = exports.moveCells = exports.mkMap = exports.initAll = exports.importLegacyPath = exports.importLegacyMin = exports.importLegacyMax = exports.importLegacyCustomName = exports.gotoTrackFor = exports.bkMap = exports.addPage = void 0;
var utils_1 = require("./utils");
Object.defineProperty(exports, "setDictPrefix", { enumerable: true, get: function () { return utils_1.setDictPrefix; } });
var liveApi_1 = require("./liveApi");
var consts_1 = require("./consts");
var deviceParam_1 = require("./deviceParam");
var k4_config_1 = require("./k4-config");
var log = (0, utils_1.logFactory)(k4_config_1.default);
// Orchestrator context (set in initAll) — per-instance persistence via ctx.settings.
var ctx = null;
// Pre-computed OSC address strings (indexed 1–MAX_SLOTS)
var ADDR_VAL = [];
var ADDR_VALSTR = [];
var ADDR_VALCOLOR = [];
var ADDR_PARAM = [];
var ADDR_PARAM_AUTO = [];
var ADDR_DEVICE = [];
var ADDR_TRACK = [];
var ADDR_QUANT = [];
var ADDR_QUANT_ITEMS = [];
for (var _i = 1; _i <= consts_1.MAX_SLOTS; _i++) {
    ADDR_VAL[_i] = '/val' + _i;
    ADDR_VALSTR[_i] = '/valStr' + _i;
    ADDR_VALCOLOR[_i] = '/val' + _i + 'color';
    ADDR_PARAM[_i] = '/param' + _i;
    ADDR_PARAM_AUTO[_i] = '/param' + _i + 'auto';
    ADDR_DEVICE[_i] = '/device' + _i;
    ADDR_TRACK[_i] = '/track' + _i;
    ADDR_QUANT[_i] = '/quant' + _i;
    ADDR_QUANT_ITEMS[_i] = '/quantItems' + _i;
}
// Module-level scratchpad for one-off lookups (reuse via .path is fastest)
// Initialized in initAll() to avoid "Live API is not initialized" at load time
var scratchApi = null;
// Set true by initAll() (gated by live.thisdevice). Bpatcher parameters
// can fire setMin/setMax/setPath before the API is ready — queue those.
var apiReady = false;
var pendingCalls = [];
// slot arrays
var paramObj = [];
var paramNameObj = [];
var automationStateObj = [];
var deviceObj = [];
var trackObj = [];
var parentNameObj = [];
var parentColorObj = [];
var param = [];
var outMin = [];
var outMax = [];
// ONE repeating poll for all slots, not one Task per mapped slot: the old
// shape ran up to 32 separate 1s timers, each doing its own LiveAPI reads.
var deviceCheckerTask = null;
var DEVICE_CHECK_MS = 1000;
// other vars
var allowMapping = [];
var allowUpdateFromOsc = [];
// XY pad pairs - stores left indices of active pairs
var xyPairs = [];
var XY_PAIRS_KEY = 'xyPairs';
function isSlotInPair(slot) {
    for (var i = 0; i < xyPairs.length; i++) {
        if (xyPairs[i] === slot || xyPairs[i] + 1 === slot) {
            return xyPairs[i];
        }
    }
    return null;
}
function saveXYPairs() {
    ctx.settings.set(XY_PAIRS_KEY, xyPairs);
}
function loadXYPairs() {
    var val = ctx.settings.get(XY_PAIRS_KEY);
    // Carry forward from pre-[v8] sets: old xyPairs lived in the shared
    // [dict settingsDict] under "<port>_xyPairs". Migrate it once.
    // TODO(cleanup, after 2026-07-01 / v65): remove — see k4-settings legacy bridge.
    if (!(val && typeof val === 'object')) {
        var legacy = ctx.settings.legacyGet(XY_PAIRS_KEY);
        if (legacy && typeof legacy === 'object') {
            val = legacy;
            ctx.settings.set(XY_PAIRS_KEY, legacy);
        }
    }
    //log('LOAD XY PAIRS val=' + JSON.stringify(val))
    if (val && typeof val === 'object') {
        xyPairs = val.filter(function (n) {
            return typeof n === 'number' && !isNaN(n);
        });
    }
    else {
        xyPairs = [];
    }
}
function sendXYPairs() {
    //log('SEND XY PAIRS', JSON.stringify(xyPairs))
    (0, utils_1.osc)('/xyPairs', xyPairs);
}
// --- Slot persistence -------------------------------------------------------
//
// ctx.settings (---settingsDict) is the ONLY store for knobbler config: per
// slot path/min/max/customName (slot_<N>_<field>), plus the page names
// (kPages) and XY pairs (xyPairs). Everything is written there on mutation and
// read back by restoreSlot() on load/refresh.
function slotKey(slot, field) {
    return 'slot_' + slot + '_' + field;
}
function persistSlotPath(slot, path) {
    if (ctx)
        ctx.settings.set(slotKey(slot, 'path'), path || '');
}
// True once a slot field has ANY stored value. A cleared slot is stored as ''
// (clearSlotSettings), so this is how "never configured" differs from
// "deliberately emptied" — the distinction the legacy importers depend on.
function hasSetting(slot, field) {
    var v = ctx.settings.get(slotKey(slot, field));
    return v !== null && v !== undefined;
}
// Restore one slot from ctx.settings. Idempotent — safe to re-run on every
// refresh()/reconnect (matched values are no-ops).
function restoreSlot(slot) {
    if (!ctx)
        return;
    var sPath = ctx.settings.get(slotKey(slot, 'path'));
    if (typeof sPath === 'string' && sPath.length) {
        if (!param[slot] || param[slot].path !== sPath) {
            setPath(slot, sPath);
        }
    }
    // min / max are stored as the 0–100 integers setMin/setMax take
    var sMin = ctx.settings.get(slotKey(slot, 'min'));
    if (typeof sMin === 'number' && outMin[slot] !== sMin / 100.0) {
        setMin(slot, sMin);
    }
    var sMax = ctx.settings.get(slotKey(slot, 'max'));
    if (typeof sMax === 'number' && outMax[slot] !== sMax / 100.0) {
        setMax(slot, sMax);
    }
    var sName = ctx.settings.get(slotKey(slot, 'customName'));
    if (sName === consts_1.nullString) {
        // Saved by a bug (the legacy importer took the name field's "- - -"
        // default for a name); it would mask the parameter's own name.
        ctx.settings.set(slotKey(slot, 'customName'), '');
        if (param[slot] && param[slot].customName)
            clearCustomName(slot);
    }
    else if (typeof sName === 'string' && sName.length) {
        if (param[slot] && param[slot].customName !== sName) {
            setCustomName(slot, sName);
        }
    }
}
// --- Legacy importers (REMOVE after 2028-05-21) ----------------------------
//
// Before v61 (2026-05-21) slot config lived ONLY in the 32 knob-slot
// bpatchers' parameters (#N_path, #N_targetMin, #N_targetMax, #N_eparam).
// Those bpatchers stay in the device, hidden, purely so a set last saved before
// then still loads its mappings: Live restores their parameters on load, and
// their setPath/setMin/setMax/setCustomName messages land here.
//
// The device no longer WRITES them, so their values go stale the moment a
// fader moves or a slot is unmapped. That is why a value is imported only into
// a slot with NO stored setting at all, and why an imported (or overruled) path
// and name are then CLEARED in the bpatcher: saved, the set carries nothing
// for them to resurrect, and each importer goes inert after one save. Min/max
// can't be cleared that way — the bpatcher's only reset makes its numboxes
// output, which would loop back in here — but they need not be: once a slot's
// min/max setting exists, the importer is ignored for good.
//
// After 2028-05-21: delete the 32 bpatchers1..32 (and their 160 parameters)
// from both devices, this section, and the entry's setPath/setMin/setMax/
// setCustomName/clearCustomName handlers.
function whenReady(fn) {
    if (apiReady)
        fn();
    else
        pendingCalls.push(fn);
}
function importLegacyPath(slot, path) {
    whenReady(function () {
        if (slot < 1 || slot > consts_1.LEGACY_UI_SLOTS || !path)
            return;
        if (!hasSetting(slot, 'path') && (0, utils_1.isValidPath)(path)) {
            initSlotIfNecessary(slot);
            setPath(slot, path); // persists to settings
        }
        legacyMsg(slot, ['path', '']);
    });
}
exports.importLegacyPath = importLegacyPath;
function importLegacyMin(slot, val) {
    whenReady(function () {
        if (slot < 1 || slot > consts_1.LEGACY_UI_SLOTS)
            return;
        if (!hasSetting(slot, 'min'))
            setMin(slot, val); // persists
    });
}
exports.importLegacyMin = importLegacyMin;
function importLegacyMax(slot, val) {
    whenReady(function () {
        if (slot < 1 || slot > consts_1.LEGACY_UI_SLOTS)
            return;
        if (!hasSetting(slot, 'max'))
            setMax(slot, val); // persists
    });
}
exports.importLegacyMax = importLegacyMax;
function importLegacyCustomName(slot, name) {
    whenReady(function () {
        // The bpatcher's name field DEFAULTS to the "- - -" placeholder, and Live
        // restores that on a fresh device: it is "no name", not a name to import.
        if (slot < 1 || slot > consts_1.LEGACY_UI_SLOTS || !isCustomName(name))
            return;
        if (!hasSetting(slot, 'customName')) {
            initSlotIfNecessary(slot);
            setCustomName(slot, name); // persists
        }
        legacyMsg(slot, ['param', '']);
    });
}
exports.importLegacyCustomName = importLegacyCustomName;
// Clear a slot's persisted state (explicit user unmap, not the startup init()).
function clearSlotSettings(slot) {
    if (!ctx)
        return;
    ctx.settings.set(slotKey(slot, 'path'), '');
    ctx.settings.set(slotKey(slot, 'customName'), '');
}
function xyJoin(leftIdx) {
    //log('xyJOIN', leftIdx)
    if (leftIdx < 1 || leftIdx >= consts_1.MAX_SLOTS) {
        return;
    }
    // check no overlap with existing pairs
    if (isSlotInPair(leftIdx) !== null || isSlotInPair(leftIdx + 1) !== null) {
        return;
    }
    xyPairs.push(leftIdx);
    //log('JOIN', leftIdx, leftIdx + 1)
    saveXYPairs();
    sendXYPairs();
}
exports.xyJoin = xyJoin;
function xySplit(leftIdx) {
    var idx = xyPairs.indexOf(leftIdx);
    if (idx === -1) {
        return;
    }
    xyPairs.splice(idx, 1);
    saveXYPairs();
    sendXYPairs();
}
exports.xySplit = xySplit;
function unmap(slot) {
    //log(`UNMAP ${slot}`)
    // if slot is part of a pair, remove that pair
    var pairLeft = isSlotInPair(slot);
    if (pairLeft !== null) {
        xySplit(pairLeft);
    }
    init(slot);
    clearSlotSettings(slot); // explicit user unmap — drop persisted mapping
    refreshSlotUI(slot);
}
exports.unmap = unmap;
function captureSlot(slot) {
    var p = param[slot];
    return {
        path: p && p.path ? p.path : '',
        min: outMin[slot] !== undefined ? Math.round(outMin[slot] * 100) : 0,
        max: outMax[slot] !== undefined ? Math.round(outMax[slot] * 100) : 100,
        customName: p && p.customName ? p.customName : '',
    };
}
function applySnapshot(slot, snap) {
    init(slot, !!snap.path);
    if (snap.path) {
        setPath(slot, snap.path);
        setMin(slot, snap.min);
        setMax(slot, snap.max);
        if (snap.customName)
            setCustomName(slot, snap.customName);
    }
    else {
        clearSlotSettings(slot);
        // The range travelled with the fader; an emptied slot starts full-range
        // rather than handing the old one to whatever is mapped here next.
        setMin(slot, 0);
        setMax(slot, 100);
        refreshSlotUI(slot);
    }
}
function swap(slotA, slotB) {
    if (!apiReady) {
        pendingCalls.push(function () {
            swap(slotA, slotB);
        });
        return;
    }
    if (slotA === slotB)
        return;
    if (slotA < 1 || slotA > consts_1.MAX_SLOTS || slotB < 1 || slotB > consts_1.MAX_SLOTS)
        return;
    // Snapshot both before tearing down (each references the other).
    var snapA = captureSlot(slotA);
    var snapB = captureSlot(slotB);
    // A true swap (both slots mapped) keeps any XY pairs: a pair is a slot-INDEX
    // grouping, so swapping the params in those slots doesn't change which indices
    // are paired — mapping onto half a pad just shows the new param. But a MOVE
    // (one slot empty) leaves a paired slot half-empty, so split any pair either
    // slot belongs to.
    if (!snapA.path || !snapB.path) {
        var pairA = isSlotInPair(slotA);
        if (pairA !== null)
            xySplit(pairA);
        var pairB = isSlotInPair(slotB);
        if (pairB !== null)
            xySplit(pairB);
    }
    applySnapshot(slotA, snapB);
    applySnapshot(slotB, snapA);
}
exports.swap = swap;
// --- Pages -----------------------------------------------------------------
//
// The app shows the slots as named pages of SLOTS_PER_PAGE, page k owning slots
// k*16+1..k*16+16 (the Bluhand bank scheme). A page is nothing but a NAME, so
// slot index stays the identity of a fader and everything keyed on it —
// mappings, XY pairs, the app's value cache — is untouched. Moving a fader is a
// slot rewrite; reordering or deleting a page is the same rewrite in blocks.
// Rewrites re-point the slot's existing observers (reArmSlot), so none of this
// tears an observer down and leaks symbols.
var PAGES_KEY = 'kPages';
var pageNames = [];
// Matches the app's default (knobbler-native lib/knobblerPages.ts).
function defaultPageName(idx) {
    return 'Knobbler ' + (idx + 1);
}
function cleanPageName(name, idx) {
    var s = name == null ? '' : String(name).trim();
    return s.length ? s.substring(0, consts_1.MAX_NAME_LEN) : defaultPageName(idx);
}
function loadPages() {
    var val = ctx.settings.get(PAGES_KEY);
    if (val && typeof val === 'object' && val.length > 0) {
        var arr = val.slice(0, consts_1.MAX_PAGES);
        pageNames = arr.map(function (n, i) {
            return cleanPageName(n, i);
        });
    }
    else {
        // Every set made before pages existed had exactly these two.
        pageNames = [defaultPageName(0), defaultPageName(1)];
    }
}
function savePages() {
    ctx.settings.set(PAGES_KEY, pageNames);
}
function sendPages() {
    (0, utils_1.osc)('/kPages', pageNames);
    sendPageMenu();
}
// Slots anyone can address: every page's, and never fewer than the 32 an older
// app (or the device's own knob-slot UI) reaches.
function activeSlots() {
    return Math.max(consts_1.LEGACY_UI_SLOTS, pageNames.length * consts_1.SLOTS_PER_PAGE);
}
function sameSnapshot(a, b) {
    return (a.path === b.path &&
        (!a.path ||
            (a.min === b.min && a.max === b.max && a.customName === b.customName)));
}
// Rewrite slots[i] to hold snaps[i]. Snapshots must all be captured BEFORE the
// first rewrite (a move reads slots it also writes). A slot already holding its
// target is skipped, so a block move only re-points what actually changed.
function rewriteSlots(slots, snaps) {
    for (var i = 0; i < slots.length; i++) {
        if (sameSnapshot(captureSlot(slots[i]), snaps[i]))
            continue;
        applySnapshot(slots[i], snaps[i]);
    }
}
function setPairs(pairs) {
    xyPairs = pairs;
    saveXYPairs();
    sendXYPairs();
}
function parseArgs(val) {
    try {
        var arr = typeof val === 'string' ? JSON.parse(val) : val;
        return arr && typeof arr === 'object' && arr.length != null ? arr : null;
    }
    catch (e) {
        return null;
    }
}
// A cell range [slot, slot+width) that exists and doesn't wrap onto the next row.
function validCells(slot, width) {
    if (slot < 1 || slot + width - 1 > activeSlots())
        return false;
    return width === 1 || (slot - 1) % consts_1.SLOTS_PER_ROW !== consts_1.SLOTS_PER_ROW - 1;
}
// /kMove '[from, to, width]' — the app's Layout-mode drop. width 1 moves a
// single fader, width 2 an XY pad (from = its left slot). Whatever sat at the
// destination goes to the cells the move vacated, so a pad dropped one cell
// over rotates its neighbour around it rather than overwriting it. A single
// can't land on half a pad, and a pad can't straddle another pad.
function moveCells(val) {
    if (!apiReady) {
        pendingCalls.push(function () {
            moveCells(val);
        });
        return;
    }
    var args = parseArgs(val);
    if (!args)
        return;
    var from = +args[0];
    var to = +args[1];
    var width = +args[2] === 2 ? 2 : 1;
    if (from === to || !validCells(from, width) || !validCells(to, width))
        return;
    var toIsPad = width === 2 && xyPairs.indexOf(to) !== -1;
    if (width === 2) {
        if (xyPairs.indexOf(from) === -1)
            return;
        if (!toIsPad) {
            for (var s = to; s < to + 2; s++) {
                var pad = isSlotInPair(s);
                if (pad !== null && pad !== from)
                    return;
            }
        }
    }
    else if (isSlotInPair(from) !== null || isSlotInPair(to) !== null) {
        return;
    }
    var src = [];
    var dst = [];
    for (var i = 0; i < width; i++) {
        src.push(from + i);
        dst.push(to + i);
    }
    var slots = dst.slice();
    var snaps = src.map(captureSlot);
    var vacated = src.filter(function (s) {
        return dst.indexOf(s) === -1;
    });
    var displaced = dst.filter(function (s) {
        return src.indexOf(s) === -1;
    });
    for (var i = 0; i < vacated.length; i++) {
        slots.push(vacated[i]);
        snaps.push(captureSlot(displaced[i]));
    }
    // Pairs are positional: a pad moving onto plain cells takes its pair marker
    // with it; two pads swapping leave both markers where they are.
    if (width === 2 && !toIsPad) {
        setPairs(xyPairs
            .filter(function (p) {
            return p !== from;
        })
            .concat([to]));
    }
    rewriteSlots(slots, snaps);
}
exports.moveCells = moveCells;
// Lay the pages out in a new order: order[k] is the OLD index of the page that
// becomes page k, so leaving an index out deletes that page (and unmaps its
// faders — the caller confirms). Slots past the new last page are cleared.
function rearrangePages(order) {
    var oldCount = pageNames.length;
    var lastSlot = activeSlots();
    var slots = [];
    var snaps = [];
    for (var k = 0; k < order.length; k++) {
        for (var j = 1; j <= consts_1.SLOTS_PER_PAGE; j++) {
            slots.push(k * consts_1.SLOTS_PER_PAGE + j);
            snaps.push(captureSlot(order[k] * consts_1.SLOTS_PER_PAGE + j));
        }
    }
    var empty = { path: '', min: 0, max: 100, customName: '' };
    for (var s = order.length * consts_1.SLOTS_PER_PAGE + 1; s <= lastSlot; s++) {
        // Below LEGACY_UI_SLOTS a slot past the last page is still reachable by an
        // older app, so only a deleted page's own slots are cleared there.
        if (s <= consts_1.LEGACY_UI_SLOTS && s > oldCount * consts_1.SLOTS_PER_PAGE)
            continue;
        slots.push(s);
        snaps.push(empty);
    }
    var pairs = [];
    for (var i = 0; i < xyPairs.length; i++) {
        var page = Math.floor((xyPairs[i] - 1) / consts_1.SLOTS_PER_PAGE);
        if (page >= oldCount) {
            pairs.push(xyPairs[i]); // a legacy slot outside every page: untouched
            continue;
        }
        var k = order.indexOf(page);
        if (k !== -1)
            pairs.push(xyPairs[i] + (k - page) * consts_1.SLOTS_PER_PAGE);
    }
    pageNames = order.map(function (i) {
        return pageNames[i];
    });
    savePages();
    sendPages();
    setPairs(pairs);
    rewriteSlots(slots, snaps);
    setUiPage(uiPage); // the page showing may have moved or gone
}
// /kPageOrder '[old indices…]' — reorder and/or delete pages in one op.
function setPageOrder(val) {
    if (!apiReady) {
        pendingCalls.push(function () {
            setPageOrder(val);
        });
        return;
    }
    var args = parseArgs(val);
    if (!args || !args.length)
        return;
    var order = [];
    for (var i = 0; i < args.length; i++) {
        var idx = +args[i];
        if (!(idx >= 0 && idx < pageNames.length) || order.indexOf(idx) !== -1) {
            return;
        }
        order.push(idx);
    }
    rearrangePages(order);
}
exports.setPageOrder = setPageOrder;
// /kPageAdd 'name' — append a page. Its slots are whatever already sits there:
// empty by construction past slot 32, and below it possibly mapped by an older
// app or the device's own UI, which is worth showing rather than clearing.
function addPage(name) {
    if (!apiReady) {
        pendingCalls.push(function () {
            addPage(name);
        });
        return;
    }
    if (pageNames.length >= consts_1.MAX_PAGES)
        return;
    var idx = pageNames.length;
    pageNames.push(cleanPageName(name, idx));
    savePages();
    sendPages();
    for (var j = 1; j <= consts_1.SLOTS_PER_PAGE; j++) {
        refreshSlotUI(idx * consts_1.SLOTS_PER_PAGE + j);
    }
    setUiPage(uiPage);
}
exports.addPage = addPage;
// /kPageRename '[idx, name]'
function renamePage(val) {
    if (!ctx)
        return;
    var args = parseArgs(val);
    if (!args)
        return;
    var idx = +args[0];
    if (!(idx >= 0 && idx < pageNames.length))
        return;
    pageNames[idx] = cleanPageName(args[1], idx);
    savePages();
    sendPages();
}
exports.renamePage = renamePage;
// --- Device UI: the Knobbler view ------------------------------------------
//
// The device's Knobbler tab shows ONE page at a time in 16 view bpatchers
// (knobView-bpatcher.maxpat, varnames view1..view16). A view has no slot of its
// own: it listens on "---<VIEW_TARGET_BASE + pos>-SLOT" (the patcher's one
// forwarder addresses targets by number, and the legacy importers keep 1..32)
// and reports edits with its POSITION
// (viewMin/viewMax/viewName/viewClearName/viewUnmap), and this module maps
// positions to slots through uiPage. Switching pages is just refreshViews().
// The page menu beside the tab is filled and selected through OUTLET_PAGE
// ("kmenu …" → the patcher's route).
var uiPage = 0;
function sendMsg(slot, msg) {
    var pos = slot - uiPage * consts_1.SLOTS_PER_PAGE;
    if (pos < 1 || pos > consts_1.SLOTS_PER_PAGE)
        return;
    outlet(consts_1.OUTLET_MSGS, __spreadArray([consts_1.VIEW_TARGET_BASE + pos], msg, true));
}
// To one of the hidden legacy importer bpatchers (see Legacy importers).
function legacyMsg(slot, msg) {
    outlet(consts_1.OUTLET_MSGS, __spreadArray([slot], msg, true));
}
function slotOfView(pos) {
    return uiPage * consts_1.SLOTS_PER_PAGE + pos;
}
function sendViewRange(slot) {
    sendMsg(slot, [
        'range',
        outMin[slot] !== undefined ? Math.round(outMin[slot] * 100) : 0,
        outMax[slot] !== undefined ? Math.round(outMax[slot] * 100) : 100,
    ]);
}
// Everything a view shows for one slot.
function sendView(slot) {
    initSlotIfNecessary(slot);
    sendMsg(slot, ['mapped', paramObj[slot] ? true : false]);
    sendMsg(slot, ['param', paramNameOf(slot)]);
    sendMsg(slot, ['device', deviceNameOf(slot)]);
    sendMsg(slot, ['track', trackNameOf(slot)]);
    sendMsg(slot, __spreadArray(['color'], colorOf(slot), true));
    sendViewRange(slot);
}
function refreshViews() {
    for (var pos = 1; pos <= consts_1.SLOTS_PER_PAGE; pos++) {
        sendView(slotOfView(pos));
    }
}
function sendPageMenu() {
    outlet(consts_1.OUTLET_PAGE, ['kmenu', 'clear']);
    for (var i = 0; i < pageNames.length; i++) {
        outlet(consts_1.OUTLET_PAGE, ['kmenu', 'append', pageNames[i]]);
    }
    outlet(consts_1.OUTLET_PAGE, ['kmenu', 'set', uiPage]);
}
// Show page `idx` (clamped) on the device. Doesn't tell the app — callers that
// start on the device do that themselves. Also offers the page to the
// automatable "Knobbler Page" parameter (1-based); the patcher applies it with
// `set` (so it records without echoing back here) only while Automate Page Chg
// is on, the same gate the Page tab uses. Automation playing back arrives as
// uiPage <idx> from that parameter.
function setUiPage(idx) {
    // The saved parameter can land before the page list has loaded; clamp to the
    // device maximum then, and refresh() clamps to the real count afterwards.
    var last = (pageNames.length || consts_1.MAX_PAGES) - 1;
    uiPage = Math.max(0, Math.min(last, Math.floor(+idx) || 0));
    outlet(consts_1.OUTLET_PAGE, ['kmenu', 'set', uiPage]);
    outlet(consts_1.OUTLET_PAGE, ['kparam', uiPage + 1]);
    refreshViews();
}
// /kShow <idx> — the app switched pages.
function showPage(val) {
    whenReady(function () {
        setUiPage(+val);
    });
}
exports.showPage = showPage;
// The device's page menu: switch, and have the app follow.
function uiPageSelect(idx) {
    whenReady(function () {
        setUiPage(idx);
        (0, utils_1.osc)('/kShow', uiPage);
    });
}
exports.uiPageSelect = uiPageSelect;
// An older app names Knobbler pages knobbler1/knobbler2 in /page/.
function showLegacyPage(pageName) {
    if (pageName === 'knobbler1')
        showPage(0);
    else if (pageName === 'knobbler2')
        showPage(1);
}
exports.showLegacyPage = showLegacyPage;
// Edits from a view, by position on the page showing.
function viewMin(pos, val) {
    setMin(slotOfView(pos), val);
}
exports.viewMin = viewMin;
function viewMax(pos, val) {
    setMax(slotOfView(pos), val);
}
exports.viewMax = viewMax;
function viewName(pos, name) {
    setCustomName(slotOfView(pos), name);
}
exports.viewName = viewName;
function viewClearName(pos) {
    clearCustomName(slotOfView(pos));
}
exports.viewClearName = viewClearName;
function viewUnmap(pos) {
    unmap(slotOfView(pos));
}
exports.viewUnmap = viewUnmap;
function bkMap(slot, id) {
    if (!apiReady)
        return;
    scratchApi.id = id;
    setPath(slot, scratchApi.unquotedpath);
}
exports.bkMap = bkMap;
// Resolve a mixer OSC path (e.g. "/mixer/3/vol", "/mixer/0/send1",
// "/mixer/vol") to a Live API parameter path and bind it to the given slot.
function mkMap(slot, mixerPath) {
    if (!apiReady) {
        pendingCalls.push(function () {
            mkMap(slot, mixerPath);
        });
        return;
    }
    if (!mixerPath)
        return;
    var parts = String(mixerPath).split('/'); // ['', 'mixer', '3', 'vol'] or ['', 'mixer', 'vol']
    if (parts.length < 3 || parts[1] !== 'mixer') {
        log('mkMap: unrecognized path ' + mixerPath);
        return;
    }
    var stripIdx = null;
    var ctrl;
    if (parts.length >= 4) {
        stripIdx = parseInt(parts[2]);
        ctrl = parts[3];
    }
    else {
        ctrl = parts[2];
    }
    // Crossfader without a strip index = the master crossfader itself.
    // With a strip index = that track's crossfade_assign (A/B/off routing),
    // handled below in the per-track branch.
    if (ctrl === 'crossfader' && (stripIdx === null || isNaN(stripIdx))) {
        setPath(slot, 'live_set master_track mixer_device crossfader');
        return;
    }
    if (ctrl === 'cue') {
        setPath(slot, 'live_set master_track mixer_device cue_volume');
        return;
    }
    var trackPath = null;
    if (stripIdx === null || isNaN(stripIdx)) {
        // Single-strip variant: resolve against Knobbler's current track (focus;
        // Live's selection when locked).
        scratchApi.path = ctx.focus.trackPath();
        trackPath = scratchApi.unquotedpath;
    }
    else {
        var list = (0, utils_1.getVisibleTracksList)();
        if (!list || list.length === 0) {
            log('mkMap: visibleTracks dict empty');
            return;
        }
        if (stripIdx < 0 || stripIdx >= list.length) {
            log('mkMap: stripIdx ' + stripIdx + ' out of range');
            return;
        }
        trackPath = list[stripIdx].path;
    }
    if (!trackPath)
        return;
    var paramPath;
    if (ctrl === 'vol') {
        paramPath = trackPath + ' mixer_device volume';
    }
    else if (ctrl === 'pan') {
        paramPath = trackPath + ' mixer_device panning';
    }
    else if (ctrl === 'mute') {
        // mute is exposed as mixer_device.track_activator (inverted: activator=1
        // means unmuted) — bind as a normal parameter
        paramPath = trackPath + ' mixer_device track_activator';
    }
    else if (ctrl === 'crossfader') {
        // NOTE: crossfade_assign is an int property on mixer_device (0=A, 1=off,
        // 2=B), NOT a DeviceParameter — setPath can't bind it. Same situation as
        // Track.solo. Will need the property-binding code path to support this.
        log('mkMap: crossfade_assign binding not yet supported (not a DeviceParameter)');
        return;
    }
    else if (ctrl.indexOf('send') === 0) {
        var sendNum = parseInt(ctrl.substring(4));
        if (isNaN(sendNum) || sendNum < 1) {
            log('mkMap: bad send spec ' + ctrl);
            return;
        }
        paramPath = trackPath + ' mixer_device sends ' + (sendNum - 1);
    }
    else {
        log('mkMap: unsupported control ' + ctrl);
        return;
    }
    setPath(slot, paramPath);
}
exports.mkMap = mkMap;
function initAll(c) {
    (0, utils_1.setOscSink)(c.osc);
    ctx = c;
    if (!scratchApi)
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
    apiReady = true;
    for (var i = 1; i <= consts_1.MAX_SLOTS; i++) {
        initSlotIfNecessary(i);
    }
    // Replay calls that arrived before the API was ready
    var queued = pendingCalls;
    pendingCalls = [];
    for (var i = 0; i < queued.length; i++) {
        queued[i]();
    }
}
exports.initAll = initAll;
function initSlotIfNecessary(slot) {
    if (!param[slot]) {
        init(slot);
    }
}
// quiet: the slot is about to be re-pointed (applySnapshot), and its new value
// string follows at once — blanking it first would flash "- - -" in between.
function init(slot, quiet) {
    if (!apiReady) {
        pendingCalls.push(function () {
            init(slot, quiet);
        });
        return;
    }
    //log(`INIT ${slot}`)
    if (paramObj[slot]) {
        (0, liveApi_1.detach)(paramObj[slot]);
        if (!quiet)
            (0, utils_1.osc)(ADDR_VALSTR[slot], consts_1.nullString);
    }
    paramObj[slot] = null;
    allowMapping[slot] = true;
    allowUpdateFromOsc[slot] = true;
    // Full range until setMin/setMax (or the stored settings) narrow it. Only
    // those two ever wrote the range, and slots 1-32 got it from their knob-slot
    // bpatcher's numboxes, so a slot past 32 had none: min and max both
    // undefined read as min == max, and sendVal then reported every change from
    // Live as 0 / "- - -".
    if (outMin[slot] === undefined)
        outMin[slot] = 0;
    if (outMax[slot] === undefined)
        outMax[slot] = 1;
    param[slot] = {
        val: 0,
        min: 0,
        max: 100,
        quant: 0,
        quantItems: [],
        allowParamValueUpdates: true,
    };
    (0, liveApi_1.detach)(paramNameObj[slot]);
    (0, liveApi_1.detach)(automationStateObj[slot]);
    (0, liveApi_1.detach)(deviceObj[slot]);
    (0, liveApi_1.detach)(parentNameObj[slot]);
    (0, liveApi_1.detach)(parentColorObj[slot]);
    (0, liveApi_1.detach)(trackObj[slot]);
    sendMsg(slot, ['mapped', false]);
}
function setMin(slot, val) {
    //log(`SETMIN ${slot}: ${val}`)
    initSlotIfNecessary(slot);
    outMin[slot] = val / 100.0;
    if (ctx)
        ctx.settings.set(slotKey(slot, 'min'), val);
    sendViewRange(slot);
    sendVal(slot);
}
function setMax(slot, val) {
    //log(`SETMAX ${slot}: ${val}`)
    initSlotIfNecessary(slot);
    outMax[slot] = val / 100.0;
    if (ctx)
        ctx.settings.set(slotKey(slot, 'max'), val);
    sendViewRange(slot);
    sendVal(slot);
}
function clearCustomName(slot) {
    //log()
    param[slot].customName = null;
    if (ctx)
        ctx.settings.set(slotKey(slot, 'customName'), '');
    sendParamName(slot);
}
// A real custom name — not empty, and not the "- - -" placeholder the device
// shows (and its name fields default to) for "none". Stored as a name, the
// placeholder would hide the mapped parameter's own name.
function isCustomName(name) {
    return !!name && String(name) !== consts_1.nullString;
}
function setCustomName(slot, args) {
    //log(args)
    if (!param[slot]) {
        return;
    }
    if (!isCustomName(args))
        return clearCustomName(slot);
    if (ctx)
        ctx.settings.set(slotKey(slot, 'customName'), args);
    param[slot].customName = args;
    sendParamName(slot);
}
function gotoTrackFor(slot) {
    if (!trackObj[slot]) {
        return;
    }
    ctx.gotoTrack((0, liveApi_1.apiId)(trackObj[slot]).toString()); // shared nav: unfolds groups
}
exports.gotoTrackFor = gotoTrackFor;
function setDefault(slot) {
    //log('DEFAULT TOP ' + slot)
    if (!paramObj[slot]) {
        return;
    }
    if (!allowUpdateFromOsc[slot]) {
        return;
    }
    var defaultValue = paramObj[slot].get('default_value');
    if (typeof defaultValue !== 'object') {
        return;
    }
    defaultValue = defaultValue[0];
    paramObj[slot].set('value', defaultValue);
}
exports.setDefault = setDefault;
function paramValueCallback(slot, iargs) {
    if (!param[slot])
        return;
    //log(args, 'ALLOW_UPDATES=', param[slot].allowParamValueUpdates)
    if (param[slot].allowParamValueUpdates) {
        if (iargs[0] === 'value') {
            //log("PARAM_VAL", typeof(iargs[1]), iargs[1], "\n");
            param[slot].val = iargs[1];
            sendVal(slot);
        }
    }
}
function paramNameCallback(slot, iargs) {
    if (!param[slot])
        return;
    if (iargs[0] === 'name') {
        param[slot].name = iargs[1];
        sendParamName(slot);
    }
}
function automationStateCallback(slot, iargs) {
    if (iargs[0] === 'automation_state') {
        sendAutomationState(slot);
    }
}
function deviceNameCallback(slot, iargs) {
    if (!param[slot])
        return;
    if (iargs[0] === 'name') {
        param[slot].deviceName = iargs[1];
        sendDeviceName(slot);
    }
}
function parentNameCallback(slot, iargs) {
    if (iargs[0] === 'name') {
        param[slot].parentName = iargs[1];
        sendTrackName(slot);
    }
}
function parentColorCallback(slot, iargs) {
    if (!param[slot])
        return;
    if (iargs[0] === 'color') {
        param[slot].trackColor = (0, utils_1.colorToString)(iargs[1]) + 'FF';
        sendColor(slot);
    }
}
// Start the shared "is the mapped device still there / did its path move?"
// poll on the first mapping. It stays running for the life of the device;
// checkAllDevicesPresent skips unmapped slots, so an idle instance does no
// LiveAPI work beyond the array scan.
function ensureDeviceChecker() {
    if (deviceCheckerTask) {
        return;
    }
    deviceCheckerTask = new Task(checkAllDevicesPresent);
    deviceCheckerTask.interval = DEVICE_CHECK_MS;
    deviceCheckerTask.repeat(-1);
}
function checkAllDevicesPresent() {
    for (var slot = 1; slot <= consts_1.MAX_SLOTS; slot++) {
        if (paramObj[slot]) {
            checkDevicePresent(slot);
        }
    }
}
function checkDevicePresent(slot) {
    //log('CHECK_DEVICE_PRESENT ' + slot)
    if (!param[slot])
        return;
    if (deviceObj[slot] && !deviceObj[slot].unquotedpath) {
        //log(`slot=${slot} DEVICE DELETED`)
        init(slot);
        return;
    }
    // check if path has changed (e.g. inserting a track above this one)
    if (paramObj[slot] && paramObj[slot].unquotedpath !== param[slot].path) {
        //log(
        //  `UPDATE PATH slot=${slot} new=${paramObj[slot].unquotedpath} old=${param[slot].path}`
        //)
        setPath(slot, paramObj[slot].unquotedpath);
    }
}
// An "id N" reference (or ["id", N]) -> N; a positional path string -> 0. The
// .path setter REJECTS "id N" (only the constructor accepts it), so targets that
// come from get('canonical_parent') must be re-pointed by .id, not .path.
function idFromRef(ref) {
    var s = (Array.isArray(ref) ? ref.join(' ') : String(ref)).trim();
    var m = s.match(/^id\s+(\d+)$/);
    if (m)
        return parseInt(m[1]);
    if (/^\d+$/.test(s))
        return parseInt(s);
    return 0;
}
// Re-point (or lazily create) a per-slot observer instead of dropping the old one
// and making a new one on every (re)map. Reuse is free; dropping an armed LiveAPI
// for GC leaks ~6 symbols and can fire its callback mid-finalization (see
// CLAUDE.md / the cue-point note). property '' unsubscribes before moving target.
// Targets may be a positional path string (paramPath, matches[0]) or an id ref
// (canonical_parent); re-point the latter by .id since .path rejects "id N".
function reArmSlot(api, cb, target, prop) {
    if (!api)
        api = new LiveAPI(cb, '');
    var id = idFromRef(target);
    api.property = '';
    if (id)
        api.id = id;
    else
        api.path = target;
    if (prop)
        api.property = prop;
    return api;
}
function setPath(slot, paramPath) {
    //log(`SETPATH ${slot}: ${paramPath}`)
    if (!apiReady) {
        pendingCalls.push(function () {
            setPath(slot, paramPath);
        });
        return;
    }
    initSlotIfNecessary(slot);
    //log(paramPath)
    if (!(0, utils_1.isValidPath)(paramPath)) {
        //log(`skipping ${slot}: ${paramPath}`)
        return;
    }
    // Re-point (or create) the param value observer, then validate the resolved id.
    var pv = reArmSlot(paramObj[slot], function (iargs) { return paramValueCallback(slot, iargs); }, paramPath, '');
    if (!(0, liveApi_1.apiValid)(pv)) {
        log("Invalid path for slot ".concat(slot, ": ").concat(paramPath));
        return;
    }
    pv.property = 'value';
    paramObj[slot] = pv;
    paramNameObj[slot] = reArmSlot(paramNameObj[slot], function (iargs) { return paramNameCallback(slot, iargs); }, paramPath, 'name');
    automationStateObj[slot] = reArmSlot(automationStateObj[slot], function (iargs) { return automationStateCallback(slot, iargs); }, paramPath, 'automation_state');
    param[slot].id = (0, liveApi_1.apiId)(paramObj[slot]);
    param[slot].path = paramObj[slot].unquotedpath;
    param[slot].val = parseFloat(paramObj[slot].get('value'));
    param[slot].min = parseFloat(paramObj[slot].get('min')) || 0;
    param[slot].max = parseFloat(paramObj[slot].get('max')) || 1;
    param[slot].name = paramObj[slot].get('name')[0];
    var isQuantized = parseInt(paramObj[slot].get('is_quantized')) > 0;
    param[slot].quantItems = isQuantized
        ? paramObj[slot].get('value_items')
        : [];
    param[slot].quant = param[slot].quantItems.length;
    deviceObj[slot] = reArmSlot(deviceObj[slot], function (iargs) { return deviceNameCallback(slot, iargs); }, paramObj[slot] && paramObj[slot].get('canonical_parent'), '' // property set conditionally below
    );
    var devicePath = deviceObj[slot].unquotedpath;
    ensureDeviceChecker(); // one shared poll covers every mapped slot
    // Only get the device name if it has the name property
    if (deviceObj[slot].info.match(/property name str/)) {
        deviceObj[slot].property = 'name';
        param[slot].deviceName = deviceObj[slot].get('name');
    }
    else if (param[slot].path.match(/mixer_device/)) {
        param[slot].deviceName = 'Mixer';
    }
    var parentId = deviceObj[slot].get('canonical_parent');
    // parent name
    parentNameObj[slot] = reArmSlot(parentNameObj[slot], function (iargs) { return parentNameCallback(slot, iargs); }, parentId, 'name');
    param[slot].parentName = parentNameObj[slot].get('name');
    // parent color
    parentColorObj[slot] = reArmSlot(parentColorObj[slot], function (iargs) { return parentColorCallback(slot, iargs); }, parentId, 'color');
    param[slot].trackColor =
        (0, utils_1.colorToString)(parentColorObj[slot].get('color')) + 'FF';
    // Try to get the track name
    var matches = devicePath.match(/^live_set tracks \d+/) ||
        devicePath.match(/^live_set return_tracks \d+/) ||
        devicePath.match(/^live_set master_track/);
    if (matches) {
        // NOT an observer — a plain handle so gotoTrackFor(slot) can resolve the
        // owning track. (It used to be armed with a trackNameCallback and an empty
        // property, so the callback could never fire; the strip's track label comes
        // from parentNameObj.)
        trackObj[slot] = reArmSlot(trackObj[slot], consts_1.noFn, matches[0], '');
    }
    //log("PARAM DATA", JSON.stringify(param), "\n");
    sendMsg(slot, ['mapped', true]);
    persistSlotPath(slot, param[slot].path); // ctx.settings (migration target)
    // Defer outputting the new param val because the controller
    // will not process it since it was just sending other vals
    // that triggered the mapping.
    var sendValTask = new Task(function () {
        sendVal(slot);
    });
    (0, utils_1.debouncedTask)('sendVal', slot, sendValTask, 333);
    sendNames(slot);
}
function refresh() {
    //log('IN REFRESH')
    if (!apiReady) {
        pendingCalls.push(function () {
            refresh();
        });
        return;
    }
    loadPages();
    sendPages();
    loadXYPairs();
    sendXYPairs();
    for (var i = 1; i <= activeSlots(); i++) {
        restoreSlot(i);
        refreshSlotUI(i);
    }
    setUiPage(uiPage);
}
exports.refresh = refresh;
function refreshSlotUI(slot) {
    sendNames(slot);
    sendVal(slot);
}
function sendNames(slot) {
    //log(param.name, param.deviceName, param.trackName)
    sendParamName(slot);
    sendAutomationState(slot);
    sendDeviceName(slot);
    sendTrackName(slot);
    sendColor(slot);
    sendQuant(slot);
}
function sendQuant(slot) {
    initSlotIfNecessary(slot);
    (0, utils_1.osc)(ADDR_QUANT[slot], param[slot].quant);
    // Always an array — the app decodes the payload the same way either way.
    // (The empty case used to ship the literal STRING '[]'.)
    (0, utils_1.osc)(ADDR_QUANT_ITEMS[slot], param[slot].quant > 2 ? param[slot].quantItems : []);
}
// Display strings for a slot, shared by the OSC senders and the device view.
function paramNameOf(slot) {
    return (0, utils_1.dequote)(((param[slot] && (param[slot].customName || param[slot].name)) ||
        consts_1.nullString).toString());
}
function deviceNameOf(slot) {
    return param[slot].deviceName
        ? (0, utils_1.dequote)(param[slot].deviceName.toString())
        : consts_1.nullString;
}
function trackNameOf(slot) {
    return param[slot].parentName
        ? (0, utils_1.dequote)(param[slot].parentName.toString())
        : consts_1.nullString;
}
function trackColorOf(slot) {
    return param[slot].trackColor
        ? (0, utils_1.dequote)(param[slot].trackColor.toString())
        : consts_1.DEFAULT_COLOR_FF;
}
// The view's color bar as 0–1 RGBA; an unmapped slot is black.
function colorOf(slot) {
    var c = trackColorOf(slot);
    if (c === consts_1.DEFAULT_COLOR_FF)
        c = '000000FF';
    return [0, 2, 4, 6].map(function (i) {
        return parseInt(c.substring(i, i + 2), 16) / 255.0 || 0;
    });
}
function sendParamName(slot) {
    //log(`SEND PARAM NAME ${slot}`)
    initSlotIfNecessary(slot);
    var paramName = paramNameOf(slot);
    sendMsg(slot, ['param', paramName]);
    //log('SEND PARAM NAME ' + slot + '=' + paramName)
    (0, utils_1.osc)(ADDR_PARAM[slot], paramName);
}
function sendAutomationState(slot) {
    initSlotIfNecessary(slot);
    var automationState = parseInt((paramObj && paramObj[slot] && paramObj[slot].get('automation_state')) || 0);
    //log('PAYLOAD ' + ADDR_PARAM_AUTO[slot] + ' ' + automationState)
    (0, utils_1.osc)(ADDR_PARAM_AUTO[slot], automationState);
}
function sendDeviceName(slot) {
    //log(`SEND DEVICE NAME ${slot}`)
    initSlotIfNecessary(slot);
    var deviceName = deviceNameOf(slot);
    sendMsg(slot, ['device', deviceName]);
    (0, utils_1.osc)(ADDR_DEVICE[slot], deviceName);
}
function sendTrackName(slot) {
    //log(`SEND TRACK NAME ${slot}`)
    initSlotIfNecessary(slot);
    var trackName = trackNameOf(slot);
    sendMsg(slot, ['track', trackName]);
    (0, utils_1.osc)(ADDR_TRACK[slot], trackName);
}
function sendColor(slot) {
    //log(`SEND COLOR ${slot}`)
    initSlotIfNecessary(slot);
    (0, utils_1.osc)(ADDR_VALCOLOR[slot], trackColorOf(slot));
    // for the color highlight in the Max for Live device
    sendMsg(slot, __spreadArray(['color'], colorOf(slot), true));
}
function sendVal(slot) {
    //log(`SEND VAL ${slot}`)
    if (!ADDR_VAL[slot]) {
        log('sendVal: out-of-range slot=' + slot + ' (type=' + typeof slot + ')');
        return;
    }
    initSlotIfNecessary(slot);
    if (!(0, liveApi_1.apiValid)(paramObj[slot]) ||
        param[slot].val === undefined ||
        param[slot].max === undefined ||
        param[slot].min === undefined ||
        outMax[slot] === outMin[slot]) {
        (0, utils_1.osc)(ADDR_VAL[slot], 0);
        (0, utils_1.osc)(ADDR_VALSTR[slot], consts_1.nullString);
        return;
    }
    (0, utils_1.osc)(ADDR_VAL[slot], (0, deviceParam_1.valueToProp)(param[slot].val, param[slot].min, param[slot].max, outMin[slot], outMax[slot]));
    (0, utils_1.osc)(ADDR_VALSTR[slot], paramObj[slot] ? (0, deviceParam_1.valueString)(paramObj[slot], param[slot].val) : consts_1.nullString);
}
// new value received over OSC
function val(slot, val) {
    //log(slot + ' - VAL: ' + val)
    if (paramObj[slot]) {
        if (allowUpdateFromOsc[slot]) {
            // scale the 0..1 value to the param's min/max range
            param[slot].val = (0, deviceParam_1.propToValue)(val, param[slot].min, param[slot].max, outMin[slot], outMax[slot]);
            // prevent updates from params directly being sent to OSC for 500ms
            if (param[slot].allowParamValueUpdates) {
                param[slot].allowParamValueUpdates = false;
                var allowUpdatesTask = new Task(function () {
                    param[slot].allowParamValueUpdates = true;
                });
                (0, utils_1.debouncedTask)('allowUpdates', slot, allowUpdatesTask, 500);
            }
            //log('VAL ' + paramObj[slot] + ' ' + param[slot].val)
            paramObj[slot].set('value', param[slot].val);
            // get() the value from the param instead of re-using the val we
            // calculated above because buttons and whatnot will report the wrong
            // string value due to what looks like a rounding bug inside of
            // those params (e.g. str_for_value(0.9) yields "on" even though
            // the device shows up as "off"
            (0, utils_1.osc)(ADDR_VALSTR[slot], (0, deviceParam_1.valueString)(paramObj[slot], parseFloat(paramObj[slot].get('value'))));
        }
    }
    else {
        //log('GONNA_MAP', 'ALLOWED=', allowMapping)
        // If we get a OSC value but are unassigned, trigger a mapping.
        // This removes a step from typical mapping.
        if (allowMapping[slot]) {
            // debounce mapping, since moving the CC will trigger many message
            allowMapping[slot] = false;
            var allowMappingTask = new Task(function () {
                allowMapping[slot] = true;
            });
            (0, utils_1.debouncedTask)('allowMapping', slot, allowMappingTask, 1000);
            // wait 500ms before paying attention to values again after mapping
            if (allowUpdateFromOsc[slot]) {
                allowUpdateFromOsc[slot] = false;
                var allowUpdateFromOscTask = new Task(function () {
                    allowUpdateFromOsc[slot] = true;
                });
                (0, utils_1.debouncedTask)('allowUpdateFromOsc', slot, allowUpdateFromOscTask, 500);
            }
            //log("PRE-SELOBJ\n");
            scratchApi.path = 'live_set view selected_parameter';
            if (!scratchApi.unquotedpath) {
                post('No Live param is selected.\n');
            }
            else {
                //log('SELOBJ', scratchApi.unquotedpath, 'SELOBJINFO', scratchApi.info)
                // Only map things that have a 'value' property
                if (scratchApi.info.match(/property value/)) {
                    setPath(slot, scratchApi.unquotedpath);
                }
            }
        }
    }
}
exports.val = val;
