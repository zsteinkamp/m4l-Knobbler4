import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Max globals before importing utils
vi.stubGlobal('outlet', vi.fn())
vi.stubGlobal('post', vi.fn())
vi.stubGlobal('Dict', function () {
  const store: Record<string, any> = {}
  return { get: (k: string) => store[k], set: (k: string, v: any) => { store[k] = v } }
})

import {
  dequote,
  isValidPath,
  colorToString,
  truncate,
  meterVal,
  numArrToJson,
  cleanArr,
} from './utils'

describe('dequote', () => {
  it('removes surrounding double quotes', () => {
    expect(dequote('"hello"')).toBe('hello')
  })

  it('removes only surrounding quotes, not inner ones', () => {
    expect(dequote('"say "hi""')).toBe('say "hi"')
  })

  it('returns unquoted strings unchanged', () => {
    expect(dequote('hello')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(dequote('')).toBe('')
  })

  it('handles single quote at start only', () => {
    expect(dequote('"hello')).toBe('hello')
  })

  it('handles single quote at end only', () => {
    expect(dequote('hello"')).toBe('hello')
  })
})

describe('isValidPath', () => {
  it('accepts paths starting with live_set', () => {
    expect(isValidPath('live_set tracks 0 devices 1')).toBeTruthy()
  })

  it('accepts bare live_set with space', () => {
    expect(isValidPath('live_set ')).toBeTruthy()
  })

  it('rejects paths not starting with live_set', () => {
    expect(isValidPath('tracks 0')).toBeFalsy()
  })

  it('rejects empty string', () => {
    expect(isValidPath('')).toBeFalsy()
  })

  it('rejects non-strings', () => {
    expect(isValidPath(null as any)).toBeFalsy()
    expect(isValidPath(undefined as any)).toBeFalsy()
    expect(isValidPath(42 as any)).toBeFalsy()
  })

  it('rejects live_set without trailing space', () => {
    expect(isValidPath('live_set')).toBeFalsy()
  })
})

describe('colorToString', () => {
  it('converts integer color to 6-char hex', () => {
    expect(colorToString('16711680')).toBe('FF0000') // red
  })

  it('pads short hex values with leading zeros', () => {
    expect(colorToString('255')).toBe('0000FF') // blue
  })

  it('handles black (0)', () => {
    expect(colorToString('0')).toBe('000000')
  })

  it('handles white', () => {
    expect(colorToString('16777215')).toBe('FFFFFF')
  })

  it('returns default color for empty/null input', () => {
    expect(colorToString('')).toBe('990000')
    expect(colorToString(null as any)).toBe('990000')
    expect(colorToString(undefined as any)).toBe('990000')
  })
})

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates long strings with ellipsis', () => {
    expect(truncate('abcdefghij', 8)).toBe('abcdef…')
  })

  it('truncates string at exactly the limit (uses < not <=)', () => {
    expect(truncate('abcde', 5)).toBe('abc…')
  })

  it('passes through string shorter than limit', () => {
    expect(truncate('abcd', 5)).toBe('abcd')
  })

  it('handles very short limit', () => {
    expect(truncate('abcdef', 3)).toBe('a…')
  })
})

describe('meterVal', () => {
  it('rounds to 2 decimal places', () => {
    expect(meterVal(0.123456)).toBe(0.12)
  })

  it('handles zero', () => {
    expect(meterVal(0)).toBe(0)
  })

  it('handles string input', () => {
    expect(meterVal('0.456')).toBe(0.46)
  })

  it('returns 0 for NaN input', () => {
    expect(meterVal('not a number')).toBe(0)
    expect(meterVal(null)).toBe(0)
    expect(meterVal(undefined)).toBe(0)
  })

  it('handles 1.0', () => {
    expect(meterVal(1.0)).toBe(1)
  })
})

describe('numArrToJson', () => {
  it('serializes number array to JSON string', () => {
    expect(numArrToJson([1, 2, 3])).toBe('[1,2,3]')
  })

  it('handles empty array', () => {
    expect(numArrToJson([])).toBe('[]')
  })

  it('handles single element', () => {
    expect(numArrToJson([42])).toBe('[42]')
  })

  it('handles floats', () => {
    expect(numArrToJson([0.5, 1.5])).toBe('[0.5,1.5]')
  })
})

describe('cleanArr', () => {
  it('filters LiveAPI id arrays to numeric strings', () => {
    expect(cleanArr(['id', '3', '5', '7'] as any)).toEqual(['3', '5', '7'])
  })

  it('filters out non-numeric strings', () => {
    expect(cleanArr(['id', '42'] as any)).toEqual(['42'])
  })

  it('handles empty array', () => {
    expect(cleanArr([] as any)).toEqual([])
  })

  it('handles null/undefined', () => {
    expect(cleanArr(null as any)).toEqual([])
    expect(cleanArr(undefined as any)).toEqual([])
  })

  it('keeps zero as valid id', () => {
    expect(cleanArr(['id', '0'] as any)).toEqual(['0'])
  })

  it('filters multiple non-numeric prefixes', () => {
    expect(cleanArr(['id', 'count', '10', '20'] as any)).toEqual(['10', '20'])
  })
})
