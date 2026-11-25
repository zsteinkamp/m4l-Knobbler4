// Shared pure helpers for working with a Live DeviceParameter: value scaling,
// metadata reads, and value-string formatting. Used by both knobblerCore and
// k4-bluhandSlots. Observer ownership, binding lifecycle, and OSC address
// schemes stay in each consumer — only the math/meta lives here.
//
// The scaling supports an optional output sub-range [outMin,outMax] (knobbler's
// per-slot min/max). bluhand passes none, i.e. outMin=0/outMax=1 (identity).

import { dequote, fixFloat } from './utils'

// Map a raw parameter value in [min,max] to a 0..1 proportion, remapped through
// the output sub-range [outMin,outMax]. Clamped to 0..1.
export function valueToProp(
  value: number,
  min: number,
  max: number,
  outMin = 0,
  outMax = 1
): number {
  const range = max - min
  const outRange = outMax - outMin
  if (!range || !outRange) {
    return 0
  }
  const prop = (value - min) / range
  const scaled = (prop - outMin) / outRange
  return Math.max(0, Math.min(1, scaled))
}

// Inverse of valueToProp: map a 0..1 proportion to a raw parameter value.
export function propToValue(
  prop: number,
  min: number,
  max: number,
  outMin = 0,
  outMax = 1
): number {
  const scaled = (outMax - outMin) * prop + outMin
  return (max - min) * scaled + min
}

export type ParamMeta = {
  min: number
  max: number
  isQuantized: boolean
  quantCount: number
  quantItems: string[]
}

// Read the static metadata of a bound DeviceParameter (min/max range and the
// quantized value list, if any). quantItems is [] when the param is continuous.
export function readParamMeta(api: LiveAPI): ParamMeta {
  const min = parseFloat(api.get('min') as any) || 0
  const max = parseFloat(api.get('max') as any) || 1
  const isQuantized = parseInt(api.get('is_quantized') as any) > 0
  let quantItems: string[] = []
  if (isQuantized) {
    const raw = (api.get('value_items') as unknown as any[]) || []
    quantItems = raw.map((it) => dequote(it.toString()))
  }
  return { min, max, isQuantized, quantCount: quantItems.length, quantItems }
}

// The display string Live shows for a given raw parameter value.
export function valueString(api: LiveAPI, value: number): string {
  return api.call('str_for_value', fixFloat(value)) as unknown as string
}

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

export const MAX_MACRO_STEPS = 32

export type MacroSteps = {
  items: string[] // the text of each step, in macro order
  starts: number[] // first integer macro value showing items[k]
  ends: number[] // last integer macro value showing items[k]
}

// A number with an optional unit: "0", "-3.5 dB", "-inf dB", "12 %", "1.2 kHz".
const NUMERIC_LABEL = /^[-+]?(\d+(\.\d*)?|\.\d+|inf)\s*[a-z%°]*$/i

export function isNumericLabel(s: string): boolean {
  return NUMERIC_LABEL.test(s.trim())
}

export function probeMacroSteps(
  strAt: (v: number) => string,
  min: number,
  max: number
): MacroSteps | null {
  const lo = Math.ceil(min)
  const hi = Math.floor(max)
  if (hi - lo < 1) return null
  const cache: Record<number, string> = {}
  const at = (v: number) => {
    if (!(v in cache)) cache[v] = strAt(v)
    return cache[v]
  }
  // A dial: numbers at both ends (Live 12's "0".."127", any continuous target).
  if (isNumericLabel(at(lo)) && isNumericLabel(at(hi))) return null
  // Dense: N ≤ MAX_MACRO_STEPS steps over 128 values are ≥ 4 wide, so three
  // neighbours can't all differ.
  const m = Math.floor((lo + hi) / 2)
  if (
    hi - lo >= 2 &&
    at(m - 1) !== at(m) &&
    at(m) !== at(m + 1) &&
    at(m - 1) !== at(m + 1)
  ) {
    return null
  }
  // Every v where the text changes from v - 1. Left half first, so ascending.
  const bounds: number[] = []
  let overflow = false
  const split = (a: number, b: number) => {
    if (overflow) return
    if (b - a === 1) {
      bounds.push(b)
      if (bounds.length >= MAX_MACRO_STEPS) overflow = true
      return
    }
    const c = Math.floor((a + b) / 2)
    if (at(a) !== at(c)) split(a, c)
    if (at(c) !== at(b)) split(c, b)
  }
  if (at(lo) !== at(hi)) split(lo, hi)
  if (overflow || !bounds.length) return null
  const starts = [lo, ...bounds]
  const items = starts.map(at)
  // A step whose text comes back later isn't a step list; all-numeric steps
  // (a coarse continuous target) are better as a dial.
  if (items.some((it, i) => items.indexOf(it) !== i)) return null
  if (items.every(isNumericLabel)) return null
  const ends = bounds.map((b) => b - 1).concat(hi)
  return { items, starts, ends }
}

// The macro value to write for step k: the macro's end for the first and last
// steps (Off = 0, On = 127, as Live's own button writes), the middle of the
// run for the others, safely away from either neighbour.
export function stepValue(steps: MacroSteps, k: number): number {
  const last = steps.items.length - 1
  const i = Math.max(0, Math.min(last, k))
  if (i === 0) return steps.starts[0]
  if (i === last) return steps.ends[last]
  return Math.round((steps.starts[i] + steps.ends[i]) / 2)
}

// MultiButton's index encoding (the app's idxToProp / propToIdx).
export function stepToProp(k: number, count: number): number {
  return count > 1 ? Math.min(1, (k + 0.01) / (count - 1)) : 0
}

export function propToStep(prop: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(prop * (count - 1))))
}
