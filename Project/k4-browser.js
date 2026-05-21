"use strict";
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 2;
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Browser navigation/load OSC messages');
setoutletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
setoutletassist(consts_1.OUTLET_MSGS, 'Messages');
// Top-level Browser categories Live exposes (Library + Places).
// Order here is the rail order presented to the tablet.
var CATEGORY_KEYS = [
    'sounds',
    'drums',
    'instruments',
    'audio_effects',
    'midi_effects',
    'max_for_live',
    'plugins',
    'clips',
    'samples',
    'packs',
    'user_library',
    'current_project',
    'user_folders',
];
var state = {
    // Walks to the requested view location. Left positioned there afterward
    // so we can read its children without losing the spot.
    walkApi: null,
    // Reads child / breadcrumb props without disturbing walkApi.
    scratchApi: null,
    // Pinned at the root browser for load_item calls.
    browserApi: null,
    categories: [],
    currentToken: '',
};
function ensureInit() {
    if (!state.walkApi)
        state.walkApi = new LiveAPI(consts_1.noFn, 'live_app browser');
    if (!state.scratchApi)
        state.scratchApi = new LiveAPI(consts_1.noFn, 'live_app browser');
    if (!state.browserApi)
        state.browserApi = new LiveAPI(consts_1.noFn, 'live_app browser');
    if (state.categories.length === 0) {
        for (var i = 0; i < CATEGORY_KEYS.length; i++) {
            var key = CATEGORY_KEYS[i];
            state.scratchApi.path = 'live_app browser ' + key;
            if (+state.scratchApi.id === 0)
                continue; // not present in this Live version
            state.categories.push({
                name: state.scratchApi.get('name').toString(),
                token: key,
            });
        }
    }
}
// Position walkApi at the BrowserItem identified by token.
// Empty token = root browser. Returns false if any segment is invalid.
function walkToToken(token) {
    if (!token) {
        state.walkApi.path = 'live_app browser';
        return true;
    }
    var parts = token.split('/');
    state.walkApi.path = 'live_app browser ' + parts[0];
    if (+state.walkApi.id === 0)
        return false;
    for (var i = 1; i < parts.length; i++) {
        var childIdx = parseInt(parts[i]);
        var children = (0, utils_1.cleanArr)(state.walkApi.get('children'));
        if (isNaN(childIdx) || childIdx < 0 || childIdx >= children.length) {
            return false;
        }
        state.walkApi.id = parseInt(children[childIdx].toString());
    }
    return true;
}
function buildBreadcrumb(token) {
    if (!token)
        return [];
    var crumbs = [];
    var parts = token.split('/');
    state.scratchApi.path = 'live_app browser ' + parts[0];
    if (+state.scratchApi.id === 0)
        return crumbs;
    crumbs.push({
        name: state.scratchApi.get('name').toString(),
        token: parts[0],
    });
    for (var i = 1; i < parts.length; i++) {
        var childIdx = parseInt(parts[i]);
        var children = (0, utils_1.cleanArr)(state.scratchApi.get('children'));
        if (isNaN(childIdx) || childIdx < 0 || childIdx >= children.length)
            break;
        state.scratchApi.id = parseInt(children[childIdx].toString());
        crumbs.push({
            name: state.scratchApi.get('name').toString(),
            token: parts.slice(0, i + 1).join('/'),
        });
    }
    return crumbs;
}
// walkApi must already be positioned at the parent.
function readChildrenAt(token) {
    var childIds = (0, utils_1.cleanArr)(state.walkApi.get('children'));
    var items = [];
    var basePath = token ? token + '/' : '';
    for (var i = 0; i < childIds.length; i++) {
        state.scratchApi.id = parseInt(childIds[i].toString());
        items.push({
            name: state.scratchApi.get('name').toString(),
            token: basePath + i,
            isFolder: !!parseInt(state.scratchApi.get('is_folder').toString()),
            isLoadable: !!parseInt(state.scratchApi.get('is_loadable').toString()),
            isDevice: !!parseInt(state.scratchApi.get('is_device').toString()),
        });
    }
    return items;
}
function emitView(token) {
    ensureInit();
    if (!walkToToken(token)) {
        (0, utils_1.osc)('/browser/error', 'Invalid token: ' + token);
        return;
    }
    state.currentToken = token;
    // At root the body is the categories themselves; deeper, it's child items.
    var items = token
        ? readChildrenAt(token)
        : state.categories.map(function (c) {
            return {
                name: c.name,
                token: c.token,
                isFolder: true,
                isLoadable: false,
                isDevice: false,
            };
        });
    var header = {
        path: token,
        breadcrumb: buildBreadcrumb(token),
        categories: state.categories,
        itemCount: items.length,
    };
    (0, utils_1.osc)('/browser/view', JSON.stringify(header));
    (0, utils_1.sendChunkedData)('/browser/items', items);
}
// /browser/navigate <token> — request a new view
function navigate(token) {
    emitView(token == null ? '' : token.toString());
}
// /browser/refresh — re-emit current view
function refresh() {
    emitView(state.currentToken);
}
// /browser/load <token> — load item to current Live selection.
// Live's Browser.load_item already honors Track.view.device_insert_mode and
// the selected_device, so insertion position follows the user's current
// state in Live without extra work here.
function load(token) {
    ensureInit();
    var tok = token == null ? '' : token.toString();
    if (!walkToToken(tok)) {
        (0, utils_1.osc)('/browser/error', 'Item not found: ' + tok);
        return;
    }
    if (!parseInt(state.walkApi.get('is_loadable').toString())) {
        (0, utils_1.osc)('/browser/error', 'Item not loadable: ' + tok);
        return;
    }
    var itemId = state.walkApi.id;
    state.browserApi.path = 'live_app browser';
    state.browserApi.call('load_item', 'id ' + itemId);
}
log('reloaded k4-browser');
// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
