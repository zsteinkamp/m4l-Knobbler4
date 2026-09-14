// Clip-slot display state, derived from the slot and its track. Pure, so the
// windowed observers (k4-clipView) and the background prefetch sweep derive it
// with the SAME rules — two copies of this would drift, and a cell would then
// change colour when it scrolled into view.

export const CLIP_EMPTY = 0
export const CLIP_STOPPED = 1
export const CLIP_PLAYING = 2
export const CLIP_TRIGGERED = 3
export const CLIP_RECORDING = 4
export const CLIP_ARMED = 5
export const CLIP_RECORD_TRIGGERED = 6 // fired empty slot on an armed track (pending record)

// No slot playing/fired. Any negative index works (Live uses -1 for none and -2
// for a pending stop); neither can equal a real row.
export const NO_SLOT = -1

export function clipCellState(
  hasClip: boolean,
  isRecording: boolean,
  row: number,
  playingSlot: number,
  firedSlot: number,
  armed: boolean
): number {
  if (!hasClip) {
    if (armed) {
      // A fired empty slot on an armed track is pending a record — it's waiting
      // for the launch-quantization point. Surface it distinctly so the app can
      // pulse its border (like a triggered clip) until recording actually starts.
      return firedSlot === row ? CLIP_RECORD_TRIGGERED : CLIP_ARMED
    }
    return CLIP_EMPTY
  }
  if (isRecording) return CLIP_RECORDING
  if (firedSlot === row) return CLIP_TRIGGERED
  if (playingSlot === row) return CLIP_PLAYING
  return CLIP_STOPPED
}
