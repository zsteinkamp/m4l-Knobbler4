import config from './config'
import {
  detach,
  dequote,
  logFactory,
  osc,
  pauseUnpause,
  PauseState,
} from './utils'
import { INLET_MSGS, OUTLET_OSC, PAUSE_MS, noFn } from './consts'

autowatch = 1
inlets = 1
outlets = 1

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Messages from router')
setoutletassist(OUTLET_OSC, 'OSC messages to [udpsend]')

// Extract track path from a device canonical path
// e.g. "live_set tracks 3 devices 1" → "live_set tracks 3"
const TRACK_PATH_RE =
  /^(live_set (?:tracks \d+|return_tracks \d+|master_track))/

let active = false
let paramSelObj: LiveAPI = null // mode=1, follows selected_parameter
let paramValObj: LiveAPI = null // observes value on current param
let trackColorObj: LiveAPI = null // observes color on current track
let scratchApi: LiveAPI = null // throwaway lookups (device name, track name, etc.)
const pause: PauseState = { paused: false, task: null }

let currentParamId = 0
let locked = false

function show() {
  if (active) return
  active = true
  //log('currentParam show')

  // scratchApi for throwaway lookups — separate instance to avoid re-entrancy
  if (!scratchApi) {
    scratchApi = new LiveAPI(noFn, 'live_set')
  }

  // paramValObj observes value changes on the selected parameter
  if (!paramValObj) {
    paramValObj = new LiveAPI(onValueChange, '')
  }

  // trackColorObj observes color on the track
  if (!trackColorObj) {
    trackColorObj = new LiveAPI(onTrackColorChange, '')
  }

  // paramSelObj follows live_set view selected_parameter (mode=1)
  // Created last because setting property fires the callback immediately
  if (!paramSelObj) {
    //log('activating paramSelObj observer')
    paramSelObj = new LiveAPI(onParamSelected, 'live_set view selected_parameter')
    paramSelObj.mode = 1
    paramSelObj.property = 'id'
  } else {
    //log('reactivating paramSelObj observer')
    paramSelObj.property = 'id'
  }
}

function hide() {
  if (!active) return
  active = false
  //log('currentParam hide')

  if (paramSelObj) {
    //log('detaching paramSelObj')
    detach(paramSelObj)
  }
  if (paramValObj) {
    //log('detaching paramValObj')
    detach(paramValObj)
  }
  if (trackColorObj) {
    //log('detaching trackColorObj')
    detach(trackColorObj)
  }
  currentParamId = 0
}

function lock(val: number) {
  locked = !!val
  if (!locked && active && paramSelObj) {
    onParamSelected()
  }
}

function onParamSelected() {
  if (!active || locked || !paramSelObj) return
  const paramId = parseInt(paramSelObj.id as any)
  if (!paramId || paramId === 0) {
    currentParamId = 0
    return
  }
  currentParamId = paramId
  sendAllParamInfo(paramId)
}

function sendAllParamInfo(paramId: number) {
  // Point scratchApi at the parameter
  scratchApi.id = paramId
  if (scratchApi.type !== 'DeviceParameter') return

  const paramName = dequote(scratchApi.get('name').toString())
  const paramMin = parseFloat(scratchApi.get('min').toString())
  const paramMax = parseFloat(scratchApi.get('max').toString())
  const paramVal = parseFloat(scratchApi.get('value').toString())

  // Get the min/max display strings
  const minStr = dequote(
    (scratchApi.call('str_for_value', paramMin) as any).toString()
  )
  const maxStr = dequote(
    (scratchApi.call('str_for_value', paramMax) as any).toString()
  )
  const valStr = dequote(
    (scratchApi.call('str_for_value', paramVal) as any).toString()
  )

  // Scale value to 0-1
  const scaledVal =
    paramMax > paramMin ? (paramVal - paramMin) / (paramMax - paramMin) : 0

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
    trackColor = '#' + ('000000' + parseInt(scratchApi.get('color').toString()).toString(16)).slice(-6)

    // Set up track color observer
    trackColorObj.property = ''
    trackColorObj.path = trackMatch[1]
    trackColorObj.property = 'color'
    //log('trackColorObj observing color on', trackMatch[1])
  }

  // Set up value observer on the parameter
  paramValObj.property = ''
  paramValObj.id = paramId
  paramValObj.property = 'value'
  //log('paramValObj observing value on param', paramId)

  // Send all info to the app
  osc('/currentParam/name', paramName)
  osc('/currentParam/deviceName', deviceName)
  osc('/currentParam/trackName', trackName)
  osc('/currentParam/trackColor', trackColor)
  osc('/currentParam/minStr', minStr)
  osc('/currentParam/maxStr', maxStr)
  osc('/currentParam/valStr', valStr)
  osc('/currentParam/val', scaledVal)
}

function onValueChange() {
  if (!active || !currentParamId || pause.paused) return

  scratchApi.id = currentParamId
  if (scratchApi.type !== 'DeviceParameter') return

  const paramVal = parseFloat(scratchApi.get('value').toString())
  const paramMin = parseFloat(scratchApi.get('min').toString())
  const paramMax = parseFloat(scratchApi.get('max').toString())
  const valStr = dequote(
    (scratchApi.call('str_for_value', paramVal) as any).toString()
  )

  const scaledVal =
    paramMax > paramMin ? (paramVal - paramMin) / (paramMax - paramMin) : 0

  osc('/currentParam/val', scaledVal)
  osc('/currentParam/valStr', valStr)
}

function onTrackColorChange() {
  if (!active || !currentParamId) return
  const color = '#' + ('000000' + parseInt(trackColorObj.get('color').toString()).toString(16)).slice(-6)
  osc('/currentParam/trackColor', color)
}

// Called from router when user moves the current param slider
function currentParamVal(val: number) {
  if (!currentParamId) return

  scratchApi.id = currentParamId
  if (scratchApi.type !== 'DeviceParameter') return

  const paramMin = parseFloat(scratchApi.get('min').toString())
  const paramMax = parseFloat(scratchApi.get('max').toString())

  // Scale from 0-1 to param range
  const rawVal = paramMin + val * (paramMax - paramMin)
  pauseUnpause(pause, PAUSE_MS)
  scratchApi.set('value', rawVal)

  const valStr = dequote(
    (scratchApi.call('str_for_value', rawVal) as any).toString()
  )
  osc('/currentParam/valStr', valStr)
}

// Called from router when user taps "default" button
function currentParamDefault() {
  if (!currentParamId) return

  scratchApi.id = currentParamId
  if (scratchApi.type !== 'DeviceParameter') return

  const defaultVal = parseFloat(scratchApi.get('default_value').toString())
  const paramMin = parseFloat(scratchApi.get('min').toString())
  const paramMax = parseFloat(scratchApi.get('max').toString())

  pauseUnpause(pause, PAUSE_MS)
  scratchApi.set('value', defaultVal)

  const scaledVal =
    paramMax > paramMin ? (defaultVal - paramMin) / (paramMax - paramMin) : 0
  const valStr = dequote(
    (scratchApi.call('str_for_value', defaultVal) as any).toString()
  )
  osc('/currentParam/val', scaledVal)
  osc('/currentParam/valStr', valStr)
}

function refresh() {
  if (!active || !currentParamId) return
  sendAllParamInfo(currentParamId)
}

log('reloaded k4-currentParam')

// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
