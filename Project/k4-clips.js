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
var utils_1 = require("./utils");
var config_1 = require("./config");
var consts_1 = require("./consts");
autowatch = 1;
inlets = 1;
outlets = 1;
var log = (0, utils_1.logFactory)(config_1.default);
var NUM_TRACKS = 8;
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setoutletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
var state = {
    obsVisibleTracks: null,
    obsScenes: null,
    obsSelScene: null,
    obsSelTrack: null,
    scenes: {},
    tracks: {},
    trackSlots: [],
    visibleTrackIds: [],
    displayTrackIds: [],
    sceneIds: [],
    displaySceneIds: [],
    updateDebounce: null,
    utilObj: null,
    outputLast: {},
    groupStack: [],
};
// MESSAGE HANDLERS
function rename(slot, data) {
    var _a = JSON.parse(data), clipSlotIdx = _a[0], name = _a[1];
    log('RENAME', { slot: slot, clipSlotIdx: clipSlotIdx, name: name });
    var trackId = state.displayTrackIds[slot];
    if (!trackId) {
        log('WEIRD WE GOT A SLOT THAT HAS NO TRACK', slot);
        return;
    }
    state.utilObj.id = trackId;
    state.utilObj.goto('clip_slots ' + clipSlotIdx + ' clip');
    state.utilObj.set('name', name);
    var clipSlotIdArr = (0, utils_1.cleanArr)(state.trackSlots[slot].obsTrackClipSlots.get('clip_slots'));
    refreshClipSlotsInSlot(slot, clipSlotIdArr);
    updateDisplay();
}
function fire(slot, clipSlot) {
    //log('FIRE', slot, clipSlot)
    var trackId = state.displayTrackIds[slot];
    if (!trackId) {
        log('WEIRD WE GOT A SLOT THAT HAS NO TRACK', slot);
        return;
    }
    state.utilObj.id = trackId;
    state.utilObj.goto('clip_slots ' + clipSlot);
    state.utilObj.call('fire', null);
    var slotId = state.utilObj.id;
    state.utilObj.goto('live_set view');
    state.utilObj.set('highlighted_clip_slot', 'id ' + slotId);
}
function renameScene(sceneIdx, name) {
    var sceneId = state.sceneIds[sceneIdx];
    if (!sceneId) {
        log('INVALUD SCENE ID');
        return;
    }
    state.utilObj.id = sceneId;
    state.utilObj.set('name', name);
    fillSceneMetadata(sceneId);
    updateDisplay();
}
function fireScene(sceneIdx) {
    var sceneId = state.sceneIds[sceneIdx];
    if (!sceneId) {
        log('INVALUD SCENE ID');
        return;
    }
    state.utilObj.id = sceneId;
    state.utilObj.call('fire', null);
}
function captureInsert() {
    //log('CAPTURE INSERT')
    state.utilObj.goto('live_set');
    state.utilObj.call('capture_and_insert_scene', null);
}
function stopAll() {
    state.utilObj.goto('live_set');
    state.utilObj.call('stop_all_clips', null);
}
function stop(slot) {
    //log('STOP', slot)
    var trackId = state.displayTrackIds[slot];
    if (!trackId) {
        log('WEIRD WE GOT A SLOT THAT HAS NO TRACK', slot);
        return;
    }
    state.utilObj.id = trackId;
    state.utilObj.call('stop_all_clips', null);
}
function groupFold(slot) {
    //log('FOLD', slot)
    foldInternal(slot, 1);
}
function groupUnfold(slot) {
    //log('UNFOLD', slot)
    foldInternal(slot, 0);
}
function foldInternal(slot, foldState) {
    var trackId = state.displayTrackIds[slot];
    if (!trackId) {
        log('WEIRD WE GOT A SLOT THAT HAS NO TRACK', slot);
        return;
    }
    state.utilObj.id = trackId;
    if (!+state.utilObj.get('is_foldable')) {
        log('WEIRD WE GOT AN FOLD COMMAND ON A NON-GROUP TRACK', slot, foldState);
        return;
    }
    state.utilObj.set('fold_state', foldState);
}
// LISTENERS / DATA PROVIDERS BELOW
function dedupOscOutput(key, val) {
    if (state.outputLast[key] === val) {
        return;
    }
    state.outputLast[key] = val;
    outlet(consts_1.OUTLET_OSC, [key, val]);
    //log('OSC OUTPUT', key, val)
}
function formatScenes() {
    var sceneRet = state.sceneIds.map(function (sceneId) {
        return [state.scenes[sceneId].name, state.scenes[sceneId].color];
    });
    state.utilObj.path = 'live_set master_track';
    var mainColor = (0, utils_1.colorToString)(state.utilObj.get('color'));
    sceneRet.unshift(['Main', mainColor]);
    return sceneRet;
}
function updateDisplay() {
    if (!state.updateDebounce) {
        state.updateDebounce = new Task(function () {
            var numTrackSlotsKey = '/clips/numTrackSlots';
            dedupOscOutput(numTrackSlotsKey, state.trackSlots.length);
            dedupOscOutput('/clips/scenes', JSON.stringify(formatScenes()));
            state.trackSlots.forEach(function (_, idx) {
                var outputKey = '/clips/trackSlot' + idx;
                var outputString = JSON.stringify(formatTrackSlot(idx));
                dedupOscOutput(outputKey, outputString);
            });
        });
    }
    state.updateDebounce.cancel();
    state.updateDebounce.schedule(10);
}
function fillTrackMetadata(trackId) {
    //log('GET METADATA', trackId)
    state.utilObj.id = trackId;
    if (state.utilObj.id === 0) {
        return;
    }
    var groupState = +state.utilObj.get('is_foldable')
        ? +state.utilObj.get('fold_state')
        : -1;
    state.tracks[trackId.toString()] = {
        groupState: groupState,
        name: state.utilObj.get('name').toString(),
        color: (0, utils_1.colorToString)(state.utilObj.get('color')),
    };
}
function refreshClipSlotsInSlot(slot, clipSlotIdArr) {
    var trackId = state.trackSlots[slot].obsTrackClipSlots.id;
    var isGroup = state.tracks[trackId].groupState >= 0;
    state.trackSlots[slot].clipSlots = [];
    for (var _i = 0, clipSlotIdArr_1 = clipSlotIdArr; _i < clipSlotIdArr_1.length; _i++) {
        var clipSlotId = clipSlotIdArr_1[_i];
        state.utilObj.id = clipSlotId;
        var hasStopButton = !!+state.utilObj.get('has_stop_button');
        var hasClip = false;
        var name = '';
        var color = '';
        var isRecording = false;
        if (isGroup) {
            hasClip = !!+state.utilObj.get('controls_other_clips');
        }
        else {
            hasClip = !!+state.utilObj.get('has_clip');
            if (hasClip) {
                var clipId = (0, utils_1.cleanArr)(state.utilObj.get('clip'))[0];
                if (clipId) {
                    //log('ID', state.utilObj.id, clipId)
                    state.utilObj.id = clipId;
                    name = state.utilObj.get('name').toString();
                    color = (0, utils_1.colorToString)(state.utilObj.get('color'));
                    isRecording = !!+state.utilObj.get('is_recording');
                }
            }
        }
        state.trackSlots[slot].clipSlots.push({
            hasClip: hasClip,
            hasStopButton: hasStopButton,
            isRecording: isRecording,
            name: name,
            color: color,
        });
    }
}
function handlePlayingSlotIndex(slot, args) {
    var argsArr = arrayfromargs(args);
    if (argsArr.shift() !== 'playing_slot_index') {
        return;
    }
    state.trackSlots[slot].playingSlotIndex = argsArr.shift();
    if (state.trackSlots[slot].arm) {
        var clipSlotIdArr = (0, utils_1.cleanArr)(state.trackSlots[slot].obsTrackClipSlots.get('clip_slots'));
        refreshClipSlotsInSlot(slot, clipSlotIdArr);
    }
    updateDisplay();
}
function handleFiredSlotIndex(slot, args) {
    var argsArr = arrayfromargs(args);
    if (argsArr.shift() !== 'fired_slot_index') {
        return;
    }
    state.trackSlots[slot].firedSlotIndex = argsArr.shift();
    updateDisplay();
}
function handleArm(slot, args) {
    var argsArr = arrayfromargs(args);
    if (argsArr.shift() !== 'arm') {
        return;
    }
    state.trackSlots[slot].arm = argsArr.shift();
    updateDisplay();
}
function handleClipSlots(slot, args) {
    var argsArr = arrayfromargs(args);
    if (argsArr.shift() !== 'clip_slots') {
        return;
    }
    var clipSlotIdArr = (0, utils_1.cleanArr)(argsArr);
    refreshClipSlotsInSlot(slot, clipSlotIdArr);
}
function configureTrackSlot(slot, trackId) {
    //log('CONFIGURE SLOT', { slot, trackId })
    if (!state.trackSlots[slot]) {
        state.trackSlots[slot] = {
            obsTrackClipSlots: null,
            obsPlayingSlotIndex: null,
            obsFiredSlotIndex: null,
            obsArm: null,
            playingSlotIndex: -1,
            firedSlotIndex: -1,
            arm: 0,
            clipSlots: [],
            groupParents: [],
        };
    }
    if (!state.trackSlots[slot].obsTrackClipSlots) {
        state.trackSlots[slot].obsTrackClipSlots = new LiveAPI(function (args) { return handleClipSlots(slot, args); }, 'live_set');
    }
    state.trackSlots[slot].obsTrackClipSlots.id = trackId;
    state.trackSlots[slot].obsTrackClipSlots.property = 'clip_slots';
    if (!state.trackSlots[slot].obsPlayingSlotIndex) {
        state.trackSlots[slot].obsPlayingSlotIndex = new LiveAPI(function (args) { return handlePlayingSlotIndex(slot, args); }, 'live_set');
    }
    state.trackSlots[slot].obsPlayingSlotIndex.id = trackId;
    state.trackSlots[slot].obsPlayingSlotIndex.property = 'playing_slot_index';
    if (!state.trackSlots[slot].obsFiredSlotIndex) {
        state.trackSlots[slot].obsFiredSlotIndex = new LiveAPI(function (args) { return handleFiredSlotIndex(slot, args); }, 'live_set');
    }
    state.trackSlots[slot].obsFiredSlotIndex.id = trackId;
    state.trackSlots[slot].obsFiredSlotIndex.property = 'fired_slot_index';
    var groupTrackId = (0, utils_1.cleanArr)(state.trackSlots[slot].obsFiredSlotIndex.get('group_track'))[0];
    // initialize empty
    state.trackSlots[slot].groupParents = [];
    if (groupTrackId) {
        // this track is a member of a group, so find that group track in the groupStack array
        while (state.groupStack.length) {
            if (state.groupStack[state.groupStack.length - 1][0] !== groupTrackId) {
                state.groupStack.pop();
            }
            else {
                // found our group, so take everything from there and up
                state.trackSlots[slot].groupParents = __spreadArray([], state.groupStack, true);
                break;
            }
        }
    }
    // only observe arm in non-group tracks
    if (state.tracks[trackId].groupState === -1) {
        if (!state.trackSlots[slot].obsArm) {
            state.trackSlots[slot].obsArm = new LiveAPI(function (args) { return handleArm(slot, args); }, 'id ' + trackId);
        }
        //log('HERE', state.trackSlots[slot].obsArm.type)
        state.trackSlots[slot].obsArm.id = trackId;
        state.trackSlots[slot].obsArm.property = 'arm';
    }
    else {
        // this is a group, so push its id and color onto state.groupStack
        state.groupStack.push([trackId, state.tracks[trackId].color]);
    }
}
function formatTrackSlot(slot) {
    var trackSlot = state.trackSlots[slot];
    var trackId = state.displayTrackIds[slot];
    var trackMeta = state.tracks[trackId.toString()];
    return [
        trackId,
        trackMeta.name,
        trackMeta.color,
        trackMeta.groupState,
        trackSlot.playingSlotIndex,
        trackSlot.firedSlotIndex,
        trackSlot.arm,
        trackSlot.clipSlots.map(function (cs) {
            return [
                cs.hasClip ? 1 : 0,
                cs.hasStopButton ? 1 : 0,
                cs.name,
                cs.color,
                cs.isRecording ? 1 : 0,
            ];
        }),
        trackSlot.groupParents,
    ];
}
function handleVisibleTracks(args) {
    // visible tracks have changed, so look for new items in the display list
    var argsArr = arrayfromargs(args);
    if (argsArr.shift() !== 'visible_tracks') {
        return;
    }
    state.visibleTrackIds = (0, utils_1.cleanArr)(argsArr);
    state.tracks = {};
    state.trackSlots = [];
    state.groupStack = [];
    state.displayTrackIds = state.visibleTrackIds;
    //log('DISPLAY TRACK IDs', state.displayTrackIds)
    var slot = 0;
    for (var _i = 0, _a = state.displayTrackIds; _i < _a.length; _i++) {
        var trackId = _a[_i];
        if (!state.tracks[trackId.toString()]) {
            // need metadata for this track
            // populates state.tracks[trackId]
            fillTrackMetadata(trackId);
        }
        configureTrackSlot(slot, trackId);
        slot++;
    }
    updateDisplay();
}
function fillSceneMetadata(sceneId) {
    //log('GET SCENE METADATA', sceneId)
    state.utilObj.id = sceneId;
    if (state.utilObj.id === 0) {
        return;
    }
    state.scenes[sceneId.toString()] = {
        name: state.utilObj.get('name').toString(),
        color: (0, utils_1.colorToString)(state.utilObj.get('color')),
    };
}
function handleScenes(args) {
    // visible tracks have changed, so look for new items in the display list
    var argsArr = arrayfromargs(args);
    if (argsArr.shift() !== 'scenes') {
        return;
    }
    state.sceneIds = (0, utils_1.cleanArr)(argsArr);
    state.scenes = {};
    // temp do them all
    state.displaySceneIds = state.sceneIds;
    var slot = 0;
    for (var _i = 0, _a = state.displaySceneIds; _i < _a.length; _i++) {
        var sceneId = _a[_i];
        //log('STEP', { slot, trackId })
        if (!state.tracks[sceneId.toString()]) {
            // need metadata for this scene
            // populates state.scenes[sceneId]
            fillSceneMetadata(sceneId);
        }
        slot++;
    }
    updateDisplay();
}
function handleSelTrack(args) {
    // visible tracks have changed, so look for new items in the display list
    var argsArr = arrayfromargs(args);
    if (argsArr.shift() !== 'id') {
        return;
    }
    var selTrackId = +argsArr[0];
    dedupOscOutput('/clips/selectedTrack', selTrackId);
}
function handleSelScene(args) {
    // visible tracks have changed, so look for new items in the display list
    var argsArr = arrayfromargs(args);
    if (argsArr.shift() !== 'id') {
        return;
    }
    var selSceneId = +argsArr[0];
    dedupOscOutput('/clips/selectedSceneIdx', state.sceneIds.indexOf(selSceneId));
}
function init() {
    state.outputLast = {};
    state.obsVisibleTracks = null;
    state.obsScenes = null;
    if (!state.utilObj) {
        state.utilObj = new LiveAPI(consts_1.noFn, 'live_set');
    }
    if (!state.obsVisibleTracks) {
        state.obsVisibleTracks = new LiveAPI(handleVisibleTracks, 'live_set');
        state.obsVisibleTracks.property = 'visible_tracks';
    }
    if (!state.obsScenes) {
        state.obsScenes = new LiveAPI(handleScenes, 'live_set');
        state.obsScenes.property = 'scenes';
    }
    if (!state.obsSelTrack) {
        state.obsSelTrack = new LiveAPI(handleSelTrack, 'live_set view selected_track');
        state.obsSelTrack.mode = 1;
    }
    if (!state.obsSelScene) {
        state.obsSelScene = new LiveAPI(handleSelScene, 'live_set view selected_scene');
        state.obsSelScene.mode = 1;
    }
}
log('reloaded k4-clips');
// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
var module = {};
module.exports = {};
