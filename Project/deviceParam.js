"use strict";
// Shared pure helpers for working with a Live DeviceParameter: value scaling,
// metadata reads, and value-string formatting. Used by both knobblerCore and
// k4-bluhandSlots. Observer ownership, binding lifecycle, and OSC address
// schemes stay in each consumer — only the math/meta lives here.
//
// The scaling supports an optional output sub-range [outMin,outMax] (knobbler's
// per-slot min/max). bluhand passes none, i.e. outMin=0/outMax=1 (identity).
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
exports.propToStep = exports.stepToProp = exports.stepValue = exports.macroSteps = exports.clearMacroStepsCache = exports.probeMacroSteps = exports.isNumericLabel = exports.MAX_MACRO_STEPS = exports.valueString = exports.readParamMeta = exports.propToValue = exports.valueToProp = void 0;
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
// --- Live 13 macro steps ------------------------------------------------------
// In Live 13 a rack macro reports its TARGET's value text: a macro mapped to
// Auto Filter's filter type reads "Low Pass", "High Pass", … where Live 12 read
// "0".."127". Nothing else changes — it stays is_quantized 0, range 0–127, no
// value_items — so the steps can only be found from str_for_value. "Show Macro
// As Button" is the 2-step case: the text becomes "Off"/"On".
//
// probeMacroSteps reads the macro's text across its integer values and returns
// one step per run of identical text, or null when the macro reads as a dial.
// Cost is bounded: two reads reject the common numeric case ("0", "-inf dB",
// "1.2 kHz"), three more reject anything dense (note names), and otherwise a
// bisection reads about 7 values per step, giving up past MAX_MACRO_STEPS.
// str_for_value reads don't intern Max symbols (CLAUDE.md → symbol table).
exports.MAX_MACRO_STEPS = 32;
// A number with an optional unit: "0", "-3.5 dB", "-inf dB", "12 %", "1.2 kHz".
var NUMERIC_LABEL = /^[-+]?(\d+(\.\d*)?|\.\d+|inf)\s*[a-z%°]*$/i;
function isNumericLabel(s) {
    return NUMERIC_LABEL.test(s.trim());
}
exports.isNumericLabel = isNumericLabel;
function probeMacroSteps(strAt, min, max) {
    var lo = Math.ceil(min);
    var hi = Math.floor(max);
    if (hi - lo < 1)
        return null;
    var cache = {};
    var at = function (v) {
        if (!(v in cache))
            cache[v] = strAt(v);
        return cache[v];
    };
    // A dial: numbers at both ends (Live 12's "0".."127", any continuous target).
    if (isNumericLabel(at(lo)) && isNumericLabel(at(hi)))
        return null;
    // Dense: N ≤ MAX_MACRO_STEPS steps over 128 values are ≥ 4 wide, so three
    // neighbours can't all differ.
    var m = Math.floor((lo + hi) / 2);
    if (hi - lo >= 2 &&
        at(m - 1) !== at(m) &&
        at(m) !== at(m + 1) &&
        at(m - 1) !== at(m + 1)) {
        return null;
    }
    // Every v where the text changes from v - 1. Left half first, so ascending.
    var bounds = [];
    var overflow = false;
    var split = function (a, b) {
        if (overflow)
            return;
        if (b - a === 1) {
            bounds.push(b);
            if (bounds.length >= exports.MAX_MACRO_STEPS)
                overflow = true;
            return;
        }
        var c = Math.floor((a + b) / 2);
        if (at(a) !== at(c))
            split(a, c);
        if (at(c) !== at(b))
            split(c, b);
    };
    if (at(lo) !== at(hi))
        split(lo, hi);
    if (overflow || !bounds.length)
        return null;
    var starts = __spreadArray([lo], bounds, true);
    var items = starts.map(at);
    // A step whose text comes back later isn't a step list; all-numeric steps
    // (a coarse continuous target) are better as a dial.
    if (items.some(function (it, i) { return items.indexOf(it) !== i; }))
        return null;
    if (items.every(isNumericLabel))
        return null;
    var ends = bounds.map(function (b) { return b - 1; }).concat(hi);
    return { items: items, starts: starts, ends: ends };
}
exports.probeMacroSteps = probeMacroSteps;
var stepsCache = {};
function clearMacroStepsCache() {
    stepsCache = {};
}
exports.clearMacroStepsCache = clearMacroStepsCache;
function macroSteps(id, strAt, min, max, force) {
    if (force === void 0) { force = false; }
    var read = {};
    var at = function (v) {
        if (!(v in read))
            read[v] = strAt(v);
        return read[v];
    };
    var lo = at(Math.ceil(min));
    var hi = at(Math.floor(max));
    var hit = id ? stepsCache[id] : undefined;
    if (!force && hit && hit.lo === lo && hit.hi === hi)
        return hit.steps;
    var steps = probeMacroSteps(at, min, max);
    if (id)
        stepsCache[id] = { lo: lo, hi: hi, steps: steps };
    return steps;
}
exports.macroSteps = macroSteps;
// The macro value to write for step k: the macro's end for the first and last
// steps (Off = 0, On = 127, as Live's own button writes), the middle of the
// run for the others, safely away from either neighbour.
function stepValue(steps, k) {
    var last = steps.items.length - 1;
    var i = Math.max(0, Math.min(last, k));
    if (i === 0)
        return steps.starts[0];
    if (i === last)
        return steps.ends[last];
    return Math.round((steps.starts[i] + steps.ends[i]) / 2);
}
exports.stepValue = stepValue;
// MultiButton's index encoding (the app's idxToProp / propToIdx).
function stepToProp(k, count) {
    return count > 1 ? Math.min(1, (k + 0.01) / (count - 1)) : 0;
}
exports.stepToProp = stepToProp;
function propToStep(prop, count) {
    return Math.max(0, Math.min(count - 1, Math.floor(prop * (count - 1))));
}
exports.propToStep = propToStep;
