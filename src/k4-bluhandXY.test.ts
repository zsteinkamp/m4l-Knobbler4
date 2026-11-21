import { describe, it, expect } from 'vitest'
import { allPairs, bankPairs } from './k4-bluhandXY'

function bank(names: Record<number, string>): string[] {
  const arr: string[] = []
  for (let i = 0; i < 16; i++) arr.push(names[i + 1] || '')
  return arr
}

describe('bankPairs', () => {
  it('pairs Auto Filter frequency and resonance', () => {
    expect(bankPairs(bank({ 1: 'Frequency', 2: 'Resonance' }))).toEqual([1])
  })

  it('matches whole words, case-insensitively', () => {
    expect(bankPairs(bank({ 3: '1 FREQ A', 4: '1 Q A' }))).toEqual([3])
    // "Quality" is not the word "Q"; "Xfade" is not "X"
    expect(bankPairs(bank({ 1: 'Cutoff', 2: 'Quality' }))).toEqual([])
    expect(bankPairs(bank({ 1: 'Xfade', 2: 'Y' }))).toEqual([])
  })

  it('is ordered: left side must be on the left', () => {
    expect(bankPairs(bank({ 1: 'Resonance', 2: 'Frequency' }))).toEqual([])
    expect(bankPairs(bank({ 1: 'Y', 2: 'X' }))).toEqual([])
  })

  it('never spans the two rows', () => {
    expect(bankPairs(bank({ 8: 'X', 9: 'Y' }))).toEqual([])
  })

  it('never overlaps', () => {
    // X Y Y: one pad, the third stays a slider
    expect(bankPairs(bank({ 1: 'X', 2: 'Y', 3: 'Y' }))).toEqual([1])
    // two pads side by side
    expect(
      bankPairs(bank({ 1: 'Freq', 2: 'Res', 3: 'Time', 4: 'Feedback' }))
    ).toEqual([1, 3])
  })

  it('ignores empty slots', () => {
    expect(bankPairs(bank({ 2: 'Y' }))).toEqual([])
  })
})

describe('allPairs', () => {
  it('numbers pairs in app space, 16 slots per bank', () => {
    expect(
      allPairs([bank({ 1: 'X', 2: 'Y' }), bank({}), bank({ 5: 'Pan', 6: 'Tilt' })])
    ).toEqual([1, 37])
  })
})
