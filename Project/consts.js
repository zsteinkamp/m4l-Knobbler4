"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIELD_INDENT = exports.FIELD_COLOR = exports.FIELD_NAME = exports.FIELD_ID = exports.FIELD_TYPE = exports.nullString = exports.METER_FLUSH_MS = exports.PAUSE_MS = exports.MAX_SENDS = exports.MAX_NAME_LEN = exports.noFn = exports.DEFAULT_COLOR_FF = exports.DEFAULT_COLOR = exports.TYPE_CHILD_CHAIN = exports.TYPE_RACK = exports.TYPE_DEVICE = exports.TYPE_GROUP = exports.TYPE_MAIN = exports.TYPE_RETURN = exports.TYPE_CHAIN = exports.TYPE_TRACK = exports.MAX_SLOTS = exports.OUTLET_CONFIGURE = exports.OUTLET_PAGE = exports.OUTLET_REFRESH = exports.OUTLET_SHORTCUT_NAME = exports.OUTLET_MSGS = exports.OUTLET_OSC = exports.INLET_MSGS = void 0;
exports.INLET_MSGS = 0;
// [v8 knobbler] entry outlet map (shared by all folded-in modules):
exports.OUTLET_OSC = 0; // OSC out -> [gate] -> [node.script] sender
exports.OUTLET_MSGS = 1; // knobblerCore -> knob-slot bpatcher messages
exports.OUTLET_SHORTCUT_NAME = 2; // [slot, name] -> [s ---shortcutName] (device-UI labels)
// k4-system (former [v8 router]) Max-side passthroughs:
exports.OUTLET_REFRESH = 3; // 'refresh'/'initMenuOnly' -> [s ---REFRESH_LOGIC]
exports.OUTLET_PAGE = 4; // 'page' <name> -> [s ---PAGE] (page UI)
exports.OUTLET_CONFIGURE = 5; // 'host'/'port' -> [s ---CONFIGURE] (node sender target)
exports.MAX_SLOTS = 32;
exports.TYPE_TRACK = 0;
exports.TYPE_CHAIN = 1;
exports.TYPE_RETURN = 2;
exports.TYPE_MAIN = 3;
exports.TYPE_GROUP = 4;
exports.TYPE_DEVICE = 5;
exports.TYPE_RACK = 6;
exports.TYPE_CHILD_CHAIN = 7;
exports.DEFAULT_COLOR = '990000';
exports.DEFAULT_COLOR_FF = exports.DEFAULT_COLOR + 'FF';
var noFn = function () { };
exports.noFn = noFn;
exports.MAX_NAME_LEN = 32;
exports.MAX_SENDS = 12;
exports.PAUSE_MS = 300;
exports.METER_FLUSH_MS = 30;
exports.nullString = '- - -';
// indices into MaxObjRecord arrays for fields
exports.FIELD_TYPE = 0;
exports.FIELD_ID = 1;
exports.FIELD_NAME = 2;
exports.FIELD_COLOR = 3;
exports.FIELD_INDENT = 4;
