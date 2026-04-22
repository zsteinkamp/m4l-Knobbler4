import {
  cleanArr,
  colorToString,
  detach,
  fixFloat,
  getVisibleTracks,
  loadInstanceSetting,
  numArrToJson,
  saveInstanceSetting,
  setDictPrefix as _setDictPrefix,
  logFactory,
  meterVal,
  osc,
  pauseUnpause,
  PauseState,
} from './utils'
import config from './config'
import {
  noFn,
  INLET_MSGS,
  OUTLET_OSC,
  MAX_SENDS,
  PAUSE_MS,
  METER_FLUSH_MS,
  TYPE_TRACK,
  TYPE_RETURN,
  DEFAULT_COLOR,
} from './consts'
import {
  handleExclusiveSolo,
  handleExclusiveArm,
  toggleXFade as toggleXFadeShared,
  enableArm,
  disableArm,
  disableTrackInput,
  getRecordStatus,
} from './mixerUtils'

autowatch = 1
inlets = 2
outlets = 1

const log = logFactory(config)

const INLET_PAGE = 1

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setinletassist(INLET_PAGE, 'Page change messages')
setoutletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrackInfo = {
  id: number
  type: number
  name: string
  color: string
  path: string
  parentId: number
}

type StripObservers = {
  trackId: number
  trackApi: LiveAPI
  colorApi: LiveAPI
  muteApi: LiveAPI
  soloApi: LiveAPI
  armApi: LiveAPI
  meterLeftApi: LiveAPI
  meterRightApi: LiveAPI
  meterLevelApi: LiveAPI
  mixerApi: LiveAPI
  volApi: LiveAPI
  volAutoApi: LiveAPI
  panApi: LiveAPI
  sendApis: LiveAPI[]
  pause: Record<string, PauseState>
  stripIndex: number
  canBeArmed: boolean
  hasOutput: boolean
  isMain: boolean
  initialized: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Module-level scratchpads for one-off lookups (reuse via .path is fastest)
// Lazily initialized to avoid "Live API is not initialized" at load time
let scratchApi: LiveAPI = null
function ensureApis() {
  if (!scratchApi) scratchApi = new LiveAPI(noFn, 'live_set')
}

const DEFAULT_VISIBLE_COUNT = 18
const MAX_STRIP_IDX = 128

// Pre-computed OSC address strings for mixer strips
const SA_VOL: string[] = []
const SA_VOLSTR: string[] = []
const SA_VOLAUTO: string[] = []
const SA_PAN: string[] = []
const SA_PANSTR: string[] = []
const SA_MUTE: string[] = []
const SA_SOLO: string[] = []
const SA_ARM: string[] = []
const SA_INPUT: string[] = []
const SA_HASOUTPUT: string[] = []
const SA_XFADEA: string[] = []
const SA_XFADEB: string[] = []
const SA_XFADEASSIGN: string[] = []
const SA_NAME: string[] = []
const SA_COLOR: string[] = []
const SA_TYPE: string[] = []
const SA_SEND: string[][] = []
for (let _i = 0; _i < MAX_STRIP_IDX; _i++) {
  const _p = '/mixer/' + _i + '/'
  SA_VOL[_i] = _p + 'vol'
  SA_VOLSTR[_i] = _p + 'volStr'
  SA_VOLAUTO[_i] = _p + 'volAuto'
  SA_PAN[_i] = _p + 'pan'
  SA_PANSTR[_i] = _p + 'panStr'
  SA_MUTE[_i] = _p + 'mute'
  SA_SOLO[_i] = _p + 'solo'
  SA_ARM[_i] = _p + 'recordArm'
  SA_INPUT[_i] = _p + 'inputEnabled'
  SA_HASOUTPUT[_i] = _p + 'hasOutput'
  SA_XFADEA[_i] = _p + 'xFadeA'
  SA_XFADEB[_i] = _p + 'xFadeB'
  SA_XFADEASSIGN[_i] = _p + 'xFadeAssign'
  SA_NAME[_i] = _p + 'name'
  SA_COLOR[_i] = _p + 'color'
  SA_TYPE[_i] = _p + 'type'
  SA_SEND[_i] = []
  for (let _j = 0; _j < MAX_SENDS; _j++) {
    SA_SEND[_i][_j] = _p + 'send' + (_j + 1)
  }
}
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let trackList: TrackInfo[] = []
let leftIndex = -1
let visibleCount = 0

// Observers keyed by track ID — accumulate over session, never torn down on scroll
let observersByTrackId: Record<number, StripObservers> = {}

// Track IDs for which sendStripState has been called in the current visible window.
// Rebuilt each applyWindow so strips leaving the visible range get state re-sent
// if they scroll back in (observer callbacks don't fire while !isVisible).
let visibleStateSet: Record<number, boolean> = {}

let metersEnabled = false
let onMixerPage = false
let meterBuffer: number[] = []
let meterDirty = false
let meterFlushTask: MaxTask = null
let mixerViewTask: MaxTask = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isVisible(strip: StripObservers): boolean {
  return strip.stripIndex >= leftIndex && strip.stripIndex < leftIndex + visibleCount
}


function stripPause(strip: StripObservers, key: string) {
  if (!strip.pause[key]) {
    strip.pause[key] = { paused: false, task: null }
  }
  pauseUnpause(strip.pause[key], PAUSE_MS)
}


function sendSoloCount() {
  ensureApis()
  let count = 0
  scratchApi.path = 'live_set'
  const tracks = cleanArr(scratchApi.get('tracks'))
  const returns = cleanArr(scratchApi.get('return_tracks'))
  const all = tracks.concat(returns)
  for (let i = 0; i < all.length; i++) {
    scratchApi.id = all[i]
    if (parseInt(scratchApi.get('solo').toString())) {
      count++
    }
  }
  osc('/mixer/soloCount', count)
}

function sendReturnTrackColors() {
  const returns = trackList.filter(function (t) {
    return t.type === TYPE_RETURN
  })
  const colors: string[] = []
  for (let i = 0; i < MAX_SENDS; i++) {
    if (returns[i]) {
      colors.push('#' + returns[i].color)
    } else {
      colors.push('#' + DEFAULT_COLOR)
    }
  }
  outlet(OUTLET_OSC, ['/mixer/returnTrackColors', JSON.stringify(colors)])
}

// ---------------------------------------------------------------------------
// Meter Observers
// ---------------------------------------------------------------------------

function createMeterObservers(strip: StripObservers, trackPath: string) {
  strip.meterLeftApi = new LiveAPI(function (args: any[]) {
    if (args[0] === 'output_meter_left') {
      const v = meterVal(args[1])
      const off = strip.stripIndex * 3
      if (v !== meterBuffer[off]) {
        meterBuffer[off] = v
        meterDirty = true
      }
    }
  }, trackPath)
  strip.meterLeftApi.property = 'output_meter_left'

  strip.meterRightApi = new LiveAPI(function (args: any[]) {
    if (args[0] === 'output_meter_right') {
      const v = meterVal(args[1])
      const off = strip.stripIndex * 3 + 1
      if (v !== meterBuffer[off]) {
        meterBuffer[off] = v
        meterDirty = true
      }
    }
  }, trackPath)
  strip.meterRightApi.property = 'output_meter_right'

  strip.meterLevelApi = new LiveAPI(function (args: any[]) {
    if (args[0] === 'output_meter_level') {
      const v = meterVal(args[1])
      const off = strip.stripIndex * 3 + 2
      if (v !== meterBuffer[off]) {
        meterBuffer[off] = v
        meterDirty = true
      }
    }
  }, trackPath)
  strip.meterLevelApi.property = 'output_meter_level'
}

function teardownMeterObservers(strip: StripObservers) {
  if (strip.meterLeftApi) {
    detach(strip.meterLeftApi)
    strip.meterLeftApi = null
  }
  if (strip.meterRightApi) {
    detach(strip.meterRightApi)
    strip.meterRightApi = null
  }
  if (strip.meterLevelApi) {
    detach(strip.meterLevelApi)
    strip.meterLevelApi = null
  }
  // Zero out this strip's slots in the buffer
  const baseOffset = strip.stripIndex * 3
  if (baseOffset + 2 < meterBuffer.length) {
    meterBuffer[baseOffset] = 0
    meterBuffer[baseOffset + 1] = 0
    meterBuffer[baseOffset + 2] = 0
  }
}

// ---------------------------------------------------------------------------
// Meter Flush Timer
// ---------------------------------------------------------------------------

function flushMeters() {
  if (!meterDirty) return
  meterDirty = false
  outlet(OUTLET_OSC, ['/mixer/meters', numArrToJson(meterBuffer)])
}

function startMeterFlush() {
  if (meterFlushTask) return
  meterFlushTask = new Task(function () {
    flushMeters()
    meterFlushTask.schedule(METER_FLUSH_MS)
  }) as MaxTask
  meterFlushTask.schedule(METER_FLUSH_MS)
}

function stopMeterFlush() {
  if (!meterFlushTask) return
  meterFlushTask.cancel()
  meterFlushTask.freepeer()
  meterFlushTask = null
}

// ---------------------------------------------------------------------------
// Observer Creation / Teardown
// ---------------------------------------------------------------------------

function createStripObservers(
  trackId: number,
  stripIdx: number
): StripObservers {
  const strip: StripObservers = {
    trackId: trackId,
    trackApi: null,
    colorApi: null,
    muteApi: null,
    soloApi: null,
    armApi: null,
    meterLeftApi: null,
    meterRightApi: null,
    meterLevelApi: null,
    mixerApi: null,
    volApi: null,
    volAutoApi: null,
    panApi: null,
    sendApis: [],
    pause: {},
    stripIndex: stripIdx,
    canBeArmed: false,
    hasOutput: false,
    isMain: false,
    initialized: false,
  }

  // Get the track's path so we can build full paths for children
  scratchApi.id = trackId
  const trackPath = scratchApi.unquotedpath
  const mixerPath = trackPath + ' mixer_device'
  strip.isMain = trackPath.indexOf('master_track') > -1

  // Color API — separate observer for track color changes
  strip.colorApi = new LiveAPI(function (args: any[]) {
    if (args[0] === 'color') {
      const newColor = colorToString(args[1].toString())
      for (let j = 0; j < trackList.length; j++) {
        if (trackList[j].id === strip.trackId) {
          trackList[j].color = newColor
          break
        }
      }
    }
  }, trackPath)
  strip.colorApi.property = 'color'

  // Track API — used for querying properties (no observer)
  strip.trackApi = new LiveAPI(noFn, trackPath)

  // Mute, solo, arm — separate observers (master track lacks these)
  if (!strip.isMain) {
    strip.muteApi = new LiveAPI(function (args: any[]) {
      if (args[0] === 'mute' && strip.initialized && isVisible(strip)) {
        osc(SA_MUTE[strip.stripIndex], parseInt(args[1].toString()))
      }
    }, trackPath)
    strip.muteApi.property = 'mute'

    strip.soloApi = new LiveAPI(function (args: any[]) {
      if (args[0] === 'solo' && strip.initialized && isVisible(strip)) {
        osc(SA_SOLO[strip.stripIndex], parseInt(args[1].toString()))
        sendSoloCount()
      }
    }, trackPath)
    strip.soloApi.property = 'solo'
  }

  strip.canBeArmed =
    !strip.isMain && !!parseInt(strip.trackApi.get('can_be_armed').toString())
  if (strip.canBeArmed) {
    strip.armApi = new LiveAPI(function (args: any[]) {
      if (args[0] === 'arm' && strip.initialized && isVisible(strip)) {
        osc(SA_ARM[strip.stripIndex], parseInt(args[1].toString()))
      }
    }, trackPath)
    strip.armApi.property = 'arm'
  }

  // Check has_audio_output
  const trackInfo = strip.trackApi.info.toString()
  strip.hasOutput =
    trackInfo.indexOf('has_audio_output') > -1
      ? !!parseInt(strip.trackApi.get('has_audio_output').toString())
      : false

  // Meter observers are managed separately by applyWindow (visible tracks only)

  // Mixer API — observe crossfade_assign (master track lacks this)
  strip.mixerApi = new LiveAPI(function (args: any[]) {
    if (args[0] === 'crossfade_assign' && strip.initialized && isVisible(strip)) {
      const xVal = parseInt(args[1].toString())
      osc(SA_XFADEA[strip.stripIndex], xVal === 0 ? 1 : 0)
      osc(SA_XFADEB[strip.stripIndex], xVal === 2 ? 1 : 0)
    }
  }, mixerPath)
  if (!strip.isMain) {
    strip.mixerApi.property = 'crossfade_assign'
  }

  // Volume observer
  //log('vol observer path: ' + mixerPath + ' volume' + ' isMain=' + strip.isMain)
  strip.volApi = new LiveAPI(function (args: any[]) {
    if (args[0] !== 'value' || !strip.initialized || !isVisible(strip)) return
    if (!strip.pause['vol'] || !strip.pause['vol'].paused) {
      const fVal = parseFloat(args[1]) || 0
      osc(SA_VOL[strip.stripIndex], fVal)
      const str = strip.volApi.call('str_for_value', fixFloat(fVal)) as any
      osc(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '')
    }
  }, mixerPath + ' volume')
  strip.volApi.property = 'value'

  // Volume automation state observer
  strip.volAutoApi = new LiveAPI(function (args: any[]) {
    if (args[0] === 'automation_state' && strip.initialized && isVisible(strip)) {
      osc(SA_VOLAUTO[strip.stripIndex], parseInt(args[1].toString()))
    }
  }, mixerPath + ' volume')
  strip.volAutoApi.property = 'automation_state'

  // Pan observer
  strip.panApi = new LiveAPI(function (args: any[]) {
    if (args[0] !== 'value' || !strip.initialized || !isVisible(strip)) return
    if (!strip.pause['pan'] || !strip.pause['pan'].paused) {
      const fVal = parseFloat(args[1]) || 0
      osc(SA_PAN[strip.stripIndex], fVal)
      const str = strip.panApi.call('str_for_value', fixFloat(fVal)) as any
      osc(SA_PANSTR[strip.stripIndex], str ? str.toString() : '')
    }
  }, mixerPath + ' panning')
  strip.panApi.property = 'value'

  // Send observers
  scratchApi.path = mixerPath
  const sendIds = cleanArr(scratchApi.get('sends'))
  const numSends = Math.min(sendIds.length, MAX_SENDS)

  for (let i = 0; i < numSends; i++) {
    const sendIdx = i
    const sendApi = new LiveAPI(function (args: IdObserverArg) {
      if (args[0] !== 'value' || !strip.initialized || !isVisible(strip)) return
      if (!strip.pause['send'] || !strip.pause['send'].paused) {
        osc(SA_SEND[strip.stripIndex][sendIdx], args[1] || 0)
      }
    }, 'id ' + sendIds[i])
    sendApi.property = 'value'
    strip.sendApis.push(sendApi)
  }

  strip.initialized = true
  return strip
}

function teardownStripObservers(strip: StripObservers) {
  detach(strip.colorApi)
  detach(strip.muteApi)
  detach(strip.soloApi)
  detach(strip.armApi)
  teardownMeterObservers(strip)
  detach(strip.mixerApi)
  detach(strip.volApi)
  detach(strip.volAutoApi)
  detach(strip.panApi)
  for (let i = 0; i < strip.sendApis.length; i++) {
    detach(strip.sendApis[i])
  }
  detach(strip.trackApi)
  // Cancel all pause tasks
  for (const key in strip.pause) {
    if (strip.pause[key].task) {
      strip.pause[key].task.cancel()
      strip.pause[key].task.freepeer()
    }
  }
}

function teardownAll() {
  stopMeterFlush()
  for (const trackIdStr in observersByTrackId) {
    teardownStripObservers(observersByTrackId[trackIdStr])
  }
  observersByTrackId = {}
  visibleStateSet = {}
  trackList = []
  meterBuffer = []
}

// ---------------------------------------------------------------------------
// Send Strip State
// ---------------------------------------------------------------------------

function sendStripState(n: number, strip: StripObservers) {
  let info: TrackInfo = null
  for (let i = 0; i < trackList.length; i++) {
    if (trackList[i].id === strip.trackId) {
      info = trackList[i]
      break
    }
  }

  osc(SA_NAME[n], info ? info.name : '')
  osc(SA_COLOR[n], info ? info.color : DEFAULT_COLOR)
  osc(SA_TYPE[n], info ? info.type : TYPE_TRACK)

  const volVal = parseFloat(strip.volApi.get('value').toString()) || 0
  const volStr = strip.volApi.call('str_for_value', fixFloat(volVal)) as any
  osc(SA_VOL[n], volVal)
  osc(SA_VOLSTR[n], volStr ? volStr.toString() : '')
  osc(SA_VOLAUTO[n], parseInt(strip.volAutoApi.get('automation_state').toString()))

  const panVal = parseFloat(strip.panApi.get('value').toString()) || 0
  const panStr = strip.panApi.call('str_for_value', fixFloat(panVal)) as any
  osc(SA_PAN[n], panVal)
  osc(SA_PANSTR[n], panStr ? panStr.toString() : '')

  osc(SA_MUTE[n], !strip.isMain ? parseInt(strip.trackApi.get('mute').toString()) : 0)
  osc(SA_SOLO[n], !strip.isMain ? parseInt(strip.trackApi.get('solo').toString()) : 0)
  osc(SA_ARM[n], strip.canBeArmed ? parseInt(strip.trackApi.get('arm').toString()) : 0)

  const recordStatus = getRecordStatus(strip.trackApi)
  osc(SA_INPUT[n], strip.canBeArmed && recordStatus.inputEnabled ? 1 : 0)
  osc(SA_HASOUTPUT[n], strip.hasOutput ? 1 : 0)

  if (!strip.isMain) {
    const xFadeAssign = parseInt(strip.mixerApi.get('crossfade_assign').toString())
    osc(SA_XFADEA[n], xFadeAssign === 0 ? 1 : 0)
    osc(SA_XFADEB[n], xFadeAssign === 2 ? 1 : 0)
  }

  for (let i = 0; i < strip.sendApis.length; i++) {
    osc(SA_SEND[n][i], parseFloat(strip.sendApis[i].get('value').toString()) || 0)
  }
}

// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------

function applyWindow() {
  if (leftIndex < 0 || visibleCount <= 0) {
    return
  }

  const visRight = Math.min(leftIndex + visibleCount, trackList.length)

  // Resize meter buffer if track count changed
  const requiredLen = trackList.length * 3
  if (meterBuffer.length !== requiredLen) {
    const wasRunning = !!meterFlushTask
    if (wasRunning) stopMeterFlush()
    const newBuf: number[] = []
    for (let i = 0; i < requiredLen; i++) newBuf.push(0)
    meterBuffer = newBuf
    if (wasRunning && metersEnabled) startMeterFlush()
  }

  // Create observers for visible tracks that don't have them yet
  for (let i = leftIndex; i < visRight; i++) {
    const tid = trackList[i].id
    if (!observersByTrackId[tid]) {
      observersByTrackId[tid] = createStripObservers(tid, i)
    }
  }

  // Update strip indices for all visible observers (positions may have shifted)
  for (let i = leftIndex; i < visRight; i++) {
    const tid = trackList[i].id
    if (observersByTrackId[tid]) {
      observersByTrackId[tid].stripIndex = i
    }
  }

  // Manage meter observers for visible tracks only
  if (metersEnabled) {
    // Teardown meters on non-visible tracks that have them
    for (const tidStr in observersByTrackId) {
      const strip = observersByTrackId[tidStr]
      if (!isVisible(strip) && strip.meterLeftApi) {
        teardownMeterObservers(strip)
      }
    }
    // Create meters on visible tracks that don't have them
    for (let i = leftIndex; i < visRight; i++) {
      const tid = trackList[i].id
      const strip = observersByTrackId[tid]
      if (strip && strip.hasOutput && !strip.meterLeftApi) {
        createMeterObservers(strip, strip.trackApi.unquotedpath)
      }
    }
    if (onMixerPage && !meterFlushTask) startMeterFlush()
  }

  // Send state for strips that are newly visible (weren't in the previous visible set).
  // This catches both newly created strips and existing strips scrolling into view.
  const newVisibleSet: Record<number, boolean> = {}
  for (let i = leftIndex; i < visRight; i++) {
    const tid = trackList[i].id
    const strip = observersByTrackId[tid]
    if (strip) {
      newVisibleSet[tid] = true
      if (!visibleStateSet[tid]) {
        sendStripState(i, strip)
      }
    }
  }
  visibleStateSet = newVisibleSet
  sendSoloCount()
}

// ---------------------------------------------------------------------------
// Refresh — called on /btnRefresh to invalidate stale observers
// ---------------------------------------------------------------------------

function mixerRefresh() {
  teardownAll()
  sendMetersState()
  osc('/sendMixerView', 1)
}

// ---------------------------------------------------------------------------
// Incoming: mixerView
// ---------------------------------------------------------------------------

function setupWindow(left: number, count: number) {
  ensureApis()
  leftIndex = left
  visibleCount = count
  applyWindow()
}

function mixerView() {
  const parsed = JSON.parse(arguments[0].toString())
  const left = parseInt(parsed[0].toString())
  const count = parseInt(parsed[1].toString())

  if (count === 0) {
    if (mixerViewTask) {
      mixerViewTask.cancel()
      mixerViewTask.freepeer()
      mixerViewTask = null
    }
    // Don't teardown observers — keep them alive so sliders work immediately
    // when the user returns to the mixer page. Only stop meters.
    stopMeterFlush()
    return
  }

  if (mixerViewTask) {
    mixerViewTask.cancel()
    mixerViewTask.freepeer()
  }
  mixerViewTask = new Task(function () {
    setupWindow(left, count)
  }) as MaxTask
  mixerViewTask.schedule(250)
}

function mixerMeters(val: number) {
  const enabled = !!parseInt(val.toString())
  if (enabled === metersEnabled) return
  metersEnabled = enabled
  saveInstanceSetting('metersEnabled', metersEnabled ? 1 : 0)
  sendMetersState()

  if (metersEnabled) {
    // Only create meter observers for visible tracks, not buffer
    const visRight = Math.min(leftIndex + visibleCount, trackList.length)
    for (let i = leftIndex; i < visRight; i++) {
      const tid = trackList[i].id
      const strip = observersByTrackId[tid]
      if (strip && strip.hasOutput && !strip.meterLeftApi) {
        createMeterObservers(strip, strip.trackApi.unquotedpath)
      }
    }
    if (onMixerPage && visibleCount > 0) startMeterFlush()
  } else {
    stopMeterFlush()
    for (const trackIdStr in observersByTrackId) {
      teardownMeterObservers(observersByTrackId[trackIdStr])
    }
  }
}

var sidebarMixerObj: any = null

function getSidebarMixer() {
  if (sidebarMixerObj) return sidebarMixerObj
  patcher.apply(function (obj: any) {
    if (obj.getattr && obj.getattr('filename') === 'k4-sidebarMixer.js') {
      sidebarMixerObj = obj
      return false
    }
    return true
  })
  return sidebarMixerObj
}

function sendMetersState() {
  osc('/mixerMeters', metersEnabled ? 1 : 0)
  var chk = patcher.getnamed('chkMeters')
  if (chk) chk.message('set', metersEnabled ? 1 : 0)
  var sb = getSidebarMixer()
  if (sb) sb.message('sidebarMeters', metersEnabled ? 1 : 0)
}

function page() {
  const pageName = arguments[0].toString()
  const wasMixerPage = onMixerPage
  onMixerPage = pageName === 'mixer' || pageName === 'session'

  if (onMixerPage && !wasMixerPage) {
    if (metersEnabled && visibleCount > 0) startMeterFlush()
  } else if (!onMixerPage && wasMixerPage) {
    stopMeterFlush()
  }
}

function setDictPrefix(prefix: any) {
  _setDictPrefix(prefix)
}

function init() {
  ensureApis()
  metersEnabled = !!loadInstanceSetting('metersEnabled')
  sendMetersState()
  setupWindow(0, DEFAULT_VISIBLE_COUNT)
}

// ---------------------------------------------------------------------------
// Helpers: resolve strip from incoming index
// ---------------------------------------------------------------------------

function getStrip(stripIdx: number): StripObservers {
  const rel = stripIdx - leftIndex
  if (rel < 0 || rel >= visibleCount) return null
  if (stripIdx >= trackList.length) return null
  const tid = trackList[stripIdx].id
  return observersByTrackId[tid] || null
}

// ---------------------------------------------------------------------------
// Incoming Commands (App -> Device)
// ---------------------------------------------------------------------------

function vol(stripIdx: number, val: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  stripPause(strip, 'vol')
  const fVal = parseFloat(val.toString())
  strip.volApi.set('value', fVal)
  const str = strip.volApi.call('str_for_value', fixFloat(fVal)) as any
  osc(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '')
}

function pan(stripIdx: number, val: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  stripPause(strip, 'pan')
  const fVal = parseFloat(val.toString())
  strip.panApi.set('value', fVal)
  const str = strip.panApi.call('str_for_value', fixFloat(fVal)) as any
  osc(SA_PANSTR[strip.stripIndex], str ? str.toString() : '')
}

function volDefault(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const defVal = parseFloat(strip.volApi.get('default_value').toString())
  strip.volApi.set('value', defVal)
  osc(SA_VOL[strip.stripIndex], defVal)
  const str = strip.volApi.call('str_for_value', fixFloat(defVal)) as any
  osc(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '')
}

function panDefault(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const defVal = parseFloat(strip.panApi.get('default_value').toString())
  strip.panApi.set('value', defVal)
  const str = strip.panApi.call('str_for_value', fixFloat(defVal)) as any
  osc(SA_PANSTR[strip.stripIndex], str ? str.toString() : '')
}

// Send handlers — send1 through send12
function handleSend(stripIdx: number, sendNum: number, val: number) {
  if (val === undefined) return
  const strip = getStrip(stripIdx)
  if (!strip) return
  const idx = sendNum - 1
  if (idx < 0 || idx >= strip.sendApis.length) return
  stripPause(strip, 'send')
  strip.sendApis[idx].set('value', parseFloat(val.toString()))
}

function handleSendDefault(stripIdx: number, sendNum: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const idx = sendNum - 1
  if (idx < 0 || idx >= strip.sendApis.length) return
  strip.sendApis[idx].set(
    'value',
    parseFloat(strip.sendApis[idx].get('default_value').toString())
  )
}

function send1(stripIdx: number, val: number) {
  handleSend(stripIdx, 1, val)
}
function send2(stripIdx: number, val: number) {
  handleSend(stripIdx, 2, val)
}
function send3(stripIdx: number, val: number) {
  handleSend(stripIdx, 3, val)
}
function send4(stripIdx: number, val: number) {
  handleSend(stripIdx, 4, val)
}
function send5(stripIdx: number, val: number) {
  handleSend(stripIdx, 5, val)
}
function send6(stripIdx: number, val: number) {
  handleSend(stripIdx, 6, val)
}
function send7(stripIdx: number, val: number) {
  handleSend(stripIdx, 7, val)
}
function send8(stripIdx: number, val: number) {
  handleSend(stripIdx, 8, val)
}
function send9(stripIdx: number, val: number) {
  handleSend(stripIdx, 9, val)
}
function send10(stripIdx: number, val: number) {
  handleSend(stripIdx, 10, val)
}
function send11(stripIdx: number, val: number) {
  handleSend(stripIdx, 11, val)
}
function send12(stripIdx: number, val: number) {
  handleSend(stripIdx, 12, val)
}

function sendDefault1(stripIdx: number) {
  handleSendDefault(stripIdx, 1)
}
function sendDefault2(stripIdx: number) {
  handleSendDefault(stripIdx, 2)
}
function sendDefault3(stripIdx: number) {
  handleSendDefault(stripIdx, 3)
}
function sendDefault4(stripIdx: number) {
  handleSendDefault(stripIdx, 4)
}
function sendDefault5(stripIdx: number) {
  handleSendDefault(stripIdx, 5)
}
function sendDefault6(stripIdx: number) {
  handleSendDefault(stripIdx, 6)
}
function sendDefault7(stripIdx: number) {
  handleSendDefault(stripIdx, 7)
}
function sendDefault8(stripIdx: number) {
  handleSendDefault(stripIdx, 8)
}
function sendDefault9(stripIdx: number) {
  handleSendDefault(stripIdx, 9)
}
function sendDefault10(stripIdx: number) {
  handleSendDefault(stripIdx, 10)
}
function sendDefault11(stripIdx: number) {
  handleSendDefault(stripIdx, 11)
}
function sendDefault12(stripIdx: number) {
  handleSendDefault(stripIdx, 12)
}

function toggleMute(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const curr = parseInt(strip.trackApi.get('mute').toString())
  const newState = curr ? 0 : 1
  strip.trackApi.set('mute', newState)
  osc(SA_MUTE[strip.stripIndex], newState)
}

function toggleSolo(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const curr = parseInt(strip.trackApi.get('solo').toString())
  const newState = curr ? 0 : 1

  if (newState) {
    handleExclusiveSolo(strip.trackId, scratchApi)
  }
  strip.trackApi.set('solo', newState)
  osc(SA_SOLO[strip.stripIndex], newState)
  sendSoloCount()
}

function enableRecord(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip || !strip.canBeArmed) return
  enableArm(strip.trackApi, scratchApi)
  sendRecordStatusForStrip(strip)
}

function disableRecord(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip || !strip.canBeArmed) return
  disableArm(strip.trackApi)
  sendRecordStatusForStrip(strip)
}

function disableInput(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  disableTrackInput(strip.trackApi)
  sendRecordStatusForStrip(strip)
}

function sendRecordStatusForStrip(strip: StripObservers) {
  const n = strip.stripIndex
  const status = getRecordStatus(strip.trackApi)
  osc(SA_ARM[n], strip.canBeArmed ? status.armStatus : 0)
  osc(SA_INPUT[n], status.inputEnabled ? 1 : 0)
}

function toggleXFadeA(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  toggleXFadeShared(strip.mixerApi, 0)
}

function toggleXFadeB(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  toggleXFadeShared(strip.mixerApi, 2)
}

// ---------------------------------------------------------------------------
// anything() dispatcher — receives (subCmd, stripIdx, val) from router
// ---------------------------------------------------------------------------

// anything() dispatcher — Max calls this with messagename = subCmd,
// arguments = [stripIdx, val] (from router outlet)
function anything() {
  const subCmd = messagename
  const stripIdx = parseInt(arguments[0].toString())
  const val = arguments[1]

  if (subCmd === 'vol') vol(stripIdx, val)
  else if (subCmd === 'pan') pan(stripIdx, val)
  else if (subCmd === 'volDefault') volDefault(stripIdx)
  else if (subCmd === 'panDefault') panDefault(stripIdx)
  else if (subCmd === 'toggleMute') toggleMute(stripIdx)
  else if (subCmd === 'toggleSolo') toggleSolo(stripIdx)
  else if (subCmd === 'enableRecord') enableRecord(stripIdx)
  else if (subCmd === 'disableRecord') disableRecord(stripIdx)
  else if (subCmd === 'disableInput') disableInput(stripIdx)
  else if (subCmd === 'toggleXFadeA') toggleXFadeA(stripIdx)
  else if (subCmd === 'toggleXFadeB') toggleXFadeB(stripIdx)
  else if (subCmd === 'send1') send1(stripIdx, val)
  else if (subCmd === 'send2') send2(stripIdx, val)
  else if (subCmd === 'send3') send3(stripIdx, val)
  else if (subCmd === 'send4') send4(stripIdx, val)
  else if (subCmd === 'send5') send5(stripIdx, val)
  else if (subCmd === 'send6') send6(stripIdx, val)
  else if (subCmd === 'send7') send7(stripIdx, val)
  else if (subCmd === 'send8') send8(stripIdx, val)
  else if (subCmd === 'send9') send9(stripIdx, val)
  else if (subCmd === 'send10') send10(stripIdx, val)
  else if (subCmd === 'send11') send11(stripIdx, val)
  else if (subCmd === 'send12') send12(stripIdx, val)
  else if (subCmd === 'sendDefault1') sendDefault1(stripIdx)
  else if (subCmd === 'sendDefault2') sendDefault2(stripIdx)
  else if (subCmd === 'sendDefault3') sendDefault3(stripIdx)
  else if (subCmd === 'sendDefault4') sendDefault4(stripIdx)
  else if (subCmd === 'sendDefault5') sendDefault5(stripIdx)
  else if (subCmd === 'sendDefault6') sendDefault6(stripIdx)
  else if (subCmd === 'sendDefault7') sendDefault7(stripIdx)
  else if (subCmd === 'sendDefault8') sendDefault8(stripIdx)
  else if (subCmd === 'sendDefault9') sendDefault9(stripIdx)
  else if (subCmd === 'sendDefault10') sendDefault10(stripIdx)
  else if (subCmd === 'sendDefault11') sendDefault11(stripIdx)
  else if (subCmd === 'sendDefault12') sendDefault12(stripIdx)
}

function visibleTracks() {
  const raw = getVisibleTracks()
  if (!raw) return
  trackList = JSON.parse(raw.toString())
  // Clamp leftIndex if track list shrank
  if (leftIndex >= trackList.length) {
    leftIndex = Math.max(0, trackList.length - visibleCount)
  }
  sendReturnTrackColors()
  if (visibleCount > 0) {
    applyWindow()
  }
}

log('reloaded k4-multiMixer')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
