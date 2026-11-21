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

export const SLOTS_PER_BANK = 16
const SLOTS_PER_ROW = 8

// [left words, right words]: the left parameter must contain one of the left
// words and the parameter immediately to its right one of the right words.
export const XY_PAIRINGS: [string[], string[]][] = [
  [
    ['freq', 'frequency', 'cutoff'],
    ['res', 'reso', 'resonance', 'q'],
  ],
  [['x'], ['y']],
  [['pan'], ['tilt']],
  [['time'], ['feedback']],
]

function words(name: string): string[] {
  return (name || '').toLowerCase().split(/[^a-z0-9]+/)
}

function hasWord(name: string, wanted: string[]): boolean {
  const w = words(name)
  for (let i = 0; i < wanted.length; i++) {
    if (w.indexOf(wanted[i]) !== -1) return true
  }
  return false
}

function isPairing(left: string, right: string): boolean {
  if (!left || !right) return false
  for (let i = 0; i < XY_PAIRINGS.length; i++) {
    if (hasWord(left, XY_PAIRINGS[i][0]) && hasWord(right, XY_PAIRINGS[i][1])) {
      return true
    }
  }
  return false
}

// Left slots (1-based within the bank) of the pairs in one bank of 16 names;
// an empty name is an empty slot. Pads never overlap and never span the two
// rows of eight, since the app lays a bank out as 2 x 8.
export function bankPairs(names: string[]): number[] {
  const ret: number[] = []
  for (let s = 0; s < SLOTS_PER_BANK - 1; s++) {
    if (s % SLOTS_PER_ROW === SLOTS_PER_ROW - 1) continue
    if (isPairing(names[s], names[s + 1])) {
      ret.push(s + 1)
      s++ // the right half can't start another pad
    }
  }
  return ret
}

// Pairs for every bank, numbered the way the app numbers bluhand slots: bank k
// (0-based) owns 16k+1..16k+16. So the app needs no bank translation for this
// message, and every bank page has its pads before it is first shown.
export function allPairs(bankNames: string[][]): number[] {
  const ret: number[] = []
  bankNames.forEach(function (names, k) {
    bankPairs(names).forEach(function (s) {
      ret.push(k * SLOTS_PER_BANK + s)
    })
  })
  return ret
}
