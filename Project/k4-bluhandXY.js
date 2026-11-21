"use strict";
// Auto XY for bluhand: two adjacent parameters whose names form a known
// pairing (Frequency + Resonance, X + Y, ...) are shown in the app as one XY
// pad. Pure matching; k4-bluhand feeds it each bank's parameter names and sends
// the result as /bxyPairs. Owns no Max I/O.
//
// The list is deliberately fixed — no per-user overrides. A missing pairing is
// a device release, and the whole feature can be turned off (setting autoXY).
//
// Matching is case-insensitive on whole WORDS of the parameter name, so "Freq"
// matches "Filter Freq" and "1 Freq A" but not "Frequency" (list both).
Object.defineProperty(exports, "__esModule", { value: true });
exports.allPairs = exports.bankPairs = exports.XY_PAIRINGS = exports.SLOTS_PER_BANK = void 0;
exports.SLOTS_PER_BANK = 16;
var SLOTS_PER_ROW = 8;
// [left words, right words]: the left parameter must contain one of the left
// words and the parameter immediately to its right one of the right words.
exports.XY_PAIRINGS = [
    [
        ['freq', 'frequency', 'cutoff'],
        ['res', 'reso', 'resonance', 'q'],
    ],
    [['x'], ['y']],
    [['pan'], ['tilt']],
    [['time'], ['feedback']],
];
function words(name) {
    return (name || '').toLowerCase().split(/[^a-z0-9]+/);
}
function hasWord(name, wanted) {
    var w = words(name);
    for (var i = 0; i < wanted.length; i++) {
        if (w.indexOf(wanted[i]) !== -1)
            return true;
    }
    return false;
}
function isPairing(left, right) {
    if (!left || !right)
        return false;
    for (var i = 0; i < exports.XY_PAIRINGS.length; i++) {
        if (hasWord(left, exports.XY_PAIRINGS[i][0]) && hasWord(right, exports.XY_PAIRINGS[i][1])) {
            return true;
        }
    }
    return false;
}
// Left slots (1-based within the bank) of the pairs in one bank of 16 names;
// an empty name is an empty slot. Pads never overlap and never span the two
// rows of eight, since the app lays a bank out as 2 x 8.
function bankPairs(names) {
    var ret = [];
    for (var s = 0; s < exports.SLOTS_PER_BANK - 1; s++) {
        if (s % SLOTS_PER_ROW === SLOTS_PER_ROW - 1)
            continue;
        if (isPairing(names[s], names[s + 1])) {
            ret.push(s + 1);
            s++; // the right half can't start another pad
        }
    }
    return ret;
}
exports.bankPairs = bankPairs;
// Pairs for every bank, numbered the way the app numbers bluhand slots: bank k
// (0-based) owns 16k+1..16k+16. So the app needs no bank translation for this
// message, and every bank page has its pads before it is first shown.
function allPairs(bankNames) {
    var ret = [];
    bankNames.forEach(function (names, k) {
        bankPairs(names).forEach(function (s) {
            ret.push(k * exports.SLOTS_PER_BANK + s);
        });
    });
    return ret;
}
exports.allPairs = allPairs;
