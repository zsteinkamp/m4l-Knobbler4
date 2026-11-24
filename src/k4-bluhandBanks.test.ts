import { describe, it, expect } from 'vitest'
import { getBankParamArr } from './k4-bluhandBanks'

// A stand-in for a Max device's LiveAPI handle: just its bank functions.
function maxDevice(banks: { name: string; params: number[] }[]): LiveAPI {
  return {
    id: 1,
    call(fn: string, i: number) {
      if (fn === 'get_bank_count') return banks.length
      if (fn === 'get_bank_name') return banks[i].name
      if (fn === 'get_bank_parameters') return banks[i].params
      return null
    },
  } as unknown as LiveAPI
}

// 14 parameter ids, Device On already removed (as k4-bluhand passes them).
const fourteen = Array.from({ length: 14 }, (_, i) => 100 + i)

describe('getBankParamArr for Max devices', () => {
  it("uses the device's banks, two to a page", () => {
    const device = maxDevice([
      { name: 'A', params: [1, 2, 3, 4, 5, 6, 7, 8] },
      { name: 'B', params: [9, 10, 11, 12, 13, 14, -1, -1] },
    ])
    expect(getBankParamArr(fourteen, 'MxDeviceAudioEffect', device)).toEqual([
      {
        name: 'A / B',
        paramIdxArr: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, -1, -1],
      },
    ])
  })

  it('lays out every parameter when banks name ones the API hides (Shaper)', () => {
    // Live 12/13's Shaper, as reported by get_bank_parameters.
    const device = maxDevice([
      { name: 'Main', params: [1, 35, 33, 32, 37, 15, 49, 39] },
      { name: 'Advanced', params: [1, 35, 33, 32, 37, 4, 36, -1] },
    ])
    expect(getBankParamArr(fourteen, 'MxDeviceAudioEffect', device)).toEqual([
      {
        name: 'Page 1',
        paramIdxArr: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      },
    ])
  })
})
