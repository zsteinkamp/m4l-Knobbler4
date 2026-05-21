// 16-slot bluhand parameter engine. Replaces the native [poly~ finger 16]
// abstraction: each slot binds to a device parameter (by absolute index,
// following the selected device) and pushes its value/name/automation/quant
// state out over OSC, mirroring knobblerCore's scaling and feedback-suppression
// approach. Driven by k4-bluhand (the [v8] entry) which owns the patcher I/O.

import { colorToString, dequote, osc } from './utils'
import {
  propToValue,
  readParamMeta,
  valueString,
  valueToProp,
} from './deviceParam'

export const NUM_BLU_SLOTS = 16
const OSC_SUPPRESS_MS = 300
const INVALID_COLOR = '333333ff'

interface BluSlot {
  valueApi: LiveAPI
  nameApi: LiveAPI
  autoApi: LiveAPI
  paramId: number
  min: number
  max: number
  binding: boolean
  allowOscOut: boolean
  suppressTask: Task
}

const slots: BluSlot[] = []
let slotColor = INVALID_COLOR

function emitSlotValue(idx: number) {
  const slot = slots[idx - 1]
  if (slot.binding || !slot.allowOscOut || slot.paramId === 0) {
    return
  }
  const v = parseFloat(slot.valueApi.get('value'))
  osc('/bval' + idx, valueToProp(v, slot.min, slot.max))
  osc('/bvalStr' + idx, valueString(slot.valueApi, v))
}

function emitSlotName(idx: number) {
  const slot = slots[idx - 1]
  if (slot.binding || slot.paramId === 0) {
    return
  }
  osc('/bparam' + idx, dequote(slot.nameApi.get('name')[0]))
}

function emitSlotAuto(idx: number) {
  const slot = slots[idx - 1]
  if (slot.binding || slot.paramId === 0) {
    return
  }
  const st = parseInt(slot.autoApi.get('automation_state'))
  const isEnabled = parseInt(slot.valueApi.get('is_enabled'))
  // bits 0-1: automation state; bit 2 (value 4): parameter disabled
  osc('/bparam' + idx + 'auto', st + (isEnabled ? 0 : 4))
}

function emitEmptySlot(idx: number) {
  osc('/bparam' + idx, '')
  osc('/bparam' + idx + 'auto', 0)
  osc('/bval' + idx, 0)
  osc('/bvalStr' + idx, '')
  osc('/bval' + idx + 'color', INVALID_COLOR)
  osc('/bquant' + idx, 0)
  osc('/bquantItems' + idx, [])
}

function makeSlotCb(idx: number, prop: string, fn: (idx: number) => void) {
  return function (args: IArguments) {
    if (args[0] !== prop) {
      return
    }
    fn(idx)
  }
}

export function initSlots() {
  if (slots.length) {
    return
  }
  for (let i = 1; i <= NUM_BLU_SLOTS; i++) {
    const slot: BluSlot = {
      valueApi: new LiveAPI(makeSlotCb(i, 'value', emitSlotValue), 'id 0'),
      nameApi: new LiveAPI(makeSlotCb(i, 'name', emitSlotName), 'id 0'),
      autoApi: new LiveAPI(makeSlotCb(i, 'automation_state', emitSlotAuto), 'id 0'),
      paramId: 0,
      min: 0,
      max: 1,
      binding: false,
      allowOscOut: true,
      suppressTask: null,
    }
    slot.valueApi.property = 'value'
    slot.nameApi.property = 'name'
    slot.autoApi.property = 'automation_state'
    // Reuse one suppression Task per slot. Allocating a new Task per val() and
    // only cancel()ing the old one leaks (cancel does not free) — and val()
    // fires on every inbound OSC value.
    slot.suppressTask = new Task(function () {
      slot.allowOscOut = true
    })
    slots.push(slot)
  }
}

// Bind slot (1-based) to a device parameter by absolute index, or clear it
// when paramIdx <= 0. The `binding` guard prevents the observer callbacks --
// which fire synchronously when .path is reassigned -- from emitting with
// stale min/max before the new range has been read.
export function setParamIdx(idx: number, paramIdx: number) {
  const slot = slots[idx - 1]
  slot.binding = true

  if (paramIdx <= 0) {
    slot.paramId = 0
    slot.valueApi.id = 0
    slot.nameApi.id = 0
    slot.autoApi.id = 0
    slot.binding = false
    emitEmptySlot(idx)
    return
  }

  const path =
    'live_set view selected_track view selected_device parameters ' + paramIdx
  slot.valueApi.path = path
  const pid = parseInt(slot.valueApi.id as any)
  slot.paramId = pid
  if (pid === 0) {
    slot.binding = false
    emitEmptySlot(idx)
    return
  }
  slot.nameApi.path = path
  slot.autoApi.path = path

  const meta = readParamMeta(slot.valueApi)
  slot.min = meta.min
  slot.max = meta.max
  osc('/bquant' + idx, meta.quantCount)
  osc('/bquantItems' + idx, meta.quantItems)
  osc('/bval' + idx + 'color', slotColor)

  slot.binding = false
  emitSlotName(idx)
  emitSlotValue(idx)
  emitSlotAuto(idx)
}

// new value received over OSC (0..1) -> write scaled to the param's range,
// suppressing the resulting value-observer echo back to OSC for a moment.
export function val(idx: number, value: number) {
  const slot = slots[idx - 1]
  if (!slot || slot.paramId === 0) {
    return
  }
  slot.allowOscOut = false
  slot.suppressTask.cancel()
  slot.suppressTask.schedule(OSC_SUPPRESS_MS)

  slot.valueApi.set('value', propToValue(value, slot.min, slot.max))
  // read the value back (not the value we wrote) because some params round and
  // would report the wrong string for the value we set
  osc('/bvalStr' + idx, valueString(slot.valueApi, parseFloat(slot.valueApi.get('value'))))
}

export function setDefault(idx: number) {
  const slot = slots[idx - 1]
  if (!slot || slot.paramId === 0) {
    return
  }
  slot.valueApi.set('value', parseFloat(slot.valueApi.get('default_value')))
}

export function getParamId(idx: number): number {
  const slot = slots[idx - 1]
  return slot ? slot.paramId : 0
}

// Apply a single color (8-char hex, e.g. "a1b2c3ff") to every bound slot.
export function setColor(colorVal: string) {
  slotColor = colorToString(colorVal).toLowerCase() + 'ff'
  for (let i = 1; i <= NUM_BLU_SLOTS; i++) {
    if (slots[i - 1].paramId !== 0) {
      osc('/bval' + i + 'color', slotColor)
    }
  }
}
