"use strict";
// Shared pure helpers for working with a Live DeviceParameter: value scaling,
// metadata reads, and value-string formatting. Used by both knobblerCore and
// k4-bluhandSlots. Observer ownership, binding lifecycle, and OSC address
// schemes stay in each consumer — only the math/meta lives here.
//
// The scaling supports an optional output sub-range [outMin,outMax] (knobbler's
// per-slot min/max). bluhand passes none, i.e. outMin=0/outMax=1 (identity).
Object.defineProperty(exports, "__esModule", { value: true });
exports.valueString = exports.readParamMeta = exports.propToValue = exports.valueToProp = void 0;
var utils_1 = require("./utils");
// Map a raw parameter value in [min,max] to a 0..1 proportion, remapped through
// the output sub-range [outMin,outMax]. Clamped to 0..1.
function valueToProp(value, min, max, outMin, outMax) {
    if (outMin === void 0) { outMin = 0; }
    if (outMax === void 0) { outMax = 1; }
    var range = max - min;
    var outRange = outMax - outMin;
    if (!range || !outRange) {
        return 0;
    }
    var prop = (value - min) / range;
    var scaled = (prop - outMin) / outRange;
    return Math.max(0, Math.min(1, scaled));
}
exports.valueToProp = valueToProp;
// Inverse of valueToProp: map a 0..1 proportion to a raw parameter value.
function propToValue(prop, min, max, outMin, outMax) {
    if (outMin === void 0) { outMin = 0; }
    if (outMax === void 0) { outMax = 1; }
    var scaled = (outMax - outMin) * prop + outMin;
    return (max - min) * scaled + min;
}
exports.propToValue = propToValue;
// Read the static metadata of a bound DeviceParameter (min/max range and the
// quantized value list, if any). quantItems is [] when the param is continuous.
function readParamMeta(api) {
    var min = parseFloat(api.get('min')) || 0;
    var max = parseFloat(api.get('max')) || 1;
    var isQuantized = parseInt(api.get('is_quantized')) > 0;
    var quantItems = [];
    if (isQuantized) {
        var raw = api.get('value_items') || [];
        quantItems = raw.map(function (it) { return (0, utils_1.dequote)(it.toString()); });
    }
    return { min: min, max: max, isQuantized: isQuantized, quantCount: quantItems.length, quantItems: quantItems };
}
exports.readParamMeta = readParamMeta;
// The display string Live shows for a given raw parameter value.
function valueString(api, value) {
    return api.call('str_for_value', (0, utils_1.fixFloat)(value));
}
exports.valueString = valueString;
