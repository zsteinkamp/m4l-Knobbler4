import config from './k4-config'
import {
  colorToString,
  dequote,
  logFactory,
  setOscSink,
  osc,
  pauseUnpause,
  PauseState,
} from './utils'
import { apiId } from './liveApi'
import { propToValue, valueString, valueToProp } from './deviceParam'
import { PAUSE_MS, noFn } from './consts'

const log = logFactory(config)

// Extract track path from a device canonical path
// e.g. "live_set tracks 3 devices 1" → "live_set tracks 3"
const TRACK_PATH_RE =
  /^(live_set (?:tracks \d+|return_tracks \d+|master_track))/

let active = false
let paramSelObj: LiveAPI = null // mode=1, follows selected_parameter
let paramValObj: LiveAPI = null // observes value on current param
let trackColorObj: LiveAPI = null // observes color on current track
let scratchApi: LiveAPI = null // throwaway lookups (device name, track name, etc.)
let valScratchApi: LiveAPI = null // separate scratchpad for onValueChange
const pause: PauseState = { paused: false, task: null }

let currentParamId = 0
let locked = false

function ensureApis() {
  if (!scratchApi) scratchApi = new LiveAPI(noFn, 'live_set')
  if (!valScratchApi) valScratchApi = new LiveAPI(noFn, 'live_set')
}

let observersBuilt = false

// Build the 3 observers once and keep them alive; show/hide toggle their
// subscription (property '') rather than detach+recreate. Detach leaks ~6 symbols
// each (see CLAUDE.md observer lifecycle), and re-arming is free.
function ensureObservers() {
  ensureApis()
  if (observersBuilt) return
  paramValObj = new LiveAPI(onValueChange, '')
  trackColorObj = new LiveAPI(onTrackColorChange, '')
  // paramSelObj follows live_set view selected_parameter (mode=1)
  paramSelObj = new LiveAPI(onParamSelected, 'live_set view selected_parameter')
  paramSelObj.mode = 1
  observersBuilt = true
}

function show() {
  if (active) return
  active = true
  ensureObservers()
  // Setting paramSelObj.property re-arms it AND fires onParamSelected immediately,
  // which re-points paramValObj/trackColorObj at the current selection.
  paramSelObj.property = 'id'
}

function hide() {
  if (!active) return
  active = false
  // Disable (property='') instead of detach — keeps the objects for reuse and
  // retains their ids (the stale-id-0 issue the old detach path warned about).
  if (paramSelObj) paramSelObj.property = ''
  if (paramValObj) paramValObj.property = ''
  if (trackColorObj) trackColorObj.property = ''
  currentParamId = 0
}

function lock(val: number) {
  locked = !!val
  if (!locked && active && paramSelObj) {
    onParamSelected()
  }
}

// One reusable debounce Task — allocating one per selection never freed the
// previous peer.
let paramSelectDebounce: MaxTask = null

function onParamSelected() {
  if (!active || locked || !paramSelObj) return
  const paramId = apiId(paramSelObj)
  if (paramId === 0) {
    currentParamId = 0
    return
  }
  currentParamId = paramId

  if (!paramSelectDebounce) {
    paramSelectDebounce = new Task(function () {
      sendAllParamInfo(currentParamId)
    }) as MaxTask
  }
  paramSelectDebounce.cancel()
  paramSelectDebounce.schedule(40)
}

// Point `api` at a parameter and read the three things every handler here
// needs. Null when the id isn't a DeviceParameter (deleted device, stale id).
// The scaling and str_for_value formatting come from deviceParam.ts, the same
// helpers knobblerCore and k4-bluhandSlots use — this module used to reimplement
// both in four places.
type ParamRead = { value: number; prop: number; str: string }
function readParam(api: LiveAPI, paramId: number): ParamRead | null {
  api.id = paramId
  if (api.type !== 'DeviceParameter') return null
  return describe(api, parseFloat(api.get('value').toString()))
}

// The scaled proportion + display string for `value` on an already-pointed api.
function describe(api: LiveAPI, value: number): ParamRead {
  const min = parseFloat(api.get('min').toString())
  const max = parseFloat(api.get('max').toString())
  return {
    value: value,
    prop: valueToProp(value, min, max),
    str: dequote(valueString(api, value)),
  }
}

// #rrggbb for the app, from Live's packed integer color. Lower-cased to keep
// the wire format byte-identical to what this module emitted before it shared
// utils' colorToString (which upper-cases).
function colorHash(raw: any): string {
  return '#' + colorToString(raw ? raw.toString() : '').toLowerCase()
}

function sendAllParamInfo(paramId: number) {
  ensureApis()

  const read = readParam(scratchApi, paramId)
  if (!read) return

  const paramName = dequote(scratchApi.get('name').toString())
  const paramMin = parseFloat(scratchApi.get('min').toString())
  const paramMax = parseFloat(scratchApi.get('max').toString())
  const minStr = dequote(valueString(scratchApi, paramMin))
  const maxStr = dequote(valueString(scratchApi, paramMax))

  // Navigate to the parent device
  const paramPath = scratchApi.unquotedpath
  const devicePath = paramPath.replace(/ parameters \d+$/, '')
  scratchApi.path = devicePath
  let deviceName = ''
  if ((scratchApi.type as string) === 'MixerDevice') {
    deviceName = 'Mixer'
  } else {
    deviceName = dequote(scratchApi.get('name').toString())
  }

  // Navigate to the track
  const trackMatch = devicePath.match(TRACK_PATH_RE)
  let trackName = ''
  let trackColor = '#000000'
  if (trackMatch) {
    scratchApi.path = trackMatch[1]
    trackName = dequote(scratchApi.get('name').toString())
    trackColor = colorHash(scratchApi.get('color'))

    // Set up track color observer
    if (trackColorObj) {
      trackColorObj.property = ''
      trackColorObj.path = trackMatch[1]
      trackColorObj.property = 'color'
    }
  }

  // Set up value observer on the parameter
  if (paramValObj) {
    paramValObj.property = ''
    paramValObj.id = paramId
    paramValObj.property = 'value'
  }

  // Send all info to the app
  osc('/currentParam/name', paramName)
  osc('/currentParam/deviceName', deviceName)
  osc('/currentParam/trackName', trackName)
  osc('/currentParam/trackColor', trackColor)
  osc('/currentParam/minStr', minStr)
  osc('/currentParam/maxStr', maxStr)
  osc('/currentParam/valStr', read.str)
  osc('/currentParam/val', read.prop)
}

function onValueChange() {
  if (!active || !currentParamId || pause.paused) return

  // Use separate scratchpad to avoid re-entrancy with scratchApi
  const read = readParam(valScratchApi, currentParamId)
  if (!read) return

  osc('/currentParam/val', read.prop)
  osc('/currentParam/valStr', read.str)
}

function onTrackColorChange() {
  if (!active || !currentParamId || !trackColorObj) return
  osc('/currentParam/trackColor', colorHash(trackColorObj.get('color')))
}

// Called from router when user moves the current param slider
function currentParamVal(val: number) {
  if (!currentParamId) return

  ensureApis()
  scratchApi.id = currentParamId
  if (scratchApi.type !== 'DeviceParameter') return

  const paramMin = parseFloat(scratchApi.get('min').toString())
  const paramMax = parseFloat(scratchApi.get('max').toString())

  // Scale from 0-1 to param range
  const rawVal = propToValue(val, paramMin, paramMax)
  pauseUnpause(pause, PAUSE_MS)
  scratchApi.set('value', rawVal)

  osc('/currentParam/valStr', dequote(valueString(scratchApi, rawVal)))
}

// Called from router when user taps "default" button
function currentParamDefault() {
  if (!currentParamId) return

  ensureApis()
  scratchApi.id = currentParamId
  if (scratchApi.type !== 'DeviceParameter') return

  const defaultVal = parseFloat(scratchApi.get('default_value').toString())
  pauseUnpause(pause, PAUSE_MS)
  scratchApi.set('value', defaultVal)

  const read = describe(scratchApi, defaultVal)
  osc('/currentParam/val', read.prop)
  osc('/currentParam/valStr', read.str)
}

function doRefresh(c: AppContext) {
  setOscSink(c.osc)
  if (!active || !currentParamId) return
  sendAllParamInfo(currentParamId)
}

// --- Route table (dispatched by the [v8 knobbler] entry) -------------------
const routes: Route[] = [
  {
    prefix: '/currentParam/val',
    parse: 'val',
    fn: currentParamVal,
    coalesce: true,
  },
  { prefix: '/currentParam/default', parse: 'bare', fn: currentParamDefault },
  { prefix: '/currentParam/lock', parse: 'val', fn: lock },
  { prefix: '/currentParam/show', parse: 'bare', fn: show },
  { prefix: '/currentParam/hide', parse: 'bare', fn: hide },
]

log('reloaded k4-currentParam')

// init() re-pushes state on refresh (no-op until the app has shown the panel).
export { routes }
export { doRefresh as init }
