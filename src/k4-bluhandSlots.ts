// 16-slot bluhand parameter engine. Replaces the native [poly~ finger 16]
// abstraction: each slot binds to a device parameter (by absolute index,
// following the selected device) and pushes its value/name/automation/quant
// state out over OSC, mirroring knobblerCore's scaling and feedback-suppression
// approach. Driven by k4-bluhand (the [v8] entry) which owns the patcher I/O.

import { colorToString, dequote, osc, setOscSink } from './utils'
import { apiId, ensureObs } from './liveApi'
import {
  isNumericLabel,
  MacroSteps,
  probeMacroSteps,
  propToStep,
  propToValue,
  readParamMeta,
  stepToProp,
  stepValue,
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
  // Live 13 rack macro whose value text names steps (see probeSteps).
  // `maybeSteps`: the parameter has a macro's shape, so its text is worth
  // reading. `steps`: what the app was told, null = a dial.
  maybeSteps: boolean
  steps: MacroSteps | null
}

// --- Live 13 macro steps -----------------------------------------------------
// A Live 13 rack macro reads its target's value text, so a macro mapped to a
// filter type reads "Low Pass"/"High Pass"/… and one shown as a button reads
// "Off"/"On" (probeMacroSteps in deviceParam). Such a macro is reported as a
// quantized slot with those items, and its value travels in MultiButton's
// index encoding, translated here to and from a value inside each step's run.
//
// Probed at bind, and again when the value text emitSlotValue already reads
// isn't the step it should be — a remap or a "Show As Button" switch in Live
// shows on the macro's next value change, at no extra cost per value.

function probeSteps(slot: BluSlot): MacroSteps | null {
  if (!slot.maybeSteps) return null
  return probeMacroSteps(
    (v) => dequote(String(valueString(slot.valueApi, v))),
    slot.min,
    slot.max
  )
}

function emitSteps(idx: number, steps: MacroSteps | null) {
  if (steps) emitQuant(idx, steps.items.length, steps.items)
  else emitQuant(idx, 0, [])
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
  if (slot.maybeSteps) {
    const text = dequote(String(str))
    let k = slot.steps ? slot.steps.items.indexOf(text) : -1
    // A dial whose text turned non-numeric, or a step that isn't one of ours:
    // the macro was remapped or switched in Live. Re-probe before telling.
    if (slot.steps ? k < 0 : !isNumericLabel(text)) {
      slot.steps = probeSteps(slot)
      emitSteps(idx, slot.steps)
      // Still a dial. Keep watching only while its text is numeric: a
      // non-numeric dial (note names) would otherwise re-probe on every
      // value change. It is probed again at its next bind.
      if (!slot.steps) slot.maybeSteps = isNumericLabel(text)
      k = slot.steps ? slot.steps.items.indexOf(text) : -1
    }
    if (slot.steps) {
      osc('/bval' + idx, stepToProp(Math.max(0, k), slot.steps.items.length))
      osc('/bvalStr' + idx, str)
      return
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
      maybeSteps: false,
      steps: null,
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
  slot.maybeSteps = false
  slot.steps = null
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
  slot.maybeSteps = !meta.isQuantized && meta.min === 0 && meta.max === 127
  slot.steps = probeSteps(slot)
  if (slot.steps) emitSteps(idx, slot.steps)
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

  slot.valueApi.set(
    'value',
    slot.steps
      ? stepValue(slot.steps, propToStep(value, slot.steps.items.length))
      : propToValue(value, slot.min, slot.max)
  )
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
