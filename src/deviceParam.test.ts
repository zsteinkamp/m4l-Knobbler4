import { describe, it, expect } from 'vitest'
import {
  isNumericLabel,
  MAX_MACRO_STEPS,
  probeMacroSteps,
  propToStep,
  stepToProp,
  stepValue,
} from './deviceParam'

// A macro mapped across a quantized target of `items`, the way Live spreads
// one: value v shows item round(v / 127 * (n - 1)). Counts the reads.
function mapped(items: string[]) {
  let reads = 0
  const strAt = (v: number) => {
    reads++
    return items[Math.round((v / 127) * (items.length - 1))]
  }
  return { strAt, reads: () => reads }
}

describe('probeMacroSteps', () => {
  it('finds a filter-type mapping', () => {
    const items = ['Low Pass', 'High Pass', 'Band Pass', 'Notch', 'Morph']
    const { strAt } = mapped(items)
    const steps = probeMacroSteps(strAt, 0, 127)!
    expect(steps.items).toEqual(items)
    // contiguous, covering the whole range
    expect(steps.starts[0]).toBe(0)
    expect(steps.ends[items.length - 1]).toBe(127)
    for (let k = 1; k < items.length; k++) {
      expect(steps.starts[k]).toBe(steps.ends[k - 1] + 1)
      expect(strAt(steps.starts[k])).toBe(items[k])
      expect(strAt(steps.starts[k] - 1)).toBe(items[k - 1])
    }
  })

  it('finds a Show As Button macro', () => {
    const strAt = (v: number) => (v < 64 ? 'Off' : 'On')
    expect(probeMacroSteps(strAt, 0, 127)!.items).toEqual(['Off', 'On'])
  })

  it("rejects Live 12's numeric macro text in two reads", () => {
    let reads = 0
    const strAt = (v: number) => (reads++, String(v))
    expect(probeMacroSteps(strAt, 0, 127)).toBeNull()
    expect(reads).toBe(2)
  })

  it('rejects continuous targets with units, -inf included', () => {
    const strAt = (v: number) =>
      v === 0 ? '-inf dB' : `${(v / 127) * 6 - 30} dB`
    expect(probeMacroSteps(strAt, 0, 127)).toBeNull()
  })

  it('rejects dense text (note names) cheaply', () => {
    const notes = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ]
    let reads = 0
    const strAt = (v: number) => (
      reads++,
      notes[v % 12] + (Math.floor(v / 12) - 2)
    )
    expect(probeMacroSteps(strAt, 0, 127)).toBeNull()
    expect(reads).toBeLessThanOrEqual(5)
  })

  it('gives up past MAX_MACRO_STEPS', () => {
    const many = Array.from(
      { length: MAX_MACRO_STEPS + 1 },
      (_, i) => `Mode ${String.fromCharCode(65 + i)}`
    )
    // wide enough runs to pass the density check
    expect(probeMacroSteps(mapped(many).strAt, 0, 127)).toBeNull()
    const ok = many.slice(0, MAX_MACRO_STEPS)
    expect(probeMacroSteps(mapped(ok).strAt, 0, 127)!.items).toEqual(ok)
  })

  it('costs about 7 reads per step', () => {
    const m = mapped(['Sine', 'Saw', 'Square', 'Triangle', 'Noise', 'S&H'])
    probeMacroSteps(m.strAt, 0, 127)
    expect(m.reads()).toBeLessThanOrEqual(6 * 8)
  })

  it('rejects all-numeric steps and a single label', () => {
    expect(
      probeMacroSteps(mapped(['1', '2', '4', '8']).strAt, 0, 127)
    ).toBeNull()
    expect(probeMacroSteps(() => 'Off', 0, 127)).toBeNull()
  })

  it('rejects text that comes back', () => {
    const strAt = (v: number) => (v < 40 || v > 90 ? 'A' : 'B')
    expect(probeMacroSteps(strAt, 0, 127)).toBeNull()
  })
})

describe('step values', () => {
  const steps = probeMacroSteps(mapped(['A1', 'B1', 'C1', 'D1']).strAt, 0, 127)!

  it('writes the ends for the outer steps, the middle for the rest', () => {
    expect(stepValue(steps, 0)).toBe(0)
    expect(stepValue(steps, 3)).toBe(127)
    const mid = stepValue(steps, 1)
    expect(mid).toBeGreaterThanOrEqual(steps.starts[1])
    expect(mid).toBeLessThanOrEqual(steps.ends[1])
  })

  it("round-trips MultiButton's index encoding", () => {
    for (const n of [2, 3, 5, 8, 32]) {
      for (let k = 0; k < n; k++) {
        expect(propToStep(stepToProp(k, n), n)).toBe(k)
      }
    }
  })
})

describe('isNumericLabel', () => {
  it('reads numbers with units as numeric', () => {
    for (const s of [
      '0',
      '127',
      '-3.5 dB',
      '-inf dB',
      '12 %',
      '1.2 kHz',
      '+6 st',
    ])
      expect(isNumericLabel(s)).toBe(true)
    for (const s of ['Off', 'Low Pass', 'C3', '1/4', 'Mode A'])
      expect(isNumericLabel(s)).toBe(false)
  })
})
