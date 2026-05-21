"use strict";
// 16-slot bluhand parameter engine. Replaces the native [poly~ finger 16]
// abstraction: each slot binds to a device parameter (by absolute index,
// following the selected device) and pushes its value/name/automation/quant
// state out over OSC, mirroring knobblerCore's scaling and feedback-suppression
// approach. Driven by k4-bluhand (the [v8] entry) which owns the patcher I/O.
Object.defineProperty(exports, "__esModule", { value: true });
exports.setColor = exports.getParamId = exports.setDefault = exports.val = exports.setParamIdx = exports.initSlots = exports.NUM_BLU_SLOTS = void 0;
var utils_1 = require("./utils");
var deviceParam_1 = require("./deviceParam");
exports.NUM_BLU_SLOTS = 16;
var OSC_SUPPRESS_MS = 300;
var INVALID_COLOR = '333333ff';
var slots = [];
var slotColor = INVALID_COLOR;
function emitSlotValue(idx) {
    var slot = slots[idx - 1];
    if (slot.binding || !slot.allowOscOut || slot.paramId === 0) {
        return;
    }
    var v = parseFloat(slot.valueApi.get('value'));
    (0, utils_1.osc)('/bval' + idx, (0, deviceParam_1.valueToProp)(v, slot.min, slot.max));
    (0, utils_1.osc)('/bvalStr' + idx, (0, deviceParam_1.valueString)(slot.valueApi, v));
}
function emitSlotName(idx) {
    var slot = slots[idx - 1];
    if (slot.binding || slot.paramId === 0) {
        return;
    }
    (0, utils_1.osc)('/bparam' + idx, (0, utils_1.dequote)(slot.nameApi.get('name')[0]));
}
function emitSlotAuto(idx) {
    var slot = slots[idx - 1];
    if (slot.binding || slot.paramId === 0) {
        return;
    }
    var st = parseInt(slot.autoApi.get('automation_state'));
    var isEnabled = parseInt(slot.valueApi.get('is_enabled'));
    // bits 0-1: automation state; bit 2 (value 4): parameter disabled
    (0, utils_1.osc)('/bparam' + idx + 'auto', st + (isEnabled ? 0 : 4));
}
function emitEmptySlot(idx) {
    (0, utils_1.osc)('/bparam' + idx, '');
    (0, utils_1.osc)('/bparam' + idx + 'auto', 0);
    (0, utils_1.osc)('/bval' + idx, 0);
    (0, utils_1.osc)('/bvalStr' + idx, '');
    (0, utils_1.osc)('/bval' + idx + 'color', INVALID_COLOR);
    (0, utils_1.osc)('/bquant' + idx, 0);
    (0, utils_1.osc)('/bquantItems' + idx, []);
}
function makeSlotCb(idx, prop, fn) {
    return function (args) {
        if (args[0] !== prop) {
            return;
        }
        fn(idx);
    };
}
function initSlots() {
    if (slots.length) {
        return;
    }
    var _loop_1 = function (i) {
        var slot = {
            valueApi: new LiveAPI(makeSlotCb(i, 'value', emitSlotValue), 'id 0'),
            nameApi: new LiveAPI(makeSlotCb(i, 'name', emitSlotName), 'id 0'),
            autoApi: new LiveAPI(makeSlotCb(i, 'automation_state', emitSlotAuto), 'id 0'),
            paramId: 0,
            min: 0,
            max: 1,
            binding: false,
            allowOscOut: true,
            suppressTask: null,
        };
        slot.valueApi.property = 'value';
        slot.nameApi.property = 'name';
        slot.autoApi.property = 'automation_state';
        // Reuse one suppression Task per slot. Allocating a new Task per val() and
        // only cancel()ing the old one leaks (cancel does not free) — and val()
        // fires on every inbound OSC value.
        slot.suppressTask = new Task(function () {
            slot.allowOscOut = true;
        });
        slots.push(slot);
    };
    for (var i = 1; i <= exports.NUM_BLU_SLOTS; i++) {
        _loop_1(i);
    }
}
exports.initSlots = initSlots;
// Bind slot (1-based) to a device parameter by absolute index, or clear it
// when paramIdx <= 0. The `binding` guard prevents the observer callbacks --
// which fire synchronously when .path is reassigned -- from emitting with
// stale min/max before the new range has been read.
function setParamIdx(idx, paramIdx) {
    var slot = slots[idx - 1];
    slot.binding = true;
    if (paramIdx <= 0) {
        slot.paramId = 0;
        slot.valueApi.id = 0;
        slot.nameApi.id = 0;
        slot.autoApi.id = 0;
        slot.binding = false;
        emitEmptySlot(idx);
        return;
    }
    var path = 'live_set view selected_track view selected_device parameters ' + paramIdx;
    slot.valueApi.path = path;
    var pid = parseInt(slot.valueApi.id);
    slot.paramId = pid;
    if (pid === 0) {
        slot.binding = false;
        emitEmptySlot(idx);
        return;
    }
    slot.nameApi.path = path;
    slot.autoApi.path = path;
    var meta = (0, deviceParam_1.readParamMeta)(slot.valueApi);
    slot.min = meta.min;
    slot.max = meta.max;
    (0, utils_1.osc)('/bquant' + idx, meta.quantCount);
    (0, utils_1.osc)('/bquantItems' + idx, meta.quantItems);
    (0, utils_1.osc)('/bval' + idx + 'color', slotColor);
    slot.binding = false;
    emitSlotName(idx);
    emitSlotValue(idx);
    emitSlotAuto(idx);
}
exports.setParamIdx = setParamIdx;
// new value received over OSC (0..1) -> write scaled to the param's range,
// suppressing the resulting value-observer echo back to OSC for a moment.
function val(idx, value) {
    var slot = slots[idx - 1];
    if (!slot || slot.paramId === 0) {
        return;
    }
    slot.allowOscOut = false;
    slot.suppressTask.cancel();
    slot.suppressTask.schedule(OSC_SUPPRESS_MS);
    slot.valueApi.set('value', (0, deviceParam_1.propToValue)(value, slot.min, slot.max));
    // read the value back (not the value we wrote) because some params round and
    // would report the wrong string for the value we set
    (0, utils_1.osc)('/bvalStr' + idx, (0, deviceParam_1.valueString)(slot.valueApi, parseFloat(slot.valueApi.get('value'))));
}
exports.val = val;
function setDefault(idx) {
    var slot = slots[idx - 1];
    if (!slot || slot.paramId === 0) {
        return;
    }
    slot.valueApi.set('value', parseFloat(slot.valueApi.get('default_value')));
}
exports.setDefault = setDefault;
function getParamId(idx) {
    var slot = slots[idx - 1];
    return slot ? slot.paramId : 0;
}
exports.getParamId = getParamId;
// Apply a single color (8-char hex, e.g. "a1b2c3ff") to every bound slot.
function setColor(colorVal) {
    slotColor = (0, utils_1.colorToString)(colorVal).toLowerCase() + 'ff';
    for (var i = 1; i <= exports.NUM_BLU_SLOTS; i++) {
        if (slots[i - 1].paramId !== 0) {
            (0, utils_1.osc)('/bval' + i + 'color', slotColor);
        }
    }
}
exports.setColor = setColor;
