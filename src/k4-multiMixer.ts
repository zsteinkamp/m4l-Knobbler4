import {
  cleanArr,
  colorToString,
  detach,
  fixFloat,
  getVisibleTracksList,
  logFactory,
  setOscSink,
  meterVal,
  osc,
  pauseUnpause,
  PauseState,
  TrackInfo,
} from './utils'
import config from './k4-config'
import {
  noFn,
  MAX_SENDS,
  PAUSE_MS,
  METER_FLUSH_MS,
  TYPE_TRACK,
  TYPE_RETURN,
  DEFAULT_COLOR,
} from './consts'
import {
  handleExclusiveArm,
  toggleXFade as toggleXFadeShared,
  enableArm,
  disableArm,
  disableTrackInput,
  getRecordStatus,
  setParamValue,
  resetParamValue,
  effectiveMute,
  toggleMute as toggleMuteShared,
  toggleSolo as toggleSoloShared,
  xfadeAB,
} from './mixerUtils'

const log = logFactory(config)

// Orchestrator context (set in init) — used to reach the sidebar mixer.
let ctx: AppContext = null

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StripObservers = {
  trackId: number
  trackApi: LiveAPI
  colorApi: LiveAPI
  muteApi: LiveAPI
  mutedViaSoloApi: LiveAPI
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

// Bind a fresh observer to an object by its numeric id instead of by a path
// string. `new LiveAPI(cb, 'live_set tracks N ...')` interns that path into Max's
// global symbol table (~1 symbol per distinct path, measured); `.id = N` is
// numeric and interns nothing. The '' constructor path is interned once
// globally. Child ids come from id-list reads (.get('mixer_device') etc.), which
// also don't intern — so a whole strip costs 0 path symbols. See k4-symbolTest.
function obsById(id: number, cb: any, prop?: string): LiveAPI {
  const api = new LiveAPI(cb, '')
  api.id = id
  if (prop) api.property = prop
  return api
}

// Re-point an existing observer to a new object id + property. Free — no path
// interning, no teardown leak. The basis of the strip pool: reuse observer
// objects across scroll instead of evict+recreate. See CLAUDE.md observer
// lifecycle.
function reArm(api: LiveAPI, id: number, prop: string) {
  api.id = id
  api.property = prop
}

const DEFAULT_VISIBLE_COUNT = 18
const MAX_STRIP_IDX = 128
// Small coalescing window for /mixerView. The app already debounces (~100ms
// after scroll settles), so the device just needs to merge any back-to-back
// requests rather than ride out a whole scroll gesture.
const MIXERVIEW_DEBOUNCE_MS = 40

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

// Observers keyed by track ID — kept WARM across scrolls (not torn down the
// instant a strip leaves the viewport), so scroll-back is instant with low GC
// churn (commit 94e86ea). Bounded to a WARM_MARGIN buffer around the viewport
// (applyWindow evicts strips outside it) so multiplayer — N instances on one
// Live set — can't climb toward Live's observer ceiling and freeze change
// notifications. Mirrors the clip-view bound (see k4-clipView applyWindow).
const WARM_MARGIN = 0.5 // keep this fraction of the viewport warm on each side
let observersByTrackId: Record<number, StripObservers> = {}

// Free pool of parked strip-observer objects (stripIndex = -1, meters disabled).
// On scroll, strips leaving the warm window are parked here and RE-POINTED to
// newly-warm tracks instead of being torn down — teardown leaks ~6 symbols per
// observer, re-point is free (see CLAUDE.md). Real teardown happens only on a
// full rebuild. The cap bounds the pool; overflow (rare) is torn down.
let stripPool: StripObservers[] = []
const POOL_CAP = 64

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
  osc('/mixer/returnTrackColors', colors)
}

// ---------------------------------------------------------------------------
// Meter Observers
// ---------------------------------------------------------------------------

// Create the 3 meter observers once. output_meter_* are Track properties — bound
// by track id. Created lazily, re-pointed with the strip, and toggled on/off via
// setMetersActive rather than torn down (teardown leaks symbols — see the
// observer-lifecycle section in CLAUDE.md). The stripIndex < 0 guard skips parked
// strips, whose buffer slot is invalid.
function ensureMeterApis(strip: StripObservers) {
  if (strip.meterLeftApi) return
  strip.meterLeftApi = obsById(strip.trackId, function (args: any[]) {
    if (strip.stripIndex < 0 || args[0] !== 'output_meter_left') return
    const v = meterVal(args[1])
    const off = strip.stripIndex * 3
    if (v !== meterBuffer[off]) {
      meterBuffer[off] = v
      meterDirty = true
    }
  }, 'output_meter_left')

  strip.meterRightApi = obsById(strip.trackId, function (args: any[]) {
    if (strip.stripIndex < 0 || args[0] !== 'output_meter_right') return
    const v = meterVal(args[1])
    const off = strip.stripIndex * 3 + 1
    if (v !== meterBuffer[off]) {
      meterBuffer[off] = v
      meterDirty = true
    }
  }, 'output_meter_right')

  strip.meterLevelApi = obsById(strip.trackId, function (args: any[]) {
    if (strip.stripIndex < 0 || args[0] !== 'output_meter_level') return
    const v = meterVal(args[1])
    const off = strip.stripIndex * 3 + 2
    if (v !== meterBuffer[off]) {
      meterBuffer[off] = v
      meterDirty = true
    }
  }, 'output_meter_level')
}

// Subscribe/unsubscribe the meter observers without tearing them down (property
// '' unsubscribes — free; teardown leaks). Keeps meters live only for visible
// strips while the objects stay pooled.
function setMetersActive(strip: StripObservers, active: boolean) {
  if (!strip.meterLeftApi) return
  strip.meterLeftApi.property = active ? 'output_meter_left' : ''
  strip.meterRightApi.property = active ? 'output_meter_right' : ''
  strip.meterLevelApi.property = active ? 'output_meter_level' : ''
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
  if (baseOffset >= 0 && baseOffset + 2 < meterBuffer.length) {
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
  osc('/mixer/meters', meterBuffer)
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
    mutedViaSoloApi: null,
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

  // Resolve the track + its mixer children by id up front (id-list reads don't
  // intern), then bind every observer by .id instead of by path string — so the
  // whole strip costs 0 symbols. trackPath is read only for the isMain check
  // (reads don't intern; we never assign it to a .path). See obsById.
  scratchApi.id = trackId
  const trackPath = scratchApi.unquotedpath
  strip.isMain = trackPath.indexOf('master_track') > -1
  strip.canBeArmed =
    !strip.isMain && !!parseInt(scratchApi.get('can_be_armed').toString())
  const mixerId = cleanArr(scratchApi.get('mixer_device'))[0]
  scratchApi.id = mixerId
  const volId = cleanArr(scratchApi.get('volume'))[0]
  const panId = cleanArr(scratchApi.get('panning'))[0]
  const sendIds = cleanArr(scratchApi.get('sends'))

  // Color API — separate observer for track color changes
  strip.colorApi = obsById(trackId, function (args: any[]) {
    if (args[0] === 'color') {
      const newColor = colorToString(args[1].toString())
      for (let j = 0; j < trackList.length; j++) {
        if (trackList[j].id === strip.trackId) {
          trackList[j].color = newColor
          break
        }
      }
    }
  }, 'color')

  // Track API — used for querying properties (no observer)
  strip.trackApi = obsById(trackId, noFn)

  // Mute, solo, arm — separate observers (master track lacks these)
  if (!strip.isMain) {
    strip.muteApi = obsById(trackId, function (args: any[]) {
      if (args[0] === 'mute' && strip.initialized && isVisible(strip)) {
        emitEffectiveMute(strip)
      }
    }, 'mute')

    // muted_via_solo also lights the mute indicator so the user sees that
    // soloing another track has effectively muted this one.
    strip.mutedViaSoloApi = obsById(trackId, function (args: any[]) {
      if (args[0] === 'muted_via_solo' && strip.initialized && isVisible(strip)) {
        emitEffectiveMute(strip)
      }
    }, 'muted_via_solo')

    strip.soloApi = obsById(trackId, function (args: any[]) {
      if (args[0] === 'solo' && strip.initialized && isVisible(strip)) {
        osc(SA_SOLO[strip.stripIndex], parseInt(args[1].toString()))
        sendSoloCount()
      }
    }, 'solo')
  }

  if (strip.canBeArmed) {
    strip.armApi = obsById(trackId, function (args: any[]) {
      if (args[0] === 'arm' && strip.initialized && isVisible(strip)) {
        osc(SA_ARM[strip.stripIndex], parseInt(args[1].toString()))
      }
    }, 'arm')
  }

  // Treat every track as having audio output. has_audio_output isn't
  // observable and only flips when a track gains/loses its first device, so
  // tracking it accurately means observing the devices list per strip — not
  // worth the complexity. Always-on keeps the volume/pan/send sliders (and
  // meters) live; on a track with no real output they simply read ~0.
  strip.hasOutput = true

  // Meter observers are managed separately by applyWindow (visible tracks only)

  // Mixer device — observe crossfade_assign (master track lacks this)
  strip.mixerApi = obsById(mixerId, function (args: any[]) {
    if (args[0] === 'crossfade_assign' && strip.initialized && isVisible(strip)) {
      const xVal = parseInt(args[1].toString())
      osc(SA_XFADEA[strip.stripIndex], xVal === 0 ? 1 : 0)
      osc(SA_XFADEB[strip.stripIndex], xVal === 2 ? 1 : 0)
    }
  })
  if (!strip.isMain) {
    strip.mixerApi.property = 'crossfade_assign'
  }

  // Volume observer
  strip.volApi = obsById(volId, function (args: any[]) {
    if (args[0] !== 'value' || !strip.initialized || !isVisible(strip)) return
    if (!strip.pause['vol'] || !strip.pause['vol'].paused) {
      const fVal = parseFloat(args[1]) || 0
      osc(SA_VOL[strip.stripIndex], fVal)
      const str = strip.volApi.call('str_for_value', fixFloat(fVal)) as any
      osc(SA_VOLSTR[strip.stripIndex], str ? str.toString() : '')
    }
  }, 'value')

  // Volume automation state observer
  strip.volAutoApi = obsById(volId, function (args: any[]) {
    if (args[0] === 'automation_state' && strip.initialized && isVisible(strip)) {
      osc(SA_VOLAUTO[strip.stripIndex], parseInt(args[1].toString()))
    }
  }, 'automation_state')

  // Pan observer
  strip.panApi = obsById(panId, function (args: any[]) {
    if (args[0] !== 'value' || !strip.initialized || !isVisible(strip)) return
    if (!strip.pause['pan'] || !strip.pause['pan'].paused) {
      const fVal = parseFloat(args[1]) || 0
      osc(SA_PAN[strip.stripIndex], fVal)
      const str = strip.panApi.call('str_for_value', fixFloat(fVal)) as any
      osc(SA_PANSTR[strip.stripIndex], str ? str.toString() : '')
    }
  }, 'value')

  // Send observers
  const numSends = Math.min(sendIds.length, MAX_SENDS)
  for (let i = 0; i < numSends; i++) {
    const sendIdx = i
    const sendApi = obsById(sendIds[i], function (args: IdObserverArg) {
      if (args[0] !== 'value' || !strip.initialized || !isVisible(strip)) return
      if (!strip.pause['send'] || !strip.pause['send'].paused) {
        osc(SA_SEND[strip.stripIndex][sendIdx], args[1] || 0)
      }
    }, 'value')
    strip.sendApis.push(sendApi)
  }

  strip.initialized = true
  return strip
}

// Re-point a type-compatible parked/freed strip to a new track. The caller
// guarantees compatibility (same isMain / canBeArmed / send count), so the
// observer SET already matches — we only re-point ids + re-arm properties, no
// create or teardown. Child ids are passed in (resolved once by takeAndRepoint).
function repointStrip(
  strip: StripObservers,
  trackId: number,
  stripIdx: number,
  mixerId: number,
  volId: number,
  panId: number,
  sendIds: number[]
) {
  strip.initialized = false // suppress emits while re-pointing fires callbacks
  strip.trackId = trackId
  strip.stripIndex = stripIdx

  reArm(strip.colorApi, trackId, 'color')
  strip.trackApi.id = trackId
  if (strip.muteApi) reArm(strip.muteApi, trackId, 'mute')
  if (strip.mutedViaSoloApi) reArm(strip.mutedViaSoloApi, trackId, 'muted_via_solo')
  if (strip.soloApi) reArm(strip.soloApi, trackId, 'solo')
  if (strip.armApi) reArm(strip.armApi, trackId, 'arm')
  strip.mixerApi.id = mixerId
  if (!strip.isMain) strip.mixerApi.property = 'crossfade_assign'
  reArm(strip.volApi, volId, 'value')
  reArm(strip.volAutoApi, volId, 'automation_state')
  reArm(strip.panApi, panId, 'value')
  for (let i = 0; i < strip.sendApis.length; i++) {
    reArm(strip.sendApis[i], sendIds[i], 'value')
  }
  // Meters travel with the strip (re-point id only; active state set by caller).
  if (strip.meterLeftApi) {
    strip.meterLeftApi.id = trackId
    strip.meterRightApi.id = trackId
    strip.meterLevelApi.id = trackId
  }

  strip.initialized = true
}

// Provide a strip for `trackId` at `stripIdx`: re-point a compatible free strip
// if one exists (no leak), else create a fresh one (create is free; only
// teardown leaks). Resolves the track's mixer-child ids once via id-list reads.
function takeAndRepoint(
  free: (StripObservers | null)[],
  trackId: number,
  stripIdx: number
): StripObservers {
  scratchApi.id = trackId
  const trackPath = scratchApi.unquotedpath
  const isMain = trackPath.indexOf('master_track') > -1
  const canBeArmed =
    !isMain && !!parseInt(scratchApi.get('can_be_armed').toString())
  const mixerId = cleanArr(scratchApi.get('mixer_device'))[0]
  scratchApi.id = mixerId
  const volId = cleanArr(scratchApi.get('volume'))[0]
  const panId = cleanArr(scratchApi.get('panning'))[0]
  const sendIds = cleanArr(scratchApi.get('sends'))

  for (let k = 0; k < free.length; k++) {
    const s = free[k]
    if (
      s &&
      s.isMain === isMain &&
      s.canBeArmed === canBeArmed &&
      s.sendApis.length === sendIds.length
    ) {
      free[k] = null
      repointStrip(s, trackId, stripIdx, mixerId, volId, panId, sendIds)
      return s
    }
  }
  return createStripObservers(trackId, stripIdx)
}

// Park a strip in the pool: unsubscribe ALL its observers (property '' — free, no
// teardown leak) so they stop firing while idle and never fire on a since-deleted
// track (the invalidated-object crash detach() guards against). repointStrip
// re-subscribes on reuse. trackApi has no observer, so its stale id is harmless.
function parkStrip(strip: StripObservers) {
  strip.stripIndex = -1
  strip.initialized = false
  if (strip.colorApi) strip.colorApi.property = ''
  if (strip.muteApi) strip.muteApi.property = ''
  if (strip.mutedViaSoloApi) strip.mutedViaSoloApi.property = ''
  if (strip.soloApi) strip.soloApi.property = ''
  if (strip.armApi) strip.armApi.property = ''
  if (strip.mixerApi) strip.mixerApi.property = ''
  if (strip.volApi) strip.volApi.property = ''
  if (strip.volAutoApi) strip.volAutoApi.property = ''
  if (strip.panApi) strip.panApi.property = ''
  for (let i = 0; i < strip.sendApis.length; i++) strip.sendApis[i].property = ''
  setMetersActive(strip, false)
}

// Effective mute = mute || muted_via_solo (the user sees both as "muted").
// Master lacks both properties, so skip it.
function emitEffectiveMute(strip: StripObservers) {
  if (strip.isMain) return
  osc(SA_MUTE[strip.stripIndex], effectiveMute(strip.trackApi))
}

function teardownStripObservers(strip: StripObservers) {
  detach(strip.colorApi)
  detach(strip.muteApi)
  detach(strip.mutedViaSoloApi)
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
  for (let k = 0; k < stripPool.length; k++) {
    teardownStripObservers(stripPool[k])
  }
  stripPool = []
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

  if (strip.isMain) {
    osc(SA_MUTE[n], 0)
  } else {
    emitEffectiveMute(strip)
  }
  osc(SA_SOLO[n], !strip.isMain ? parseInt(strip.trackApi.get('solo').toString()) : 0)
  osc(SA_ARM[n], strip.canBeArmed ? parseInt(strip.trackApi.get('arm').toString()) : 0)

  const recordStatus = getRecordStatus(strip.trackApi)
  osc(SA_INPUT[n], strip.canBeArmed && recordStatus.inputEnabled ? 1 : 0)
  osc(SA_HASOUTPUT[n], strip.hasOutput ? 1 : 0)

  if (!strip.isMain) {
    const [aOn, bOn] = xfadeAB(strip.mixerApi)
    osc(SA_XFADEA[n], aOn)
    osc(SA_XFADEB[n], bOn)
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

  // --- Warm-window reconcile (pool + re-point; no teardown on scroll) ---
  // The warm window is the viewport plus a WARM_MARGIN buffer each side. Strips
  // leaving it are PARKED (not torn down — teardown leaks) and reused by
  // re-pointing onto strips entering it. On steady scrolling the window size is
  // constant, so every step is pure re-pointing: zero teardown, zero leak.
  const margin = Math.ceil(visibleCount * WARM_MARGIN)
  const warmLeft = Math.max(0, leftIndex - margin)
  const warmRight = Math.min(trackList.length, visRight + margin)

  // Target: trackId -> stripIndex for the warm window.
  const targetIdx: Record<number, number> = {}
  for (let i = warmLeft; i < warmRight; i++) targetIdx[trackList[i].id] = i

  // Residents still in target keep their observers (refresh stripIndex); the rest
  // become reuse candidates, joined by the parked pool.
  const free: (StripObservers | null)[] = []
  for (const tidStr in observersByTrackId) {
    const tid = +tidStr
    if (targetIdx[tid] !== undefined) {
      observersByTrackId[tid].stripIndex = targetIdx[tid]
    } else {
      free.push(observersByTrackId[tid])
      delete observersByTrackId[tid]
    }
  }
  for (let k = 0; k < stripPool.length; k++) free.push(stripPool[k])

  // Fill missing targets by re-pointing a compatible free strip, else creating.
  for (let i = warmLeft; i < warmRight; i++) {
    const tid = trackList[i].id
    if (observersByTrackId[tid]) continue
    observersByTrackId[tid] = takeAndRepoint(free, tid, i)
  }

  // Leftover free strips: park them (disable meters; stripIndex -1 so they never
  // emit). Cap the pool; only the overflow (rare) is torn down.
  stripPool = []
  for (let k = 0; k < free.length; k++) {
    const s = free[k]
    if (!s) continue
    parkStrip(s)
    if (stripPool.length < POOL_CAP) stripPool.push(s)
    else teardownStripObservers(s)
  }

  // Meters: live only for visible strips, toggled (not torn down) so the objects
  // stay pooled and re-pointable.
  if (metersEnabled) {
    for (const tidStr in observersByTrackId) {
      const strip = observersByTrackId[tidStr]
      if (isVisible(strip) && strip.hasOutput) {
        ensureMeterApis(strip)
        setMetersActive(strip, true)
      } else {
        setMetersActive(strip, false)
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
  mixerViewTask.schedule(MIXERVIEW_DEBOUNCE_MS)
}

function mixerMeters(val: number) {
  const enabled = !!parseInt(val.toString())
  if (enabled === metersEnabled) return
  metersEnabled = enabled
  ctx.settings.set('metersEnabled', metersEnabled ? 1 : 0)
  sendMetersState()

  if (metersEnabled) {
    // Activate meters for visible tracks only (create lazily, then subscribe).
    const visRight = Math.min(leftIndex + visibleCount, trackList.length)
    for (let i = leftIndex; i < visRight; i++) {
      const tid = trackList[i].id
      const strip = observersByTrackId[tid]
      if (strip && strip.hasOutput) {
        ensureMeterApis(strip)
        setMetersActive(strip, true)
      }
    }
    if (onMixerPage && visibleCount > 0) startMeterFlush()
  } else {
    stopMeterFlush()
    // Disable (not teardown — teardown leaks) all meter observers.
    for (const trackIdStr in observersByTrackId) {
      setMetersActive(observersByTrackId[trackIdStr], false)
    }
    for (let k = 0; k < stripPool.length; k++) {
      setMetersActive(stripPool[k], false)
    }
  }
}

function sendMetersState() {
  osc('/mixerMeters', metersEnabled ? 1 : 0)
  var chk = patcher.getnamed('chkMeters')
  if (chk) chk.message('set', metersEnabled ? 1 : 0)
  // Direct call now that sidebarMixer is folded into the same [v8].
  ctx.sidebar.sidebarMeters(metersEnabled ? 1 : 0)
}

function page(pageNameArg: string) {
  const pageName = pageNameArg.toString()
  const wasMixerPage = onMixerPage
  onMixerPage = pageName === 'mixer' || pageName === 'session'

  if (onMixerPage && !wasMixerPage) {
    if (metersEnabled && visibleCount > 0) startMeterFlush()
  } else if (!onMixerPage && wasMixerPage) {
    stopMeterFlush()
  }
}

function init(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
  ensureApis()
  metersEnabled = !!ctx.settings.get('metersEnabled')
  sendMetersState()
  // Force visible strips to re-send on the /syn re-push. Their state was first
  // pushed at LOAD while output was still gated (node sender not yet ready), so
  // it was dropped; the visibleStateSet cache would otherwise mark them "sent"
  // and skip them here, leaving the initial strips dead until scrolled away and
  // back. Clearing it makes applyWindow re-emit state for the visible window.
  visibleStateSet = {}
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
  osc(SA_VOLSTR[strip.stripIndex], setParamValue(strip.volApi, val))
}

function pan(stripIdx: number, val: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  stripPause(strip, 'pan')
  osc(SA_PANSTR[strip.stripIndex], setParamValue(strip.panApi, val))
}

function volDefault(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const res = resetParamValue(strip.volApi)
  if (!res) return
  osc(SA_VOL[strip.stripIndex], res.value)
  osc(SA_VOLSTR[strip.stripIndex], res.str)
}

function panDefault(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const res = resetParamValue(strip.panApi)
  if (!res) return
  osc(SA_PANSTR[strip.stripIndex], res.str)
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
  toggleMuteShared(strip.trackApi)
  emitEffectiveMute(strip)
}

function toggleSolo(stripIdx: number) {
  const strip = getStrip(stripIdx)
  if (!strip) return
  const newState = toggleSoloShared(strip.trackApi, scratchApi)
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
// Parse /mixer/{stripIdx}/{subCmd} and dispatch. NaN stripIdx (e.g. the
// single-track /mixer/vol) is left for k4-mixerSends (still in the router).
function mixerCmd(address: string, val: any) {
  const parts = address.split('/') // ['', 'mixer', '3', 'vol']
  const stripIdx = parseInt(parts[2])
  if (isNaN(stripIdx)) return
  dispatchMixerSub(parts[3], stripIdx, val)
}

function dispatchMixerSub(subCmd: string, stripIdx: number, val: any) {
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
  trackList = getVisibleTracksList()
  if (!trackList || trackList.length === 0) return
  // Clamp leftIndex if track list shrank
  if (leftIndex >= trackList.length) {
    leftIndex = Math.max(0, trackList.length - visibleCount)
  }
  sendReturnTrackColors()
  if (visibleCount > 0) {
    applyWindow()
  }
}

const routes: Route[] = [
  { prefix: '/mixerView', parse: 'val', fn: mixerView },
  { prefix: '/mixerMeters', parse: 'val', fn: mixerMeters },
  { prefix: '/mixer/', parse: 'custom', fn: mixerCmd, coalesce: true },
]

log('reloaded k4-multiMixer')

export { routes, init, visibleTracks, page }
