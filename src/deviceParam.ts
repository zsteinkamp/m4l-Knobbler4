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
