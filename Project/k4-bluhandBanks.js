"use strict";
// [v8] entry points need `module` defined before any require() calls
var module = { exports: {} };
const utils_1 = require("./utils");
const config_1 = require("./config");
const consts_1 = require("./consts");
const k4_deviceParamMaps_1 = require("./k4-deviceParamMaps");
const deprecatedMethods_1 = require("./deprecatedMethods");
const deviceParams_1 = require("./deviceParams");
autowatch = 1;
inlets = 1;
outlets = 2;
const log = (0, utils_1.logFactory)(config_1.default);
setinletassist(consts_1.INLET_MSGS, 'Receives messages and args to call JS functions');
setinletassist(consts_1.OUTLET_OSC, 'Output OSC messages to [udpsend]');
setinletassist(consts_1.OUTLET_MSGS, 'Output messages to the [poly finger] instances to set their parameter index');
let paramNameToIdx = null;
const state = {
    devicePath: null,
    onOffWatcher: null,
    paramsWatcher: null,
    variationsWatcher: null,
    currDeviceId: 0,
    currBank: 1,
    numBanks: 1,
    bankParamArr: [],
    nameLookupCache: {},
    cuePointsWatcher: null,
    cuePointNames: [],
    cuePointTimes: [],
};
function getMaxBanksParamArr(bankCount, deviceObj) {
    const rawBanks = [];
    //log('BANK_COUNT ' + bankCount)
    for (let i = 0; i < bankCount; i++) {
        const bankName = deviceObj.call('get_bank_name', i);
        const bankParams = deviceObj.call('get_bank_parameters', i);
        //log(
        //  ' BANK ROW ' + JSON.stringify({ name: bankName, paramIdxArr: bankParams })
        //)
        rawBanks.push({ name: bankName, paramIdxArr: bankParams });
    }
    const ret = [];
    for (let i = 0; rawBanks[i]; i++) {
        const oddBank = rawBanks[i];
        const evenBank = rawBanks[++i];
        if (oddBank && evenBank) {
            ret.push({
                name: oddBank.name + ' / ' + evenBank.name,
                paramIdxArr: [...oddBank.paramIdxArr, ...evenBank.paramIdxArr],
            });
        }
        else {
            ret.push(oddBank);
        }
    }
    return ret;
}
function getBasicParamArr(paramIds) {
    //log('GET BASIC ' + paramIds.join(','))
    const ret = [];
    let currBank = 0;
    const blankRow = () => {
        return {
            name: 'Page ' + ++currBank,
            paramIdxArr: [],
        };
    };
    let currRow = null;
    let idx = 0;
    paramIds.forEach((paramId) => {
        // set up a new row for the first one
        if (idx % 16 === 0) {
            if (currRow) {
                ret.push(currRow);
            }
            currRow = blankRow();
        }
        if (paramId === 0) {
            // special case filler
            currRow.paramIdxArr.push(-1);
        }
        else {
            currRow.paramIdxArr.push(idx + 1);
            idx++; // only increment here
        }
    });
    if (currRow) {
        ret.push(currRow);
    }
    else {
        ret.push(blankRow());
    }
    //log('RET ' + JSON.stringify(ret))
    return ret;
}
function getBankParamArr(paramIds, deviceType, deviceObj) {
    if (deviceParams_1.MAX_DEVICES.indexOf(deviceType) > -1) {
        // Max device, look for live.banks
        const bankCount = deviceObj.call('get_bank_count') || 0;
        if (bankCount > 0) {
            return getMaxBanksParamArr(bankCount, deviceObj);
        }
    }
    // deviceParamMap is custom or crafted parameter organization
    //log('BBANKS ' + deviceType)
    //log('BBANKS INFO ' + deviceObj.info.toString())
    const deviceParamMap = (0, k4_deviceParamMaps_1.deviceParamMapFor)(deviceType);
    if (!deviceParamMap) {
        const paramArr = getBasicParamArr(paramIds);
        // nothing to customize, return the basic array
        //log('BASIC RETURN ' + JSON.stringify(paramArr))
        return paramArr;
    }
    //log('OUT HERE')
    const ret = [];
    // cache id to name mapping because it is super slow with giant devices like
    // Operator and honestly it should just be a compile-time step of the data
    // files that need this information. frankly this is stupid and should be
    // burned.
    const lookupCacheKey = deviceObj.id;
    paramNameToIdx = state.nameLookupCache[lookupCacheKey];
    if (!paramNameToIdx) {
        //log('CACHE MISS ' + lookupCacheKey)
        paramNameToIdx = {};
        // more "bespoke" setups get this
        const param = getUtilApi();
        paramIds.forEach((paramId, idx) => {
            if (paramId <= 0) {
                return;
            }
            param.id = paramId;
            paramNameToIdx[param.get('name').toString()] = idx;
            //log(`NAME TO IDX [${param.get('name')}]=${idx}`)
        });
        state.nameLookupCache[lookupCacheKey] = paramNameToIdx;
    }
    deviceParamMap.forEach((nameBank, idx) => {
        const row = {
            name: nameBank.name,
            paramIdxArr: [],
        };
        nameBank.paramNames.forEach((paramName) => {
            let found = false;
            let pIdx = null;
            if (typeof paramName === 'number') {
                // can specify a param index instead of a name in the data structure
                row.paramIdxArr.push(paramName);
                return;
            }
            for (const singleName of paramName.toString().split('|')) {
                // can have multiple options pipe-separated (e.g. for meld)
                pIdx = paramNameToIdx[singleName];
                //log('IS IT ' + pIdx)
                if (pIdx !== undefined) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                // the world of parameters is a complicated one
                //log(
                //  'ERROR (' +
                //    deviceType +
                //    ') NO pIDX FOR NAME ' +
                //    paramName +
                //    ' ' +
                //    JSON.stringify(Object.keys(paramNameToIdx))
                //)
                return;
            }
            row.paramIdxArr.push(pIdx + 1);
        });
        //log('ROW ' + JSON.stringify(row))
        ret.push(row);
    });
    //log('PARAMARRFINAL ' + JSON.stringify(ret))
    return ret;
}
function sendBankNames() {
    const currBankIdx = state.currBank - 1;
    const banks = state.bankParamArr.map((bank, idx) => {
        return { name: bank.name, sel: idx === currBankIdx };
    });
    //log('BANKS: ' + JSON.stringify(banks))
    outlet(consts_1.OUTLET_OSC, ['/bBanks', JSON.stringify(banks)]);
}
let sendCurrBankTask = null;
function debounceSendCurrBank() {
    if (sendCurrBankTask) {
        sendCurrBankTask.cancel();
    }
    sendCurrBankTask = new Task(sendCurrBank);
    sendCurrBankTask.schedule(20);
}
function sendCurrBank() {
    //log('SEND CURR BANK ' + JSON.stringify(state))
    const currBankIdx = Math.max(0, state.currBank - 1);
    if (!state.bankParamArr || !state.bankParamArr[currBankIdx]) {
        //log('EARLY ' + JSON.stringify(state.bankParamArr) + ' ' + currBankIdx)
        sendBankNames();
        return;
    }
    const bluBank = state.bankParamArr[currBankIdx];
    outlet(consts_1.OUTLET_OSC, ['/bTxtCurrBank', bluBank.name]);
    while (bluBank.paramIdxArr.length < 16) {
        bluBank.paramIdxArr.push(-1);
    }
    //log('MADE IT ' + JSON.stringify(bluBank))
    bluBank.paramIdxArr.forEach((paramIdx, idx) => {
        outlet(consts_1.OUTLET_MSGS, ['target', idx + 1]);
        outlet(consts_1.OUTLET_MSGS, ['paramIdx', paramIdx]);
        //log(JSON.stringify({ str: 'MSG', target: idx + 1, paramIdx }))
    });
    sendBankNames();
}
function unfoldParentTracks(objId) {
    const util = getUtilApi();
    util.id = objId;
    //log('GOTO TRACK ' + trackId + ' ' + util.id)
    if (+util.id === 0) {
        // invalid objId (e.g. deleted object)
        return;
    }
    // first we need to surf up the hierarchy to make sure we are not in a
    // collapsed group
    let counter = 0;
    while (counter < 20) {
        const isFoldable = util.type === 'Track' && parseInt(util.get('is_foldable'));
        //log(util.id + ' isFoldable=' + util.get('is_foldable'))
        if (isFoldable) {
            const foldState = parseInt(util.get('fold_state'));
            if (foldState === 1) {
                // need to unfold
                util.set('fold_state', 0);
            }
        }
        util.id = util.get('canonical_parent')[1];
        //log('TYPE=' + util.type)
        if (util.type === 'Song') {
            break;
        }
        counter++;
    }
}
function getParentTrackForDevice(deviceId) {
    const util = new LiveAPI(consts_1.noFn, 'id ' + deviceId);
    if ((0, utils_1.isDeviceSupported)(util)) {
        let counter = 0;
        while (counter < 20) {
            util.id = util.get('canonical_parent')[1];
            if (util.type === 'Track') {
                return +util.id;
            }
            counter++;
        }
    }
    return 0;
}
function gotoDevice(deviceIdStr) {
    const deviceId = parseInt(deviceIdStr);
    if (deviceId === 0) {
        return;
    }
    const api = getLiveSetViewApi();
    // make sure the track is selected
    const trackId = getParentTrackForDevice(deviceId);
    if (trackId === 0) {
        log('no track for device ' + deviceId);
    }
    else {
        gotoTrack(trackId.toString());
    }
    api.call('select_device', ['id', deviceId]);
}
function hideChains(deviceId) {
    //log('HIDE CHAINS ' + JSON.stringify(deviceId))
    const obj = new LiveAPI(consts_1.noFn, 'id ' + deviceId);
    if (+obj.id === 0) {
        return;
    }
    if ((0, utils_1.isDeviceSupported)(obj) && +obj.get('can_have_chains')) {
        // have to go to the 'view' child of the object to set chain device visibility
        obj.goto('view');
        obj.set('is_showing_chain_devices', 0);
    }
}
function gotoChain(chainIdStr) {
    const chainId = parseInt(chainIdStr);
    //log('GOTO CHAIN ' + chainId + ' ' + typeof chainId)
    unfoldParentTracks(chainId);
    const viewApi = getLiveSetViewApi();
    const api = getUtilApi();
    api.id = chainId;
    const devices = (0, utils_1.cleanArr)(api.get('devices'));
    if (devices && devices[0]) {
        viewApi.call('select_device', ['id', devices[0]]);
        return;
    }
}
// Toggle Group Fold State
// Long press on group item in nav calls this.
function toggleGroup(groupId) {
    const util = getUtilApi();
    util.id = groupId;
    if (+util.id === 0) {
        log('ERROR: Invalid id ' + groupId);
        return;
    }
    const isFoldable = util.type === 'Track' && parseInt(util.get('is_foldable'));
    if (!isFoldable) {
        log('ERROR: Not foldable ' + groupId);
    }
    const foldState = parseInt(util.get('fold_state'));
    util.set('fold_state', foldState ? 0 : 1);
}
function gotoTrack(trackIdStr) {
    const trackId = parseInt(trackIdStr);
    // Walk up group_track chain to unfold any collapsed parent groups
    const util = getUtilApi();
    util.id = trackId;
    if (+util.id !== 0) {
        let counter = 0;
        while (counter < 20) {
            const groupIds = (0, utils_1.cleanArr)(util.get('group_track'));
            if (!groupIds.length)
                break;
            util.id = groupIds[0];
            if (+util.id === 0)
                break;
            const foldState = parseInt(util.get('fold_state').toString());
            if (foldState === 1) {
                util.set('fold_state', 0);
            }
            counter++;
        }
    }
    const api = getLiveSetViewApi();
    api.set('selected_track', ['id', trackId]);
}
function onVariationChange() {
    //log('VARIATIONSCHANGE')
    const api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    //log('VARIATIONSCHANGE2')
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        //log('VARIATIONSCHANGE2 -- NO', api.get('name').toString())
        return;
    }
    //log('VARIATIONSCHANGE3')
    // send variation stuff
    const varCount = +api.get('variation_count');
    const varSelected = +api.get('selected_variation_index');
    outlet(consts_1.OUTLET_OSC, [
        '/blu/variations',
        '{"count":' + varCount + ',"selected":' + varSelected + '}',
    ]);
}
function sendCuePoints() {
    const api = getUtilApi();
    api.goto('live_set');
    let numerator = parseFloat(api.get('signature_numerator').toString());
    if (typeof numerator !== 'number' || numerator <= 0) {
        // Fallback default if something goes wrong with the API call
        numerator = 4;
        // Optional: print warning to Max console
        log('Warning: Could not retrieve time signature. Defaulting to 4/4.');
    }
    const result = state.cuePointNames.map((cuePoint, idx) => {
        const cuePointTime = parseFloat(cuePoint.get('time'));
        const rawBarIndex = Math.floor(cuePointTime / numerator);
        // Calculate remaining beats into the current bar (0-indexed)
        const rawBeatIndex = cuePointTime % numerator;
        const displayBar = rawBarIndex + 1;
        let displayBeat = rawBeatIndex + 1;
        displayBeat = Math.floor(displayBeat);
        const displaySixteenths = Math.floor((cuePointTime % 1.0) * 4) + 1;
        const disp = displayBar + '.' + displayBeat + '.' + displaySixteenths;
        //log(cuePointTime, displayTicks, displayBeat, disp)
        return {
            idx,
            name: cuePoint.get('name').toString(),
            time: cuePointTime,
            disp,
        };
    });
    //log('CUE POINTS', result)
    outlet(consts_1.OUTLET_OSC, ['/cuePoints', JSON.stringify(result)]);
}
let sendCuePointsTask = null;
function debounceSendCuePoints() {
    if (sendCuePointsTask) {
        sendCuePointsTask.cancel();
    }
    sendCuePointsTask = new Task(sendCuePoints);
    sendCuePointsTask.schedule(20);
}
function onCuePointNameChange(args) {
    if (args[0] !== 'name') {
        return;
    }
    debounceSendCuePoints();
}
function onCuePointTimeChange(args) {
    if (args[0] !== 'time') {
        return;
    }
    debounceSendCuePoints();
}
function cuePointsChange(args) {
    if (args[0] !== 'cue_points') {
        return;
    }
    const cuePointIds = (0, utils_1.cleanArr)(arrayfromargs(args));
    //log('cuePointIds', cuePointIds)
    state.cuePointNames = [];
    state.cuePointTimes = [];
    for (const cuePointId of cuePointIds) {
        // name watcher
        const nameApi = new LiveAPI(onCuePointNameChange, 'id ' + cuePointId);
        nameApi.property = 'name';
        state.cuePointNames.push(nameApi);
        // time watcher
        const timeApi = new LiveAPI(onCuePointTimeChange, 'id ' + cuePointId);
        timeApi.property = 'time';
        state.cuePointTimes.push(timeApi);
    }
    debounceSendCuePoints();
}
function init() {
    state.paramsWatcher = new LiveAPI(debouncedParameterChange, 'live_set view selected_track view selected_device');
    state.paramsWatcher.mode = 1;
    state.paramsWatcher.property = 'parameters';
    state.variationsWatcher = new LiveAPI(onVariationChange, 'live_set view selected_track view selected_device');
    state.variationsWatcher.mode = 1;
    state.variationsWatcher.property = 'variation_count';
    state.cuePointsWatcher = new LiveAPI(cuePointsChange, 'live_set');
    state.cuePointsWatcher.property = 'cue_points';
}
function toggleOnOff() {
    if (!state.onOffWatcher) {
        return;
    }
    const currVal = parseInt(state.onOffWatcher.get('value'));
    state.onOffWatcher.set('value', currVal ? 0 : 1);
}
function updateDeviceOnOff(iargs) {
    const args = arrayfromargs(iargs);
    if (args[0] === 'value') {
        outlet(consts_1.OUTLET_OSC, ['/bOnOff', parseInt(args[1])]);
    }
}
let pcDebounce = null;
function debouncedParameterChange(args) {
    if (args[0].toString() !== 'parameters') {
        return;
    }
    if (pcDebounce) {
        pcDebounce.cancel();
    }
    pcDebounce = new Task(() => {
        onParameterChange(args);
    });
    pcDebounce.schedule(20);
    //log('DEBOUNCE IT')
}
function onParameterChange(args) {
    //log('OPC ' + JSON.stringify(args))
    const api = state.paramsWatcher;
    if (+api.id === 0) {
        return;
    }
    //log(api.info)
    const isSupported = (0, utils_1.isDeviceSupported)(api);
    const deviceType = isSupported ? api.get('class_name').toString() : api.type;
    let paramIds = isSupported ? (0, utils_1.cleanArr)(api.get('parameters')) : [];
    //log('DT', { deviceType })
    //if (deviceType === 'PluginDevice') {
    //  //log('POOPP', { paramIds })
    //  paramIds.pop()
    //  //log('POOPP2', { paramIds })
    //}
    if (paramIds.length === 0) {
        //log('ZERO LEN PARAMIDS')
        state.onOffWatcher && (state.onOffWatcher.id = 0);
    }
    else {
        const onOffParamId = paramIds.shift(); // remove device on/off
        if (!state.onOffWatcher) {
            state.onOffWatcher = new LiveAPI(updateDeviceOnOff, 'id ' + onOffParamId);
            state.onOffWatcher.property = 'value';
        }
        else {
            state.onOffWatcher.id = onOffParamId;
        }
    }
    const canHaveChains = (0, utils_1.isDeviceSupported)(api) && parseInt(api.get('can_have_chains'));
    //log('CAN_HAVE_CHAINS: ' + canHaveChains)
    if (canHaveChains) {
        // see if we should slice off some macros
        const numMacros = parseInt(api.get('visible_macro_count'));
        if (numMacros) {
            //log('GonNNA SlIcE ' + numMacros)
            paramIds = paramIds.slice(0, numMacros);
            if (numMacros > 1) {
                // put filler in the macros to look more like the
                // even 2-row split that Live shows
                const halfMacros = numMacros / 2;
                const filler = Array(8 - halfMacros);
                for (let i = 0; i < filler.length; i++) {
                    filler[i] = 0;
                }
                paramIds = [
                    ...paramIds.slice(0, halfMacros),
                    ...filler,
                    ...paramIds.slice(halfMacros, numMacros),
                    ...filler,
                ];
            }
        }
    }
    //log('PARAMIDS ' + JSON.stringify(paramIds))
    if (state.paramsWatcher.id !== state.currDeviceId) {
        // changed device, reset bank
        state.currBank = 1;
        state.currDeviceId = state.paramsWatcher.id;
    }
    state.devicePath = api.unquotedpath;
    if (!canHaveChains) {
        // null send variation stuff
        outlet(consts_1.OUTLET_OSC, ['/blu/variations', '']);
    }
    state.bankParamArr = getBankParamArr(paramIds, deviceType, api);
    //log('BANK PARAM ARR', { bpa: state.bankParamArr })
    state.numBanks = state.bankParamArr.length;
    if (state.currBank > state.numBanks) {
        state.currBank = state.numBanks;
    }
    //log('STATE CHECK ' + JSON.stringify(state))
    debounceSendCurrBank();
}
function variationNew() {
    const api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        return;
    }
    api.call('store_variation');
    const numVariations = +api.get('variation_count') || 1;
    api.set('selected_variation_index', numVariations - 1);
    onVariationChange();
}
function variationDelete(idx) {
    const api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        return;
    }
    api.set('selected_variation_index', idx);
    api.call('delete_selected_variation');
}
function variationRecall(idx) {
    const api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        return;
    }
    api.set('selected_variation_index', idx);
    api.call('recall_selected_variation');
    onVariationChange();
}
function randomMacros() {
    const api = getSelectedDeviceApi();
    if (+api.id === 0) {
        return;
    }
    if (!+api.get('can_have_chains')) {
        // only applies to racks
        return;
    }
    api.call('randomize_macros');
}
function gotoBank(idx) {
    //log('HERE ' + idx)
    if (idx > 0 && idx <= state.numBanks) {
        state.currBank = idx;
    }
    sendCurrBank();
}
function bankNext() {
    if (state.currBank < state.numBanks) {
        state.currBank++;
    }
    sendCurrBank();
}
function bankPrev() {
    if (state.currBank > 0) {
        state.currBank--;
    }
    sendCurrBank();
}
let utilApi = null;
function getUtilApi() {
    if (!utilApi) {
        utilApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    return utilApi;
}
let selectedDeviceApi = null;
function getSelectedDeviceApi() {
    if (!selectedDeviceApi) {
        selectedDeviceApi = new LiveAPI(consts_1.noFn, 'live_set view selected_track view selected_device');
        selectedDeviceApi.mode = 1;
    }
    return selectedDeviceApi;
}
let liveSetViewApi = null;
function getLiveSetViewApi() {
    if (!liveSetViewApi) {
        liveSetViewApi = new LiveAPI(consts_1.noFn, 'live_set view');
    }
    return liveSetViewApi;
}
let liveSetApi = null;
function getLiveSetApi() {
    if (!liveSetApi) {
        liveSetApi = new LiveAPI(consts_1.noFn, 'live_set');
    }
    return liveSetApi;
}
function toggleMetronome() {
    const api = getLiveSetApi();
    const metroVal = parseInt(api.get('metronome'));
    api.set('metronome', metroVal ? 0 : 1);
}
function tapTempo() {
    const api = getLiveSetApi();
    api.call('tap_tempo');
}
function setTempo(val) {
    const api = getLiveSetApi();
    api.set('tempo', val);
}
function playCuePoint(val) {
    const api = new LiveAPI(null, 'live_set cue_points ' + val);
    //log('PLAY CUE POINT ' + val + ' ' + api.id)
    if (api.id) {
        //log('JUMP ' + val + ' ' + api.id)
        api.call('jump');
        const ctlApi = getLiveSetApi();
        const isPlaying = parseInt(ctlApi.get('is_playing'));
        //log('PLAY ' + isPlaying)
        if (!isPlaying) {
            ctlApi.call('start_playing');
        }
    }
}
function gotoCuePoint(val) {
    const api = new LiveAPI(null, 'live_set cue_points ' + val);
    //log('GOTO CUE POINT ' + val + ' ' + api.id)
    if (api.id) {
        //log('JUMP ' + val + ' ' + api.id)
        api.call('jump');
    }
}
function btnSkipPrev() {
    const ctlApi = getLiveSetApi();
    ctlApi.call('jump_to_prev_cue');
}
function btnSkipNext() {
    const ctlApi = getLiveSetApi();
    ctlApi.call('jump_to_next_cue');
}
function btnReEnableAutomation() {
    const ctlApi = getLiveSetApi();
    ctlApi.call('re_enable_automation');
}
function btnLoop() {
    const ctlApi = getLiveSetApi();
    const isLoop = parseInt(ctlApi.get('loop'));
    ctlApi.set('loop', isLoop ? 0 : 1);
}
function btnCaptureMidi() {
    const ctlApi = getLiveSetApi();
    ctlApi.call('capture_midi');
}
function btnArrangementOverdub() {
    const ctlApi = getLiveSetApi();
    const isOverdub = parseInt(ctlApi.get('arrangement_overdub'));
    ctlApi.set('arrangement_overdub', isOverdub ? 0 : 1);
}
function btnSessionRecord() {
    const ctlApi = getLiveSetApi();
    const isRecord = parseInt(ctlApi.get('session_record'));
    ctlApi.set('session_record', isRecord ? 0 : 1);
}
function trackDelta(delta) {
    return (0, deprecatedMethods_1.deprecatedTrackDelta)(delta);
}
function deviceDelta(delta) {
    return (0, deprecatedMethods_1.deprecatedDeviceDelta)(delta);
}
function trackPrev() {
    trackDelta(-1);
}
function trackNext() {
    trackDelta(1);
}
function devPrev() {
    deviceDelta(-1);
}
function devNext() {
    deviceDelta(1);
}
function ctlRec() {
    const ctlApi = getLiveSetApi();
    const currMode = parseInt(ctlApi.get('record_mode'));
    ctlApi.set('record_mode', currMode === 1 ? 0 : 1);
}
function ctlPlay() {
    const ctlApi = getLiveSetApi();
    ctlApi.call('start_playing');
}
function ctlStop() {
    const ctlApi = getLiveSetApi();
    ctlApi.call('stop_playing');
}
function undo() {
    const api = getLiveSetApi();
    api.call('undo');
}
function redo() {
    const api = getLiveSetApi();
    api.call('redo');
}
log('reloaded k4-bluhandBanks');
module.exports = {};
