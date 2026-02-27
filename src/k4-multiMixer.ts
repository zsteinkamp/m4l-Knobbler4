import {
  cleanArr,
  colorToString,
  detach,
  loadSetting,
  numArrToJson,
  saveSetting,
  logFactory,
  meterVal,
  osc,
  pauseUnpause,
  PauseState,
  truncate,
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
  TYPE_MAIN,
  TYPE_RETURN,
  TYPE_GROUP,
  MAX_NAME_LEN,
  DEFAULT_COLOR,
} from './consts'
import {
  getTrackInputStatus,
  disableTrackInput,
  enableTrackInput,
} from './toggleInput'

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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Module-level scratchpads for one-off lookups (reuse via .path is fastest)
// Lazily initialized to avoid "Live API is not initialized" at load time
let scratchApi: LiveAPI = null
let trackListApi: LiveAPI = null
function ensureApis() {
  if (!scratchApi) scratchApi = new LiveAPI(noFn, 'live_set')
  if (!trackListApi) trackListApi = new LiveAPI(noFn, 'live_set')
}

const CHUNK_MAX_BYTES = 1024
const DEFAULT_VISIBLE_COUNT = 18
const MAX_STRIP_IDX = 128
const OBSERVER_BUFFER = 2

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

// Observers keyed by track ID — survives window slides if the track stays visible
let observersByTrackId: Record<number, StripObservers> = {}

// Observer slots: track IDs in the wider observer window (visible + buffer)
let observerSlots: number[] = []

let metersEnabled = false
let onMixerPage = false
let meterBuffer: number[] = []
let meterDirty = false
let meterFlushTask: MaxTask = null
let mixerViewTask: MaxTask = null
let rebuildTrackListTask: MaxTask = null

// Track list watchers
let visibleTracksWatcher: LiveAPI = null
let returnTracksWatcher: LiveAPI = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isVisible(strip: StripObservers): boolean {
  return strip.stripIndex >= leftIndex && strip.stripIndex < leftIndex + visibleCount
}

function clientHasCapability(cap: string): boolean {
  const caps = loadSetting('clientCapabilities')
  if (!caps) {
    return false
  }
  return (' ' + caps.toString() + ' ').indexOf(' ' + cap + ' ') !== -1
}

function sendChunkedData(prefix: string, items: any[]) {
  const chunked = clientHasCapability('cNav')
  if (chunked) {
    outlet(OUTLET_OSC, [prefix + '/start', items.length])
    let chunkParts: string[] = []
    let chunkSize = 2
    for (let i = 0; i < items.length; i++) {
      const itemJson = JSON.stringify(items[i])
      const added = (chunkParts.length > 0 ? 1 : 0) + itemJson.length
      if (chunkParts.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
        outlet(OUTLET_OSC, [prefix + '/chunk', '[' + chunkParts.join(',') + ']'])
        chunkParts = []
        chunkSize = 2
      }
      chunkParts.push(itemJson)
      chunkSize += added
    }
    if (chunkParts.length > 0) {
      outlet(OUTLET_OSC, [prefix + '/chunk', '[' + chunkParts.join(',') + ']'])
    }
    outlet(OUTLET_OSC, [prefix + '/end'])
  }
  if (!chunked) {
    outlet(OUTLET_OSC, [prefix, JSON.stringify(items)])
  }
}

function stripPause(strip: StripObservers, key: string) {
  if (!strip.pause[key]) {
    strip.pause[key] = { paused: false, task: null }
  }
  pauseUnpause(strip.pause[key], PAUSE_MS)
}

// ---------------------------------------------------------------------------
// Track List Builder
// ---------------------------------------------------------------------------

function buildTrackList(): TrackInfo[] {
  const ret: TrackInfo[] = []

  // visible tracks only (respects group folding)
  trackListApi.path = 'live_set'
  const trackIds = cleanArr(trackListApi.get('visible_tracks'))
  for (const id of trackIds) {
    trackListApi.id = id
    const isFoldable = parseInt(trackListApi.get('is_foldable').toString())
    const parentId = cleanArr(trackListApi.get('group_track'))[0] || 0
    ret.push({
      id: id,
      type: isFoldable ? TYPE_GROUP : TYPE_TRACK,
      name: truncate(trackListApi.get('name').toString(), MAX_NAME_LEN),
      color: colorToString(trackListApi.get('color').toString()),
      parentId: parentId,
    })
  }

  // return tracks (always visible)
  trackListApi.path = 'live_set'
  const returnIds = cleanArr(trackListApi.get('return_tracks'))
  for (const id of returnIds) {
    trackListApi.id = id
    ret.push({
      id: id,
      type: TYPE_RETURN,
      name: truncate(trackListApi.get('name').toString(), MAX_NAME_LEN),
      color: colorToString(trackListApi.get('color').toString()),
      parentId: 0,
    })
  }

  // master track
  trackListApi.path = 'live_set'
  const mainId = cleanArr(trackListApi.get('master_track'))[0]
  trackListApi.id = mainId
  ret.push({
    id: mainId,
    type: TYPE_MAIN,
    name: truncate(trackListApi.get('name').toString(), MAX_NAME_LEN),
    color: colorToString(trackListApi.get('color').toString()),
    parentId: 0,
  })

  return ret
}

function sendVisibleTracks() {
  const items = trackList.map(function (t) {
    return [t.type, t.id, t.name, t.color, null, null, t.parentId]
  })
  sendChunkedData('/visibleTracks', items)
}

// ---------------------------------------------------------------------------
// Track List Watchers
// ---------------------------------------------------------------------------

function onVisibleTracksChange(args: any[]) {
  if (args[0] !== 'visible_tracks') {
    return
  }
  if (visibleCount <= 0) {
    return
  }
  trackList = buildTrackList()
  sendVisibleTracks()
  applyWindow()
}

function sendReturnTrackColors() {
  trackListApi.path = 'live_set'
  const returnIds = cleanArr(trackListApi.get('return_tracks'))
  const colors: string[] = []
  for (let i = 0; i < MAX_SENDS; i++) {
    if (returnIds[i]) {
      trackListApi.id = returnIds[i]
      colors.push('#' + colorToString(trackListApi.get('color').toString()))
    } else {
      colors.push('#' + DEFAULT_COLOR)
    }
  }
  outlet(OUTLET_OSC, ['/mixer/returnTrackColors', JSON.stringify(colors)])
}

function onReturnTracksChange(args: any[]) {
  if (args[0] !== 'return_tracks') {
    return
  }
  if (visibleCount <= 0) {
    return
  }
  trackList = buildTrackList()
  sendVisibleTracks()
  sendReturnTrackColors()
  const numReturns = trackList.filter(function (t) { return t.type === TYPE_RETURN }).length
  outlet(OUTLET_OSC, ['/mixer/setNumSends', Math.min(numReturns, MAX_SENDS)])
  applyWindow()
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
  }

  // Get the track's path so we can build full paths for children
  scratchApi.id = trackId
  const trackPath = scratchApi.unquotedpath
  const mixerPath = trackPath + ' mixer_device'
  strip.isMain = trackPath.indexOf('master_track') > -1

  // Color API — separate observer for track color changes
  // Deferred to avoid re-entrancy with scratchApi during createStripObservers
  strip.colorApi = new LiveAPI(function (args: any[]) {
    if (args[0] === 'color') {
      if (!rebuildTrackListTask) {
        rebuildTrackListTask = new Task(function () {
          trackList = buildTrackList()
          sendVisibleTracks()
        }) as MaxTask
      }
      rebuildTrackListTask.schedule(0)
    }
  }, trackPath)
  strip.colorApi.property = 'color'

  // Track API — used for querying properties (no observer)
  strip.trackApi = new LiveAPI(noFn, trackPath)

  // Mute, solo, arm — separate observers (master track lacks these)
  if (!strip.isMain) {
    strip.muteApi = new LiveAPI(function (args: any[]) {
      if (args[0] === 'mute' && isVisible(strip)) {
        osc(SA_MUTE[strip.stripIndex], parseInt(args[1].toString()))
      }
    }, trackPath)
    strip.muteApi.property = 'mute'

    strip.soloApi = new LiveAPI(function (args: any[]) {
      if (args[0] === 'solo' && isVisible(strip)) {
        osc(SA_SOLO[strip.stripIndex], parseInt(args[1].toString()))
      }
    }, trackPath)
    strip.soloApi.property = 'solo'
  }

  strip.canBeArmed =
    !strip.isMain && !!parseInt(strip.trackApi.get('can_be_armed').toString())
  if (strip.canBeArmed) {
    strip.armApi = new LiveAPI(function (args: any[]) {
      if (args[0] === 'arm' && isVisible(strip)) {
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
    if (args[0] === 'crossfade_assign' && isVisible(strip)) {
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
    if (args[0] !== 'value' || !isVisible(strip)) return
    if (!strip.pause['vol'] || !strip.pause['vol'].paused) {
      const fVal = parseFloat(args[1]) || 0
      osc(SA_VOL[strip.stripIndex], fVal)
      const str = strip.volApi.call('str_for_value', fVal) as any
      osc(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '')
    }
  }, mixerPath + ' volume')
  strip.volApi.property = 'value'

  // Volume automation state observer
  strip.volAutoApi = new LiveAPI(function (args: any[]) {
    if (args[0] === 'automation_state' && isVisible(strip)) {
      osc(SA_VOLAUTO[strip.stripIndex], parseInt(args[1].toString()))
    }
  }, mixerPath + ' volume')
  strip.volAutoApi.property = 'automation_state'

  // Pan observer
  strip.panApi = new LiveAPI(function (args: any[]) {
    if (args[0] !== 'value' || !isVisible(strip)) return
    if (!strip.pause['pan'] || !strip.pause['pan'].paused) {
      const fVal = parseFloat(args[1]) || 0
      osc(SA_PAN[strip.stripIndex], fVal)
      const str = strip.panApi.call('str_for_value', fVal) as any
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
      if (args[0] !== 'value' || !isVisible(strip)) return
      if (!strip.pause['send'] || !strip.pause['send'].paused) {
        osc(SA_SEND[strip.stripIndex][sendIdx], args[1] || 0)
      }
    }, 'id ' + sendIds[i])
    sendApi.property = 'value'
    strip.sendApis.push(sendApi)
  }

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
  if (rebuildTrackListTask) {
    rebuildTrackListTask.cancel()
    rebuildTrackListTask.freepeer()
    rebuildTrackListTask = null
  }
  for (const trackIdStr in observersByTrackId) {
    teardownStripObservers(observersByTrackId[trackIdStr])
  }
  observersByTrackId = {}
  observerSlots = []
  trackList = []
  meterBuffer = []
}

// ---------------------------------------------------------------------------
// Send Strip State
// ---------------------------------------------------------------------------

function sendStripState(n: number, strip: StripObservers) {
  // Find the track info
  let info: TrackInfo = null
  for (let i = 0; i < trackList.length; i++) {
    if (trackList[i].id === strip.trackId) {
      info = trackList[i]
      break
    }
  }

  if (info) {
    osc(SA_NAME[n], info.name)
    osc(SA_COLOR[n], info.color)
    osc(SA_TYPE[n], info.type)
  }

  // Volume
  const volVal = strip.volApi.get('value')
  const fVolVal = parseFloat(volVal.toString()) || 0
  osc(SA_VOL[n], fVolVal)
  const volStr = strip.volApi.call('str_for_value', fVolVal) as any
  osc(SA_VOLSTR[n], volStr ? volStr.toString() : '')

  // Volume automation state
  osc(SA_VOLAUTO[n], parseInt(strip.volAutoApi.get('automation_state').toString()))

  // Pan
  const panVal = strip.panApi.get('value')
  const fPanVal = parseFloat(panVal.toString()) || 0
  osc(SA_PAN[n], fPanVal)
  const panStr = strip.panApi.call('str_for_value', fPanVal) as any
  osc(SA_PANSTR[n], panStr ? panStr.toString() : '')

  // Mute / Solo (master track lacks these)
  if (!strip.isMain) {
    osc(SA_MUTE[n], parseInt(strip.trackApi.get('mute').toString()))
    osc(SA_SOLO[n], parseInt(strip.trackApi.get('solo').toString()))
  } else {
    osc(SA_MUTE[n], 0)
    osc(SA_SOLO[n], 0)
  }

  // Arm / Input
  if (strip.canBeArmed) {
    osc(SA_ARM[n], parseInt(strip.trackApi.get('arm').toString()))
    const inputStatus = getTrackInputStatus(strip.trackApi)
    osc(SA_INPUT[n], inputStatus && inputStatus.inputEnabled ? 1 : 0)
  } else {
    osc(SA_ARM[n], 0)
    osc(SA_INPUT[n], 0)
  }

  // Has output
  osc(SA_HASOUTPUT[n], strip.hasOutput ? 1 : 0)

  // Crossfade assign (master track lacks this)
  if (!strip.isMain) {
    osc(
      SA_XFADEASSIGN[n],
      parseInt(strip.mixerApi.get('crossfade_assign').toString())
    )
  } else {
    osc(SA_XFADEASSIGN[n], 0)
  }

  // Sends
  for (let i = 0; i < strip.sendApis.length; i++) {
    const sendVal = strip.sendApis[i].get('value')
    osc(SA_SEND[n][i], parseFloat(sendVal.toString()) || 0)
  }
}

// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------

function applyWindow() {
  if (leftIndex < 0 || visibleCount <= 0) {
    return
  }

  // Compute wider observer window (visible + buffer on each side)
  const obsLeft = Math.max(0, leftIndex - OBSERVER_BUFFER)
  const obsRight = Math.min(trackList.length, leftIndex + visibleCount + OBSERVER_BUFFER)

  // Build new observer slots for the wider window
  const newSlots: number[] = []
  for (let i = obsLeft; i < obsRight; i++) {
    newSlots.push(trackList[i].id)
  }

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

  // Compute keep/remove/add sets
  const oldSet: Record<number, boolean> = {}
  for (let i = 0; i < observerSlots.length; i++) {
    oldSet[observerSlots[i]] = true
  }
  const newSet: Record<number, boolean> = {}
  for (let i = 0; i < newSlots.length; i++) {
    newSet[newSlots[i]] = true
  }

  // Remove: in old but not in new
  for (let i = 0; i < observerSlots.length; i++) {
    const tid = observerSlots[i]
    if (!newSet[tid] && observersByTrackId[tid]) {
      teardownStripObservers(observersByTrackId[tid])
      delete observersByTrackId[tid]
    }
  }

  // Add: in new but not in old
  for (let i = 0; i < newSlots.length; i++) {
    const tid = newSlots[i]
    if (!oldSet[tid]) {
      observersByTrackId[tid] = createStripObservers(tid, obsLeft + i)
    }
  }

  // Update strip indices for all observers (positions may have shifted)
  for (let i = 0; i < newSlots.length; i++) {
    const tid = newSlots[i]
    if (observersByTrackId[tid]) {
      observersByTrackId[tid].stripIndex = obsLeft + i
    }
  }

  observerSlots = newSlots

  // Manage meter observers for visible tracks only (not buffer)
  const visRight = Math.min(leftIndex + visibleCount, trackList.length)
  if (metersEnabled) {
    // Teardown meters on buffer-only tracks
    for (let i = obsLeft; i < leftIndex; i++) {
      const tid = trackList[i].id
      if (observersByTrackId[tid]) teardownMeterObservers(observersByTrackId[tid])
    }
    for (let i = visRight; i < obsRight; i++) {
      const tid = trackList[i].id
      if (observersByTrackId[tid]) teardownMeterObservers(observersByTrackId[tid])
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

  // Send initial state only for newly added strips in the visible range
  for (let i = leftIndex; i < visRight; i++) {
    const tid = trackList[i].id
    if (!oldSet[tid] && observersByTrackId[tid]) {
      sendStripState(i, observersByTrackId[tid])
    }
  }
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
  const firstSetup = trackList.length === 0
  leftIndex = left
  visibleCount = count

  // Set up track list watchers on first activation
  if (!visibleTracksWatcher) {
    visibleTracksWatcher = new LiveAPI(onVisibleTracksChange, 'live_set')
    visibleTracksWatcher.property = 'visible_tracks'
  }
  if (!returnTracksWatcher) {
    returnTracksWatcher = new LiveAPI(onReturnTracksChange, 'live_set')
    returnTracksWatcher.property = 'return_tracks'
  }

  if (firstSetup) {
    scratchApi.path = 'live_set'
    const numSends = Math.min(
      cleanArr(scratchApi.get('return_tracks')).length,
      MAX_SENDS
    )
    //log('SENDING numSends', numSends)
    outlet(OUTLET_OSC, ['/mixer/setNumSends', numSends])
    sendReturnTrackColors()

    trackList = buildTrackList()
    sendVisibleTracks()
  }

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
    teardownAll()
    leftIndex = -1
    visibleCount = 0
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
  saveSetting('metersEnabled', metersEnabled ? 1 : 0)
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
    if (onMixerPage && observerSlots.length > 0) startMeterFlush()
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
  onMixerPage = pageName === 'mixer'

  if (onMixerPage && !wasMixerPage) {
    if (metersEnabled && observerSlots.length > 0) startMeterFlush()
  } else if (!onMixerPage && wasMixerPage) {
    stopMeterFlush()
  }
}

function init() {
  ensureApis()
  metersEnabled = !!loadSetting('metersEnabled')
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
  const str = strip.volApi.call('str_for_value', fVal) as any
  osc(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '')
}

function pan(stripIdx: number, val: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  stripPause(strip, 'pan')
  const fVal = parseFloat(val.toString())
  strip.panApi.set('value', fVal)
  const str = strip.panApi.call('str_for_value', fVal) as any
  osc(SA_PANSTR[strip.stripIndex], str ? str.toString() : '')
}

function volDefault(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const defVal = parseFloat(strip.volApi.get('default_value').toString())
  strip.volApi.set('value', defVal)
  osc(SA_VOL[strip.stripIndex], defVal)
  const str = strip.volApi.call('str_for_value', defVal) as any
  osc(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '')
}

function panDefault(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const defVal = parseFloat(strip.panApi.get('default_value').toString())
  strip.panApi.set('value', defVal)
  const str = strip.panApi.call('str_for_value', defVal) as any
  osc(SA_PANSTR[strip.stripIndex], str ? str.toString() : '')
}

// Send handlers — send1 through send12
function handleSend(stripIdx: number, sendNum: number, val: number) {
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
    scratchApi.path = 'live_set'
    if (parseInt(scratchApi.get('exclusive_solo').toString()) === 1) {
      const tracks = cleanArr(scratchApi.get('tracks'))
      const returns = cleanArr(scratchApi.get('return_tracks'))
      for (const tid of tracks.concat(returns)) {
        if (tid === strip.trackId) continue
        scratchApi.id = tid
        scratchApi.set('solo', 0)
      }
    }
  }
  strip.trackApi.set('solo', newState)
  osc(SA_SOLO[strip.stripIndex], newState)
}

function enableRecord(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip || !strip.canBeArmed) return
  enableTrackInput(strip.trackApi)
  strip.trackApi.set('arm', 1)

  scratchApi.path = 'live_set'
  if (parseInt(scratchApi.get('exclusive_arm').toString()) === 1) {
    const tracks = cleanArr(scratchApi.get('tracks'))
    for (const tid of tracks) {
      if (tid === strip.trackId) continue
      scratchApi.id = tid
      if (parseInt(scratchApi.get('can_be_armed').toString())) {
        scratchApi.set('arm', 0)
      }
    }
  }

  sendRecordStatusForStrip(strip)
}

function disableRecord(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip || !strip.canBeArmed) return
  strip.trackApi.set('arm', 0)
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
  const armStatus =
    strip.canBeArmed && parseInt(strip.trackApi.get('arm').toString())
  const inputStatus = getTrackInputStatus(strip.trackApi)
  osc(SA_ARM[n], armStatus ? 1 : 0)
  osc(SA_INPUT[n], inputStatus && inputStatus.inputEnabled ? 1 : 0)
}

function toggleXFadeA(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const curr = parseInt(strip.mixerApi.get('crossfade_assign').toString())
  strip.mixerApi.set('crossfade_assign', curr === 0 ? 1 : 0)
}

function toggleXFadeB(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const curr = parseInt(strip.mixerApi.get('crossfade_assign').toString())
  strip.mixerApi.set('crossfade_assign', curr === 2 ? 1 : 2)
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

log('reloaded k4-multiMixer')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
