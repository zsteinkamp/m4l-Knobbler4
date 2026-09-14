"use strict";
// Clip-slot display state, derived from the slot and its track. Pure, so the
// windowed observers (k4-clipView) and the background prefetch sweep derive it
// with the SAME rules — two copies of this would drift, and a cell would then
// change colour when it scrolled into view.
Object.defineProperty(exports, "__esModule", { value: true });
exports.clipCellState = exports.NO_SLOT = exports.CLIP_RECORD_TRIGGERED = exports.CLIP_ARMED = exports.CLIP_RECORDING = exports.CLIP_TRIGGERED = exports.CLIP_PLAYING = exports.CLIP_STOPPED = exports.CLIP_EMPTY = void 0;
exports.CLIP_EMPTY = 0;
exports.CLIP_STOPPED = 1;
exports.CLIP_PLAYING = 2;
exports.CLIP_TRIGGERED = 3;
exports.CLIP_RECORDING = 4;
exports.CLIP_ARMED = 5;
exports.CLIP_RECORD_TRIGGERED = 6; // fired empty slot on an armed track (pending record)
// No slot playing/fired. Any negative index works (Live uses -1 for none and -2
// for a pending stop); neither can equal a real row.
exports.NO_SLOT = -1;
function clipCellState(hasClip, isRecording, row, playingSlot, firedSlot, armed) {
    if (!hasClip) {
        if (armed) {
            // A fired empty slot on an armed track is pending a record — it's waiting
            // for the launch-quantization point. Surface it distinctly so the app can
            // pulse its border (like a triggered clip) until recording actually starts.
            return firedSlot === row ? exports.CLIP_RECORD_TRIGGERED : exports.CLIP_ARMED;
        }
        return exports.CLIP_EMPTY;
    }
    if (isRecording)
        return exports.CLIP_RECORDING;
    if (firedSlot === row)
        return exports.CLIP_TRIGGERED;
    if (playingSlot === row)
        return exports.CLIP_PLAYING;
    return exports.CLIP_STOPPED;
}
exports.clipCellState = clipCellState;
