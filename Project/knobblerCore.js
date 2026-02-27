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
exports.xySplit = exports.xyJoin = exports.val = exports.unmap = exports.setPath = exports.setMin = exports.setMax = exports.setDefault = exports.setCustomName = exports.refresh = exports.initAll = exports.gotoTrackFor = exports.clearPath = exports.clearCustomName = exports.bkMap = void 0;
var utils_1 = require("./utils");
var consts_1 = require("./consts");
var config_1 = require("./config");
var log = (0, utils_1.logFactory)(config_1.default);
// Pre-computed OSC address strings (indexed 1–32)
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
// Initialized in init() to avoid "Live API is not initialized" at load time
var scratchApi = null;
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
var deviceCheckerTask = [];
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
    (0, utils_1.saveSetting)(XY_PAIRS_KEY, xyPairs);
}
function loadXYPairs() {
    var val = (0, utils_1.loadSetting)(XY_PAIRS_KEY);
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
    (0, utils_1.osc)('/xyPairs', (0, utils_1.numArrToJson)(xyPairs));
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
    refreshSlotUI(slot);
}
exports.unmap = unmap;
function sendMsg(slot, msg) {
    //log(`${slot} - ${msg.join(' ')}`)
    outlet(consts_1.OUTLET_MSGS, __spreadArray([slot], msg, true));
}
function setPathParam(slot, path) {
    if (path) {
        sendMsg(slot, ['path', path]);
    }
}
function clearPath(slot) {
    //log()
    init(slot);
    refreshSlotUI(slot);
}
exports.clearPath = clearPath;
function bkMap(slot, id) {
    scratchApi.id = id;
    setPath(slot, scratchApi.unquotedpath);
}
exports.bkMap = bkMap;
function initAll() {
    for (var i = 1; i <= consts_1.MAX_SLOTS; i++) {
        initSlotIfNecessary(i);
    }
}
exports.initAll = initAll;
function initSlotIfNecessary(slot) {
    if (!param[slot]) {
        init(slot);
    }
}
function init(slot) {
    if (!scratchApi)
        scratchApi = new LiveAPI(consts_1.noFn, 'live_set');
    //log(`INIT ${slot}`)
    if (paramObj[slot]) {
        (0, utils_1.detach)(paramObj[slot]);
        (0, utils_1.osc)(ADDR_VALSTR[slot], consts_1.nullString);
    }
    paramObj[slot] = null;
    allowMapping[slot] = true;
    allowUpdateFromOsc[slot] = true;
    param[slot] = {
        val: 0,
        min: 0,
        max: 100,
        quant: 0,
        quantItems: [],
        allowParamValueUpdates: true,
    };
    if (deviceCheckerTask[slot]) {
        deviceCheckerTask[slot].cancel();
        deviceCheckerTask[slot].freepeer();
        deviceCheckerTask[slot] = null;
    }
    (0, utils_1.detach)(paramNameObj[slot]);
    (0, utils_1.detach)(automationStateObj[slot]);
    (0, utils_1.detach)(deviceObj[slot]);
    (0, utils_1.detach)(parentNameObj[slot]);
    (0, utils_1.detach)(parentColorObj[slot]);
    (0, utils_1.detach)(trackObj[slot]);
    sendMsg(slot, ['mapped', false]);
    sendMsg(slot, ['path', '']);
}
function setMin(slot, val) {
    //log(`SETMIN ${slot}: ${val}`)
    initSlotIfNecessary(slot);
    outMin[slot] = val / 100.0;
    sendVal(slot);
}
exports.setMin = setMin;
function setMax(slot, val) {
    //log(`SETMAX ${slot}: ${val}`)
    initSlotIfNecessary(slot);
    outMax[slot] = val / 100.0;
    sendVal(slot);
}
exports.setMax = setMax;
function clearCustomName(slot) {
    //log()
    param[slot].customName = null;
    sendParamName(slot);
}
exports.clearCustomName = clearCustomName;
function setCustomName(slot, args) {
    //log(args)
    if (!param[slot]) {
        return;
    }
    param[slot].customName = args;
    sendParamName(slot);
}
exports.setCustomName = setCustomName;
function gotoTrackFor(slot) {
    if (!trackObj[slot]) {
        return;
    }
    scratchApi.path = 'live_set view';
    scratchApi.set('selected_track', ['id', trackObj[slot].id]);
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
    // This function is called whenever the parameter value changes,
    // either via OSC control or by changing the device directly.
    // We need to distinguish between the two and not do anything if the
    // value was changed due to OSC input. Otherwise, we would create a feedback
    // loop since this the purpose of this function is to update the displayed
    // value on the OSC controller to show automation or direct manipulation.
    // We accomplish this by keeping a timestamp of the last time OSC data was
    // received, and only taking action here if more than 500ms has passed.
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
function trackNameCallback(slot, iargs) {
    if (iargs[0] === 'name') {
        param[slot].trackName = iargs[1];
        sendTrackName(slot);
    }
}
function parentColorCallback(slot, iargs) {
    if (iargs[0] === 'color') {
        param[slot].trackColor = (0, utils_1.colorToString)(iargs[1]) + 'FF';
        sendColor(slot);
    }
}
function checkDevicePresent(slot) {
    //log('CHECK_DEVICE_PRESENT ' + slot)
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
function setPath(slot, paramPath) {
    //log(`SETPATH ${slot}: ${paramPath}`)
    initSlotIfNecessary(slot);
    //log(paramPath)
    if (!(0, utils_1.isValidPath)(paramPath)) {
        //log(`skipping ${slot}: ${paramPath}`)
        return;
    }
    var testParamObj = new LiveAPI(function (iargs) { return paramValueCallback(slot, iargs); }, paramPath);
    // catch bad paths
    if (testParamObj.id === 0) {
        log("Invalid path for slot ".concat(slot, ": ").concat(paramPath));
        return;
    }
    testParamObj.property = 'value';
    paramObj[slot] = testParamObj;
    paramNameObj[slot] = new LiveAPI(function (iargs) { return paramNameCallback(slot, iargs); }, paramPath);
    paramNameObj[slot].property = 'name';
    automationStateObj[slot] = new LiveAPI(function (iargs) { return automationStateCallback(slot, iargs); }, paramPath);
    automationStateObj[slot].property = 'automation_state';
    param[slot].id = paramObj[slot].id;
    param[slot].path = paramObj[slot].unquotedpath;
    param[slot].val = parseFloat(paramObj[slot].get('value'));
    param[slot].min = parseFloat(paramObj[slot].get('min')) || 0;
    param[slot].max = parseFloat(paramObj[slot].get('max')) || 1;
    param[slot].name = paramObj[slot].get('name')[0];
    param[slot].quant =
        parseInt(paramObj[slot].get('is_quantized')) > 0
            ? paramObj[slot].get('value_items').length
            : 0;
    param[slot].quantItems =
        parseInt(paramObj[slot].get('is_quantized')) > 0
            ? paramObj[slot].get('value_items')
            : '';
    deviceObj[slot] = new LiveAPI(function (iargs) { return deviceNameCallback(slot, iargs); }, paramObj[slot] && paramObj[slot].get('canonical_parent'));
    var devicePath = deviceObj[slot].unquotedpath;
    // poll to see if the mapped device is still present
    if (deviceCheckerTask[slot] && deviceCheckerTask[slot].cancel) {
        deviceCheckerTask[slot].cancel();
        deviceCheckerTask[slot].freepeer();
        deviceCheckerTask[slot] = null;
    }
    deviceCheckerTask[slot] = new Task(function () { return checkDevicePresent(slot); });
    deviceCheckerTask[slot].interval = 1000; // every second
    deviceCheckerTask[slot].repeat(-1);
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
    parentNameObj[slot] = new LiveAPI(function (iargs) { return parentNameCallback(slot, iargs); }, parentId);
    parentNameObj[slot].property = 'name';
    param[slot].parentName = parentNameObj[slot].get('name');
    // parent color
    parentColorObj[slot] = new LiveAPI(function (iargs) { return parentColorCallback(slot, iargs); }, parentId);
    parentColorObj[slot].property = 'color';
    param[slot].trackColor =
        (0, utils_1.colorToString)(parentColorObj[slot].get('color')) + 'FF';
    // Try to get the track name
    var matches = devicePath.match(/^live_set tracks \d+/) ||
        devicePath.match(/^live_set return_tracks \d+/) ||
        devicePath.match(/^live_set master_track/);
    if (matches) {
        //log(matches[0])
        trackObj[slot] = new LiveAPI(function (iargs) { return trackNameCallback(slot, iargs); }, matches[0]);
    }
    //log("PARAM DATA", JSON.stringify(param), "\n");
    sendMsg(slot, ['mapped', true]);
    setPathParam(slot, param[slot].path);
    // Defer outputting the new param val because the controller
    // will not process it since it was just sending other vals
    // that triggered the mapping.
    var sendValTask = new Task(function () {
        sendVal(slot);
    });
    (0, utils_1.debouncedTask)('sendVal', slot, sendValTask, 333);
    sendNames(slot);
}
exports.setPath = setPath;
function refresh() {
    //log('IN REFRESH')
    for (var i = 1; i <= consts_1.MAX_SLOTS; i++) {
        refreshSlotUI(i);
    }
    loadXYPairs();
    sendXYPairs();
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
    if (param[slot] && param[slot].quant > 2) {
        (0, utils_1.osc)(ADDR_QUANT_ITEMS[slot], JSON.stringify(param[slot].quantItems));
    }
    else {
        (0, utils_1.osc)(ADDR_QUANT_ITEMS[slot], '[]');
    }
}
function sendParamName(slot) {
    //log(`SEND PARAM NAME ${slot}`)
    initSlotIfNecessary(slot);
    var paramName = (0, utils_1.dequote)(((param[slot] && (param[slot].customName || param[slot].name)) ||
        consts_1.nullString).toString());
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
    var deviceName = param[slot].deviceName
        ? (0, utils_1.dequote)(param[slot].deviceName.toString())
        : consts_1.nullString;
    sendMsg(slot, ['device', deviceName]);
    (0, utils_1.osc)(ADDR_DEVICE[slot], deviceName);
}
function sendTrackName(slot) {
    //log(`SEND TRACK NAME ${slot}`)
    initSlotIfNecessary(slot);
    var trackName = param[slot].parentName
        ? (0, utils_1.dequote)(param[slot].parentName.toString())
        : consts_1.nullString;
    sendMsg(slot, ['track', trackName]);
    (0, utils_1.osc)(ADDR_TRACK[slot], trackName);
}
function sendColor(slot) {
    //log(`SEND COLOR ${slot}`)
    initSlotIfNecessary(slot);
    var trackColor = param[slot].trackColor
        ? (0, utils_1.dequote)(param[slot].trackColor.toString())
        : consts_1.DEFAULT_COLOR_FF;
    (0, utils_1.osc)(ADDR_VALCOLOR[slot], trackColor);
    // for the color highlight in the Max for Live device
    if (trackColor === consts_1.DEFAULT_COLOR_FF) {
        trackColor = '000000FF';
    }
    var red = parseInt(trackColor.substring(0, 2), 16) / 255.0 || 0;
    var grn = parseInt(trackColor.substring(2, 4), 16) / 255.0 || 0;
    var blu = parseInt(trackColor.substring(4, 6), 16) / 255.0 || 0;
    var alp = parseInt(trackColor.substring(6, 8), 16) / 255.0 || 0;
    sendMsg(slot, ['color', red, grn, blu, alp]);
}
function sendVal(slot) {
    //log(`SEND VAL ${slot}`)
    initSlotIfNecessary(slot);
    if (!paramObj[slot] ||
        paramObj[slot].id === 0 ||
        param[slot].val === undefined ||
        param[slot].max === undefined ||
        param[slot].min === undefined ||
        outMax[slot] === outMin[slot]) {
        (0, utils_1.osc)(ADDR_VAL[slot], 0);
        (0, utils_1.osc)(ADDR_VALSTR[slot], consts_1.nullString);
        return;
    }
    // the value, expressed as a proportion between the param min and max
    var valProp = (param[slot].val - param[slot].min) / (param[slot].max - param[slot].min);
    //log('VALPROP', valProp, JSON.stringify(param), 'OUTMINMAX', outMin, outMax)
    // scale the param proportion value to the output min/max proportion
    var scaledValProp = (valProp - outMin[slot]) / (outMax[slot] - outMin[slot]);
    scaledValProp = Math.min(scaledValProp, 1);
    scaledValProp = Math.max(scaledValProp, 0);
    //log(`SCALEDVALPROP slot=${slot} val=${scaledValProp}`)
    (0, utils_1.osc)(ADDR_VAL[slot], scaledValProp);
    (0, utils_1.osc)(ADDR_VALSTR[slot], paramObj[slot]
        ? paramObj[slot].call('str_for_value', param[slot].val)
        : consts_1.nullString);
}
// new value received over OSC
function val(slot, val) {
    //log(slot + ' - VAL: ' + val)
    if (paramObj[slot]) {
        if (allowUpdateFromOsc[slot]) {
            // scale the 0..1 value to the param's min/max range
            var scaledVal = (outMax[slot] - outMin[slot]) * val + outMin[slot];
            param[slot].val =
                (param[slot].max - param[slot].min) * scaledVal + param[slot].min;
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
            (0, utils_1.osc)(ADDR_VALSTR[slot], paramObj[slot].call('str_for_value', paramObj[slot].get('value')));
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
var module = {};
