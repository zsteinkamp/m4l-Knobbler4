"use strict";
autowatch = 1;
inlets = 1;
outlets = 1;
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
var log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setinletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
var state = {
    api: null,
    track: {
        watch: null,
        last: null,
        tree: {},
    },
    return: {
        watch: null,
        last: null,
        tree: {},
    },
    main: {
        watch: null,
        last: null,
        tree: {},
    },
    device: {
        watch: null,
        last: null,
    },
    currDeviceId: null,
    currDeviceWatcher: null,
    currTrackId: null,
    currTrackWatcher: null,
};
// make a tree so we can get depth
var getEmptyTreeNode = function () {
    return {
        children: [],
        obj: null,
        parent: null,
    };
};
var makeTrackTree = function (type, typeNum, trackIds) {
    // bootstrap tretrae
    var tree = {};
    tree['0'] = getEmptyTreeNode();
    // iterate over given IDs, already sorted in the right order
    for (var _i = 0, trackIds_1 = trackIds; _i < trackIds_1.length; _i++) {
        var trackId = trackIds_1[_i];
        if (!trackId) {
            continue;
        }
        var trackIdStr = trackId.toString();
        state.api.id = trackId;
        //log('TRACK ID ' + trackId)
        if (!tree[trackIdStr]) {
            tree[trackIdStr] = getEmptyTreeNode();
        }
        var trackInfo = state.api.info.toString();
        var isTrack = trackInfo.indexOf('type Track') > -1;
        var isFoldable = isTrack && parseInt(state.api.get('is_foldable'));
        tree[trackIdStr].obj = [
            /* TYPE   */ isFoldable ? consts_1.TYPE_GROUP : typeNum,
            /* ID     */ trackId,
            /* NAME   */ (0, utils_1.truncate)(state.api.get('name').toString(), consts_1.MAX_NAME_LEN),
            /* COLOR  */ (0, utils_1.colorToString)(state.api.get('color').toString()),
            /* INDENT */ 0, // temporary indent
        ];
        var parentId = (0, utils_1.cleanArr)(state.api.get('group_track'))[0];
        var parentIdStr = parentId.toString();
        //log('PARENT ID ' + parentId)
        tree[trackIdStr].parent = parentId;
        //log('THREE ' + trackId + ' ' + JSON.stringify(tree[trackIdStr]))
        if (!tree[parentIdStr]) {
            tree[parentIdStr] = getEmptyTreeNode();
        }
        tree[parentIdStr].children.push(trackId);
    }
    // now fixup indents
    var fixupIndent = function (currId, indent) {
        var currIdStr = currId.toString();
        var treeNode = tree[currIdStr];
        //log('fixupIndent TREENODE ' + currIdStr + ' ' + JSON.stringify(treeNode))
        treeNode.obj && (treeNode.obj[consts_1.FIELD_INDENT] = indent);
        //log('fixupIndent after ' + currIdStr + ' ' + JSON.stringify(treeNode))
        for (var _i = 0, _a = treeNode.children; _i < _a.length; _i++) {
            var childId = _a[_i];
            fixupIndent(childId, indent + 1);
        }
    };
    // start with indent==-1 so that the actual output starts at zero (root node
    // is not included in output)
    fixupIndent(0, -1);
    //log('TREE ' + JSON.stringify(tree))
    return tree;
};
function updateGenericTrack(type, val) {
    var stateObj = state[type];
    if (!stateObj) {
        return;
    }
    var idArr = (0, utils_1.cleanArr)(val);
    var typeNum = consts_1.TYPE_TRACK;
    if (type === 'return') {
        typeNum = consts_1.TYPE_RETURN;
    }
    else if (type === 'main') {
        typeNum = consts_1.TYPE_MAIN;
    }
    stateObj.tree = makeTrackTree(type, typeNum, idArr);
}
function updateTracks(val) {
    if (val[0] !== 'tracks') {
        //log('TRACKS EARLY')
        return;
    }
    //log('HERE TRACKSz ' + JSON.stringify(val))
    updateGenericTrack('track', val);
}
function updateReturns(val) {
    //log('HERE RETURNS')
    if (val[0] !== 'return_tracks') {
        //log('RETURNS EARLY')
        return;
    }
    updateGenericTrack('return', val);
}
function updateMain(val) {
    //log('HERE MAIN ' + val.toString())
    if (val[0] !== 'id') {
        //log('MAIN EARLY')
        return;
    }
    updateGenericTrack('main', val);
}
//function updateDevices(val: IdObserverArg) {
//  if (val[0] !== 'devices') {
//    //log('DEVICES EARLY')
//    return
//  }
//  //log('HERE DEVICES ' + JSON.stringify(val))
//  updateGeneric('device', val)
//}
function onCurrDeviceChange(val) {
    if (val[0] !== 'id') {
        //log('DEVICE_ID EARLY')
        return;
    }
    var newId = (0, utils_1.cleanArr)(val)[0];
    if (state.currDeviceId === newId) {
        return;
    }
    if (newId === 0) {
        // if no device is selected, null out the devices list
        outlet(consts_1.OUTLET_OSC, ['/nav/devices', JSON.stringify([])]);
        return;
    }
    state.currDeviceId = newId;
    //log('NEW CURR DEVICE ID=' + state.currDeviceId)
    outlet(consts_1.OUTLET_OSC, ['/nav/currDeviceId', state.currDeviceId]);
    var ret = [];
    var utilObj = new LiveAPI(consts_1.noFn, 'live_set');
    var currDeviceObj = new LiveAPI(consts_1.noFn, 'id ' + state.currDeviceId);
    var parentObj = new LiveAPI(consts_1.noFn, currDeviceObj.get('canonical_parent'));
    var parentChildIds = (0, utils_1.cleanArr)(parentObj.get('devices'));
    // first, self and siblings (with chain children under self)
    for (var _i = 0, parentChildIds_1 = parentChildIds; _i < parentChildIds_1.length; _i++) {
        var childDeviceId = parentChildIds_1[_i];
        utilObj.id = childDeviceId;
        ret.push([
            /* TYPE   */ parseInt(utilObj.get('can_have_chains'))
                ? consts_1.TYPE_RACK
                : consts_1.TYPE_DEVICE,
            /* ID     */ childDeviceId,
            /* NAME   */ (0, utils_1.truncate)(utilObj.get('name').toString(), consts_1.MAX_NAME_LEN),
            /* COLOR  */ (0, utils_1.colorToString)(parentObj.get('color').toString()),
            /* INDENT */ 0, // temporary indent
        ]);
        if (childDeviceId === state.currDeviceId) {
            // add child chains below the current item
            if (parseInt(currDeviceObj.get('can_have_chains'))) {
                var chainIds = (0, utils_1.cleanArr)(utilObj.get('chains'));
                for (var _a = 0, chainIds_1 = chainIds; _a < chainIds_1.length; _a++) {
                    var chainId = chainIds_1[_a];
                    utilObj.id = chainId;
                    ret.push([
                        /* TYPE   */ consts_1.TYPE_CHILD_CHAIN,
                        /* ID     */ chainId,
                        /* NAME   */ (0, utils_1.truncate)(utilObj.get('name').toString(), consts_1.MAX_NAME_LEN),
                        /* COLOR  */ (0, utils_1.colorToString)(utilObj.get('color').toString()),
                        /* INDENT */ 1, // temporary indent
                    ]);
                }
                if (currDeviceObj.info.toString().match('return_chains')) {
                    // drum racks have return chains
                    var returnChainIds = (0, utils_1.cleanArr)(currDeviceObj.get('return_chains'));
                    for (var _b = 0, returnChainIds_1 = returnChainIds; _b < returnChainIds_1.length; _b++) {
                        var chainId = returnChainIds_1[_b];
                        utilObj.id = chainId;
                        ret.push([
                            /* TYPE   */ consts_1.TYPE_CHILD_CHAIN,
                            /* ID     */ chainId,
                            /* NAME   */ (0, utils_1.truncate)(utilObj.get('name').toString(), consts_1.MAX_NAME_LEN),
                            /* COLOR  */ (0, utils_1.colorToString)(utilObj.get('color').toString()),
                            /* INDENT */ 1, // temporary indent
                        ]);
                    }
                }
            }
        }
    }
    // now add hierarchy, up to when the parent is a track
    var indent = 0;
    var watchdog = 0;
    var grandparentObj = new LiveAPI(consts_1.noFn, 'live_set');
    while (parentObj.type !== 'Track' && watchdog < 20) {
        var isChain = parentObj.type === 'Chain' || parentObj.type === 'DrumChain';
        var color = null;
        if (isChain) {
            color = (0, utils_1.colorToString)(parentObj.get('color').toString());
        }
        else {
            var grandparentId = (0, utils_1.cleanArr)(parentObj.get('canonical_parent'))[0];
            grandparentObj.id = grandparentId;
            color = (0, utils_1.colorToString)(grandparentObj.get('color').toString());
        }
        ret.unshift([
            /* TYPE   */ isChain ? consts_1.TYPE_CHAIN : consts_1.TYPE_RACK,
            /* ID     */ parentObj.id,
            /* NAME   */ (0, utils_1.truncate)(parentObj.get('name').toString(), consts_1.MAX_NAME_LEN),
            /* COLOR  */ color,
            /* INDENT */ --indent, // temporary indent
        ]);
        var parentObjParentId = (0, utils_1.cleanArr)(parentObj.get('canonical_parent'))[0];
        //log('CP=' + parentObjParentId)
        parentObj.id = parentObjParentId;
        //log('NEWTYPE=' + parentObj.type)
        watchdog++;
    }
    // now normalize device indentation ... the first item in the ret[] list needs
    // to become zero, but may be negative
    if (ret.length > 0) {
        var baseIndent = ret[0][consts_1.FIELD_INDENT];
        for (var _c = 0, ret_1 = ret; _c < ret_1.length; _c++) {
            var maxObj = ret_1[_c];
            maxObj[consts_1.FIELD_INDENT] -= baseIndent;
        }
    }
    //log('/nav/devices=' + JSON.stringify(ret))
    outlet(consts_1.OUTLET_OSC, ['/nav/devices', JSON.stringify(ret)]);
}
function onCurrTrackChange(val) {
    //log('TRACK CHANGE ' + val)
    if (val[0] !== 'id') {
        //log('Track change EARLY')
        return;
    }
    var newId = (0, utils_1.cleanArr)(val)[0];
    if (state.currTrackId === newId) {
        //log('Track change SAME')
        return;
    }
    if (newId === 0) {
        //log('Track change ZERO')
        return;
    }
    state.currTrackId = newId;
    var currTrackIdStr = state.currTrackId.toString();
    //log('NEW CURR TRACK ID =' + state.currTrackId)
    outlet(consts_1.OUTLET_OSC, ['/nav/currTrackId', state.currTrackId]);
    var trackTree = state.track.tree;
    var returnTree = state.return.tree;
    var mainTree = state.main.tree;
    var ret = [];
    // is the given currTrackId a (return|main) or track?
    if (returnTree[currTrackIdStr] || mainTree[currTrackIdStr]) {
        // return or main
        for (var _i = 0, _a = trackTree['0'].children; _i < _a.length; _i++) {
            var topLevelTrackId = _a[_i];
            // top-level tracks
            ret.push(trackTree[topLevelTrackId.toString()].obj);
        }
    }
    else if (trackTree[state.currTrackId.toString()]) {
        // currTrackId is a track
        //log('IS TRACK ' + state.currTrackId)
        // child tracks
        for (var _b = 0, _c = trackTree[state.currTrackId.toString()]
            .children; _b < _c.length; _b++) {
            var childTrackId = _c[_b];
            //log(' >>> PUSH CHILD ' + childTrackId)
            ret.push(trackTree[childTrackId.toString()].obj);
        }
        // self and siblings
        var parentId = trackTree[state.currTrackId.toString()].parent;
        var foundSelf = false;
        var unshiftCount = 0;
        for (var _d = 0, _e = trackTree[parentId.toString()]
            .children; _d < _e.length; _d++) {
            var selfOrSiblingTrackId = _e[_d];
            var selfOrSiblingObj = trackTree[selfOrSiblingTrackId.toString()].obj;
            //log(' >>> SIB OBJ ' + JSON.stringify(selfOrSiblingObj))
            if (foundSelf) {
                ret.push(selfOrSiblingObj);
            }
            else {
                ret.splice(unshiftCount, 0, selfOrSiblingObj);
                unshiftCount++;
            }
            if (selfOrSiblingTrackId === state.currTrackId) {
                foundSelf = true;
            }
        }
        // walk up hierarchy to root
        var lastTrackAncestorId = null;
        var currentTrackParentId = parentId;
        while (parentId) {
            var parentNode = trackTree[parentId.toString()];
            if (parentNode.parent === 0) {
                // got to the top level -- we will add all top-level tracks below
                break;
            }
            var parentObj = parentNode.obj;
            ret.unshift(parentObj);
            if (parentObj) {
                //log(' >>> PARENT OBJ ' + JSON.stringify(parentObj))
                lastTrackAncestorId = parentId;
                parentId = trackTree[parentId.toString()].parent;
            }
        }
        // now get top-level tracks
        if (currentTrackParentId) {
            var foundAncestor = false;
            unshiftCount = 0;
            for (var _f = 0, _g = trackTree['0'].children; _f < _g.length; _f++) {
                var topLevelTrackId = _g[_f];
                var topLevelObj = trackTree[topLevelTrackId.toString()].obj;
                if (foundAncestor) {
                    ret.push(topLevelObj);
                }
                else {
                    ret.splice(unshiftCount, 0, topLevelObj);
                    unshiftCount++;
                }
                if (lastTrackAncestorId === topLevelTrackId) {
                    foundAncestor = true;
                }
            }
        }
    }
    else {
        log('DERP');
        return;
    }
    // returns
    for (var _h = 0, _j = returnTree[0].children; _h < _j.length; _h++) {
        var returnTrackId = _j[_h];
        ret.push(returnTree[returnTrackId.toString()].obj);
    }
    // main
    var mainId = mainTree['0'].children[0];
    ret.push(mainTree[mainId.toString()].obj);
    //log('/nav/tracks=' + JSON.stringify(ret))
    outlet(consts_1.OUTLET_OSC, ['/nav/tracks', JSON.stringify(ret)]);
}
function init() {
    //log('TRACKS DEVICES INIT')
    state.track = { watch: null, tree: {}, last: null };
    state.return = { watch: null, tree: {}, last: null };
    state.main = { watch: null, tree: {}, last: null };
    //state.device = { watch: null, last: null }
    state.api = null;
    state.currDeviceId = null;
    state.currDeviceWatcher = null;
    state.currTrackId = null;
    state.currTrackWatcher = null;
    // general purpose API obj to do lookups, etc
    state.api = new LiveAPI(consts_1.noFn, 'live_set');
    // set up watchers for each type, calls function to assemble and send OSC
    // messages with the type lists when changes
    state.track.watch = new LiveAPI(updateTracks, 'live_set');
    state.track.watch.property = 'tracks';
    state.return.watch = new LiveAPI(updateReturns, 'live_set');
    state.return.watch.property = 'return_tracks';
    state.main.watch = new LiveAPI(updateMain, 'live_set master_track');
    state.main.watch.property = 'id';
    //state.device.watch = new LiveAPI(
    //  updateDevices,
    //  'live_set view selected_track'
    //)
    //state.device.watch.mode = 1 // follow path, not object
    //state.device.watch.property = 'devices'
    state.currTrackWatcher = new LiveAPI(onCurrTrackChange, 'live_set view selected_track');
    state.currTrackWatcher.mode = 1;
    state.currTrackWatcher.property = 'id';
    state.currDeviceWatcher = new LiveAPI(onCurrDeviceChange, 'live_set appointed_device');
    state.currDeviceWatcher.mode = 1;
    state.currDeviceWatcher.property = 'id';
}
log('reloaded k4-tracksDevices');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
