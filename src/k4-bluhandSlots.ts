// 16-slot bluhand parameter engine. Replaces the native [poly~ finger 16]
// abstraction: each slot binds to a device parameter (by absolute index,
// following the selected device) and pushes its value/name/automation/quant
// state out over OSC, mirroring knobblerCore's scaling and feedback-suppression
// approach. Driven by k4-bluhand (the [v8] entry) which owns the patcher I/O.

import { colorToString, dequote, osc, setOscSink } from './utils'
import { apiId, ensureObs } from './liveApi'
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
  // Live 13 rack macro shown as a button (see detectButton). `maybeButton`:
  // the parameter has a macro's shape, so its value text is worth checking.
  maybeButton: boolean
  isButton: boolean
}

// --- Live 13 macro buttons ----------------------------------------------------
// Live 13 can show a rack macro as a button ("Show Macro As Button"), and the
// LOM gives no sign of it: the macro stays is_quantized 0, range 0–127, with no
// new member, and nothing observable fires when the appearance changes
// (measured with /debug/info, Nov 2026). The only trace is its value text,
// which becomes "Off"/"On". So a non-quantized 0–127 parameter whose ends read
// "Off" and "On" is reported as a 2-step slot, and the app draws its button.
// A dial mapped to an on/off parameter reads the same way and becomes a
// button too, which suits it.
//
// Checked at bind (two str_for_value reads, macro-shaped params only) and
// again whenever the value text emitSlotValue already reads disagrees with the
// current state — that catches a switch made in Live on the next value change,
// at no extra cost per value.
const BUTTON_ITEMS = ['Off', 'On']

function isOnOff(str: string): boolean {
  return str === 'On' || str === 'Off'
}

function detectButton(slot: BluSlot): boolean {
  if (!slot.maybeButton) return false
  return (
    dequote(String(valueString(slot.valueApi, slot.min))) === 'Off' &&
    dequote(String(valueString(slot.valueApi, slot.max))) === 'On'
  )
}

function emitQuant(idx: number, quantCount: number, quantItems: string[]) {
  osc('/bquant' + idx, quantCount)
  osc('/bquantItems' + idx, quantItems)
}

const slots: BluSlot[] = []
let slotColor = INVALID_COLOR

function emitSlotValue(idx: number) {
  const slot = slots[idx - 1]
  if (slot.binding || !slot.allowOscOut || slot.paramId === 0) {
    return
  }
  const v = parseFloat(slot.valueApi.get('value'))
  const str = valueString(slot.valueApi, v)
  if (slot.maybeButton && isOnOff(dequote(String(str))) !== slot.isButton) {
    // The text disagrees with what we reported: the macro's appearance was
    // switched in Live. Re-check properly before telling the app.
    const isButton = detectButton(slot)
    if (isButton !== slot.isButton) {
      slot.isButton = isButton
      if (isButton) emitQuant(idx, 2, BUTTON_ITEMS)
      else emitQuant(idx, 0, [])
    }
  }
  osc('/bval' + idx, valueToProp(v, slot.min, slot.max))
  osc('/bvalStr' + idx, str)
}

function emitSlotName(idx: number) {
  const slot = slots[idx - 1]
  if (slot.binding || slot.paramId === 0) {
    return
  }
  osc('/bparam' + idx, dequote(slot.nameApi.get('name')[0]))
}

// Called when a bound parameter is renamed in Live (not on bind), so Auto XY
// can re-pair: renaming two rack macros to "X"/"Y" joins them on the spot.
let onRename: () => void = null
export function setRenameHandler(fn: () => void) {
  onRename = fn
}

function onSlotNameChange(idx: number) {
  const slot = slots[idx - 1]
  if (slot.binding || slot.paramId === 0) {
    return
  }
  emitSlotName(idx)
  if (onRename) onRename()
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

// Wire this module's own utils instance to the orchestrator's OSC sink (ctx.osc),
// called from k4-bluhand.init — require() gives this file a separate utils
// instance, so its osc() must be pointed at the shared batch buffer too.
export function bindOsc(fn: (addr: string, val: any) => void) {
  setOscSink(fn)
}

// Parameter IDs of the device the slots currently bind to, indexed exactly as
// `<device> parameters N` is (element 0 is the device on/off). Set by k4-bluhand
// from the id-list read it already does in onParameterChange; empty = no device
// → slots clear.
//
// Binding by id rather than by a `<devicePath> parameters N` path string is what
// keeps this off Max's symbol table: each distinct path interns a permanent
// symbol, and bluhand rebuilds all 16 slots on every device AND bank change, so
// browsing a set used to cost ~16 symbols per (device, bank) visited. `.id =`
// is numeric and interns nothing, and the id list itself comes from a
// non-interning `.get('parameters')`. See CLAUDE.md / k4-symbolTest.
let deviceParamIds: number[] = []
export function setDeviceParams(paramIds: number[]) {
  deviceParamIds = paramIds || []
}

export function initSlots() {
  if (slots.length) {
    return
  }
  for (let i = 1; i <= NUM_BLU_SLOTS; i++) {
    const slot: BluSlot = {
      valueApi: null,
      nameApi: null,
      autoApi: null,
      paramId: 0,
      min: 0,
      max: 1,
      binding: false,
      allowOscOut: true,
      suppressTask: null,
      maybeButton: false,
      isButton: false,
    }
    // Reuse one suppression Task per slot (cancel() does not free, and val()
    // fires on every inbound OSC value). The LiveAPI observers are created
    // lazily on first valid bind (setParamIdx) with the real, resolvable path
    // — never with a placeholder, which [v8] would log as "invalid path".
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

  const targetId = paramIdx > 0 ? deviceParamIds[paramIdx] || 0 : 0
  slot.maybeButton = false
  slot.isButton = false
  if (!targetId) {
    slot.paramId = 0
    if (slot.valueApi) {
      // park the observers (id 0) rather than tearing them down — teardown
      // leaks ~6 symbols each and never gives them back (CLAUDE.md)
      slot.valueApi.id = 0
      slot.nameApi.id = 0
      slot.autoApi.id = 0
    }
    slot.binding = false
    emitEmptySlot(idx)
    return
  }

  // Lazy-create on first bind, re-point (free) thereafter.
  slot.valueApi = ensureObs(
    slot.valueApi,
    targetId,
    makeSlotCb(idx, 'value', emitSlotValue),
    'value'
  )

  const pid = apiId(slot.valueApi)
  slot.paramId = pid
  if (pid === 0) {
    slot.binding = false
    emitEmptySlot(idx)
    return
  }

  // Only bind the name/automation observers once we know the id resolves.
  slot.nameApi = ensureObs(
    slot.nameApi,
    pid,
    makeSlotCb(idx, 'name', onSlotNameChange),
    'name'
  )
  slot.autoApi = ensureObs(
    slot.autoApi,
    pid,
    makeSlotCb(idx, 'automation_state', emitSlotAuto),
    'automation_state'
  )

  const meta = readParamMeta(slot.valueApi)
  slot.min = meta.min
  slot.max = meta.max
  slot.maybeButton = !meta.isQuantized && meta.min === 0 && meta.max === 127
  slot.isButton = detectButton(slot)
  if (slot.isButton) emitQuant(idx, 2, BUTTON_ITEMS)
  else emitQuant(idx, meta.quantCount, meta.quantItems)
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
  osc(
    '/bvalStr' + idx,
    valueString(slot.valueApi, parseFloat(slot.valueApi.get('value')))
  )
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
