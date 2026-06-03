import { cleanArr, detach, dequote, getVisibleTracksList, logFactory, osc, setOscSink } from './utils'
import config from './k4-config'
import { noFn, TYPE_RETURN, TYPE_MAIN, TYPE_GROUP } from './consts'

const log = logFactory(config)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLIP_EMPTY = 0
const CLIP_STOPPED = 1
const CLIP_PLAYING = 2
const CLIP_TRIGGERED = 3
const CLIP_RECORDING = 4
const CLIP_ARMED = 5

// Small coalescing window for /clipView. The app already debounces (~100ms
// after scroll settles), so the device just needs to merge any back-to-back
// requests rather than ride out a whole scroll gesture.
const VIEW_DEBOUNCE_MS = 40
const UPDATE_FLUSH_MS = 50
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClipCell = {
  state: number // CLIP_EMPTY..CLIP_RECORDING
  name: string
  color: string // RRGGBB hex, no #
  ps: number // playing_status for group tracks (0=stopped, 1=playing, 2=recording)
  hc: number // has_child_clips for group tracks (1 if any child has clip at this row)
  hsb: number // has_stop_button (0 or 1)
}

type CellObservers = {
  trackIdx: number
  sceneIdx: number
  hasClip: boolean
  hasClipApi: LiveAPI // observes has_clip on clip_slot
  clipApi: LiveAPI // observes clip name (only when has_clip)
  clipColorApi: LiveAPI // observes clip color (only when has_clip)
  clipRecordingApi: LiveAPI // observes clip is_recording (only when has_clip)
  hasStopButtonApi: LiveAPI // observes has_stop_button on clip_slot
  playingStatusApi: LiveAPI // observes playing_status (group tracks only)
  controlsOtherClipsApi: LiveAPI // observes controls_other_clips (group tracks only)
  cell: ClipCell
}

type TrackPlayObservers = {
  trackIdx: number
  playingSlotApi: LiveAPI // observes playing_slot_index on track
  firedSlotApi: LiveAPI // observes fired_slot_index on track
  armApi: LiveAPI // observes arm on track
  nameApi: LiveAPI // observes track name
  colorApi: LiveAPI // observes track color
  playingSlot: number // current playing slot index (-2 = none)
  firedSlot: number // current fired/triggered slot index (-2 = none)
  armed: boolean
}

type SceneInfo = {
  sceneIdx: number
  nameApi: LiveAPI
  colorApi: LiveAPI
  name: string
  color: string // RRGGBB hex, no #
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ctx: AppContext = null
let scratchApi: LiveAPI = null
let cellInitApi: LiveAPI = null // separate scratchpad for createCellObservers (avoids re-entrancy)
let viewApi: LiveAPI = null

// Track IDs in display order (visible_tracks, no return/master)
let trackIds: number[] = []
let trackPaths: string[] = []
let trackIsGroup: boolean[] = []

// Visible window (track and scene ranges)
let leftTrack = -1
let topScene = -1
let rightTrack = -1 // exclusive
let bottomScene = -1 // exclusive
let totalScenes = 0
let settingUp = false // guard against watcher callbacks during setupWindow

// Observer management
let cellObservers: Record<string, CellObservers> = {} // key: "col,row"
let trackPlayObservers: Record<number, TrackPlayObservers> = {} // key: trackIdx
let sceneObservers: Record<number, SceneInfo> = {} // key: sceneIndex
let sceneCache: { n: string; c: string }[] = [] // cached scene name/color for all scenes

// Debounce
let viewTask: MaxTask = null
let sceneInfoTask: MaxTask = null

// Lazy observer creation
let pendingObserverKeys: string[] = []
let observerBatchTask: MaxTask = null
const OBSERVER_BATCH_SIZE = 10
// Keep a buffer of this fraction of the viewport (each side) warm around the
// visible window; observers outside it are evicted. Bounds the resident
// observer count to ~(1+2*WARM_MARGIN)^2 * viewport regardless of how far you
// scroll — so multiplayer (N instances on one set) can't climb toward Live's
// observer ceiling. See the applyWindow comment + 94e86ea.
const WARM_MARGIN = 0.5

// Update batching
let pendingUpdates: { t: number; sc: number; s: number }[] = []
let updateFlushTask: MaxTask = null

// Watchers
let sceneCountWatcher: LiveAPI = null
let selectedSceneApi: LiveAPI = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureApis() {
  if (!scratchApi) scratchApi = new LiveAPI(noFn, 'live_set')
  if (!cellInitApi) cellInitApi = new LiveAPI(noFn, 'live_set')
  if (!viewApi) viewApi = new LiveAPI(noFn, 'live_set view')
}

// Bind a fresh observer by numeric id instead of a path string. A path string
// (`new LiveAPI(cb, 'tracks N clip_slots M ...')` or `.path = ...`) interns a
// permanent Max symbol each (measured ~1:1); `.id` is numeric and interns
// nothing. The '' constructor path is interned once globally. Structural ids come
// from id-list reads (.get('clip_slots'/'scenes'/'clip')), which also don't
// intern — so a whole clip grid costs ~0 path symbols. See k4-symbolTest /
// k4-multiMixer for the pattern + measurements.
function obsById(id: number, cb: any, prop?: string): LiveAPI {
  const api = new LiveAPI(cb, '')
  api.id = id
  if (prop) api.property = prop
  return api
}

// Scene ids by row index — refreshed by querySceneCount alongside totalScenes.
let sceneIds: number[] = []

// Per-track clip_slot ids by row, keyed by trackIdx. Lazily filled + cached so
// cells/observers bind by clip_slot id rather than positional path strings.
// Cleared on track-list / scene-count changes (which also tear down all cells,
// so any live cell's track is guaranteed cached). Every track has exactly
// totalScenes clip_slots (Live invariant), so row indexes the array directly.
let trackSlotIds: Record<number, number[]> = {}

function ensureTrackSlotIds(trackIdx: number): number[] {
  let arr = trackSlotIds[trackIdx]
  if (arr) return arr
  scratchApi.id = trackIds[trackIdx]
  arr = cleanArr(scratchApi.get('clip_slots'))
  trackSlotIds[trackIdx] = arr
  return arr
}

function slotId(trackIdx: number, row: number): number {
  return ensureTrackSlotIds(trackIdx)[row]
}

function shouldSelectOnLaunch(): boolean {
  scratchApi.path = 'live_set'
  return !!parseInt(scratchApi.get('select_on_launch'))
}

function selectClipSlot(trackIdx: number, sceneIdx: number) {
  ctx.gotoTrack(trackIds[trackIdx].toString()) // shared nav: unfolds enclosing groups
  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  viewApi.set('highlighted_clip_slot', ['id', parseInt(scratchApi.id.toString())])
}

function cellKey(col: number, row: number): string {
  return col + ',' + row
}

function isVisible(col: number, row: number): boolean {
  return (
    col >= leftTrack && col < rightTrack && row >= topScene && row < bottomScene
  )
}

function colorHex(raw: any): string {
  return ('000000' + parseInt(raw.toString()).toString(16)).slice(-6)
}

// Derive cell state from has_clip + track-level playing/fired/arm info
function deriveCellState(
  hasClip: boolean,
  trackIdx: number,
  sceneIdx: number
): number {
  const tObs = trackPlayObservers[trackIdx]
  if (!hasClip) {
    return tObs && tObs.armed ? CLIP_ARMED : CLIP_EMPTY
  }
  if (tObs) {
    if (tObs.firedSlot === sceneIdx) return CLIP_TRIGGERED
    if (tObs.playingSlot === sceneIdx) return CLIP_PLAYING
  }
  return CLIP_STOPPED
}

// ---------------------------------------------------------------------------
// Track List
// ---------------------------------------------------------------------------

function visibleTracks() {
  const tracks = getVisibleTracksList()
  if (!tracks || tracks.length === 0) return
  trackIds = []
  trackPaths = []
  trackIsGroup = []
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]
    if (t.type === TYPE_RETURN || t.type === TYPE_MAIN) continue
    trackIds.push(t.id)
    trackPaths.push(t.path)
    trackIsGroup.push(t.type === TYPE_GROUP)
  }
  // trackIdx -> id mapping changed; drop the per-track clip_slot id cache.
  trackSlotIds = {}
  if (leftTrack < 0 || settingUp) return
  teardownAllCells()
  teardownAllTrackPlay()
  applyWindow()
}

// ---------------------------------------------------------------------------
// Scene Count
// ---------------------------------------------------------------------------

function querySceneCount(): number {
  scratchApi.path = 'live_set'
  sceneIds = cleanArr(scratchApi.get('scenes'))
  return sceneIds.length
}

function onSceneCountChange(args: any[]) {
  if (args[0] !== 'scenes') return
  if (leftTrack < 0 || settingUp) return
  ensureApis()
  const newCount = querySceneCount()
  if (newCount !== totalScenes) {
    totalScenes = newCount
    sceneCache = [] // invalidate cache
    trackSlotIds = {} // clip_slot ids shift when scenes are added/removed
    teardownAllCells()
    teardownAllScenes()
    applyWindow()
  }
}

// ---------------------------------------------------------------------------
// Selected Scene
// ---------------------------------------------------------------------------

function onSelectedSceneChange() {
  if (!selectedSceneApi || leftTrack < 0) return
  sendSelectedScene()
}

function sendSelectedScene() {
  if (!selectedSceneApi) return
  const path = selectedSceneApi.unquotedpath
  const match = path.match(/scenes (\d+)/)
  const idx = match ? parseInt(match[1]) : -1
  osc('/clips/selectedScene', idx)
}

// ---------------------------------------------------------------------------
// Track Play Observers (playing_slot_index + fired_slot_index per track)
// ---------------------------------------------------------------------------

function createTrackPlayObservers(trackIdx: number): TrackPlayObservers {
  const trackId = trackIds[trackIdx]

  const tObs: TrackPlayObservers = {
    trackIdx: trackIdx,
    playingSlotApi: null,
    firedSlotApi: null,
    armApi: null,
    nameApi: null,
    colorApi: null,
    playingSlot: -2,
    firedSlot: -2,
    armed: false,
  }

  // Read initial values (by id — no path interning)
  cellInitApi.id = trackId
  tObs.playingSlot = parseInt(cellInitApi.get('playing_slot_index').toString())
  tObs.firedSlot = parseInt(cellInitApi.get('fired_slot_index').toString())
  const canBeArmed = !!parseInt(cellInitApi.get('can_be_armed').toString())
  if (canBeArmed) {
    tObs.armed = !!parseInt(cellInitApi.get('arm').toString())
  }

  // Observer: playing_slot_index
  tObs.playingSlotApi = obsById(trackId, function (args: any[]) {
    if (!tObs.playingSlotApi) return
    if (args[0] !== 'playing_slot_index') return
    const newSlot = parseInt(args[1])
    const oldSlot = tObs.playingSlot
    tObs.playingSlot = newSlot

    // Update old slot (was playing, now stopped or empty)
    if (oldSlot >= 0) updateCellFromTrack(trackIdx, oldSlot)
    // Update new slot (now playing)
    if (newSlot >= 0) updateCellFromTrack(trackIdx, newSlot)
  }, 'playing_slot_index')

  // Observer: fired_slot_index
  tObs.firedSlotApi = obsById(trackId, function (args: any[]) {
    if (!tObs.firedSlotApi) return
    if (args[0] !== 'fired_slot_index') return
    const newSlot = parseInt(args[1])
    const oldSlot = tObs.firedSlot
    tObs.firedSlot = newSlot

    // Update old triggered slot (no longer triggered)
    if (oldSlot >= 0) updateCellFromTrack(trackIdx, oldSlot)
    // Update new triggered slot
    if (newSlot >= 0) updateCellFromTrack(trackIdx, newSlot)
  }, 'fired_slot_index')

  // Observer: arm (only for tracks that can be armed)
  if (canBeArmed) {
    tObs.armApi = obsById(trackId, function (args: any[]) {
      if (!tObs.armApi) return
      if (args[0] !== 'arm') return
      const newArmed = !!parseInt(args[1])
      if (newArmed === tObs.armed) return
      tObs.armed = newArmed
      // Update all empty cells on this track (armed state changes their display)
      updateAllCellsOnTrack(trackIdx)
    }, 'arm')
  }

  // Observer: track name
  tObs.nameApi = obsById(trackId, function (args: any[]) {
    if (!tObs.nameApi) return
    if (args[0] !== 'name') return
    osc('/clips/trackInfo', { t: tObs.trackIdx, n: dequote(args[1]) })
  }, 'name')

  // Observer: track color
  tObs.colorApi = obsById(trackId, function (args: any[]) {
    if (!tObs.colorApi) return
    if (args[0] !== 'color') return
    osc('/clips/trackInfo', { t: tObs.trackIdx, c: colorHex(args[1]) })
  }, 'color')

  return tObs
}

function teardownTrackPlayObservers(tObs: TrackPlayObservers) {
  if (tObs.playingSlotApi) {
    detach(tObs.playingSlotApi)
    tObs.playingSlotApi = null
  }
  if (tObs.firedSlotApi) {
    detach(tObs.firedSlotApi)
    tObs.firedSlotApi = null
  }
  if (tObs.armApi) {
    detach(tObs.armApi)
    tObs.armApi = null
  }
  if (tObs.nameApi) {
    detach(tObs.nameApi)
    tObs.nameApi = null
  }
  if (tObs.colorApi) {
    detach(tObs.colorApi)
    tObs.colorApi = null
  }
}

function teardownAllTrackPlay() {
  for (const key in trackPlayObservers) {
    teardownTrackPlayObservers(trackPlayObservers[key])
  }
  trackPlayObservers = {}
}

// Called when arm changes — update all cells on this track that have observers
function updateAllCellsOnTrack(trackIdx: number) {
  for (const key in cellObservers) {
    const obs = cellObservers[key]
    if (obs.trackIdx === trackIdx) {
      updateCellFromTrack(trackIdx, obs.sceneIdx)
    }
  }
}

// Called when playing_slot_index or fired_slot_index changes on a track
function updateCellFromTrack(trackIdx: number, sceneIdx: number) {
  const key = cellKey(trackIdx, sceneIdx)
  const obs = cellObservers[key]
  if (!obs) return
  const newState = deriveCellState(obs.hasClip, trackIdx, sceneIdx)
  const oldState = obs.cell.state
  obs.cell.state = newState
  if (newState !== oldState && isVisible(trackIdx, sceneIdx)) {
    queueFullUpdate(obs)
  }
}

// ---------------------------------------------------------------------------
// Cell Observer Creation / Teardown
// ---------------------------------------------------------------------------

// Read initial cell state using reused scratchpad — no LiveAPI objects created
function readCellState(col: number, row: number): CellObservers {
  const sid = slotId(col, row)

  const cell: ClipCell = { state: CLIP_EMPTY, name: '', color: '', ps: 0, hc: 0, hsb: 0 }

  const obs: CellObservers = {
    trackIdx: col,
    sceneIdx: row,
    hasClip: false,
    hasClipApi: null,
    clipApi: null,
    clipColorApi: null,
    clipRecordingApi: null,
    hasStopButtonApi: null,
    playingStatusApi: null,
    controlsOtherClipsApi: null,
    cell: cell,
  }

  cellInitApi.id = sid
  const hasClip = !!parseInt(cellInitApi.get('has_clip').toString())
  obs.hasClip = hasClip
  cell.state = deriveCellState(hasClip, col, row)
  cell.hsb = parseInt(cellInitApi.get('has_stop_button').toString()) ? 1 : 0

  if (hasClip) {
    cellInitApi.id = cleanArr(cellInitApi.get('clip'))[0]
    cell.name = dequote(cellInitApi.get('name').toString())
    cell.color = colorHex(cellInitApi.get('color'))
    if (parseInt(cellInitApi.get('is_recording').toString())) {
      cell.state = CLIP_RECORDING
    }
  }

  if (trackIsGroup[col]) {
    cellInitApi.id = sid
    cell.ps = parseInt(cellInitApi.get('playing_status').toString()) || 0
    cell.hc = parseInt(cellInitApi.get('controls_other_clips').toString()) ? 1 : 0
  }

  return obs
}

// Attach LiveAPI observers to a cell (expensive — called lazily in batches)
function attachCellObservers(obs: CellObservers) {
  if (obs.hasClipApi) return // already attached
  const sid = slotId(obs.trackIdx, obs.sceneIdx)

  // has_stop_button
  obs.hasStopButtonApi = obsById(sid, function (args: any[]) {
    if (!obs.hasStopButtonApi) return
    if (args[0] !== 'has_stop_button') return
    const newHsb = parseInt(args[1]) ? 1 : 0
    if (newHsb === obs.cell.hsb) return
    obs.cell.hsb = newHsb
    if (isVisible(obs.trackIdx, obs.sceneIdx)) {
      queueFullUpdate(obs)
    }
  }, 'has_stop_button')

  // Group track: playing_status and controls_other_clips
  if (trackIsGroup[obs.trackIdx]) {
    obs.playingStatusApi = obsById(sid, function (args: any[]) {
      if (!obs.playingStatusApi) return
      if (args[0] !== 'playing_status') return
      const newPs = parseInt(args[1]) || 0
      if (newPs === obs.cell.ps) return
      obs.cell.ps = newPs
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, 'playing_status')

    obs.controlsOtherClipsApi = obsById(sid, function (args: any[]) {
      if (!obs.controlsOtherClipsApi) return
      if (args[0] !== 'controls_other_clips') return
      const newHc = parseInt(args[1]) ? 1 : 0
      if (newHc === obs.cell.hc) return
      obs.cell.hc = newHc
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, 'controls_other_clips')
  }

  // has_clip
  obs.hasClipApi = obsById(sid, function (args: any[]) {
    if (!obs.hasClipApi) return
    if (args[0] !== 'has_clip') return
    const newHasClip = !!parseInt(args[1])
    if (newHasClip === obs.hasClip) return
    obs.hasClip = newHasClip
    if (newHasClip) {
      setupClipObserver(obs)
    } else {
      teardownClipObserver(obs)
      obs.cell.name = ''
      obs.cell.color = ''
    }
    const newState = deriveCellState(newHasClip, obs.trackIdx, obs.sceneIdx)
    const oldState = obs.cell.state
    obs.cell.state = newState
    if (newState !== oldState && isVisible(obs.trackIdx, obs.sceneIdx)) {
      queueFullUpdate(obs)
    }
  }, 'has_clip')

  // Clip observers (only if has_clip)
  if (obs.hasClip) {
    setupClipObserver(obs)
  }
}

function teardownCellObservers(obs: CellObservers) {
  if (obs.hasClipApi) {
    detach(obs.hasClipApi)
    obs.hasClipApi = null
  }
  if (obs.hasStopButtonApi) {
    detach(obs.hasStopButtonApi)
    obs.hasStopButtonApi = null
  }
  if (obs.playingStatusApi) {
    detach(obs.playingStatusApi)
    obs.playingStatusApi = null
  }
  if (obs.controlsOtherClipsApi) {
    detach(obs.controlsOtherClipsApi)
    obs.controlsOtherClipsApi = null
  }
  teardownClipObserver(obs)
}

function setupClipObserver(obs: CellObservers) {
  // Resolve the clip's id from its slot (re-read each call — a fresh clip has a
  // new id). slotId hits the per-track cache; the clip id read goes through
  // cellInitApi (the observer-safe pad — this can run from a callback).
  cellInitApi.id = slotId(obs.trackIdx, obs.sceneIdx)
  const clipId = cleanArr(cellInitApi.get('clip'))[0]

  cellInitApi.id = clipId
  obs.cell.name = dequote(cellInitApi.get('name').toString())
  obs.cell.color = colorHex(cellInitApi.get('color'))
  if (parseInt(cellInitApi.get('is_recording').toString())) {
    obs.cell.state = CLIP_RECORDING
  }

  if (!obs.clipApi) {
    obs.clipApi = obsById(clipId, function (args: any[]) {
      if (!obs.clipApi) return
      if (args[0] !== 'name') return
      obs.cell.name = dequote(args[1])
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, 'name')
  } else {
    obs.clipApi.id = clipId
    obs.clipApi.property = 'name'
  }

  if (!obs.clipRecordingApi) {
    obs.clipRecordingApi = obsById(clipId, function (args: any[]) {
      if (!obs.clipRecordingApi) return
      if (args[0] !== 'is_recording') return
      const recording = !!parseInt(args[1])
      if (recording) {
        obs.cell.state = CLIP_RECORDING
      } else {
        obs.cell.state = deriveCellState(obs.hasClip, obs.trackIdx, obs.sceneIdx)
      }
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, 'is_recording')
  } else {
    obs.clipRecordingApi.id = clipId
    obs.clipRecordingApi.property = 'is_recording'
  }

  if (!obs.clipColorApi) {
    obs.clipColorApi = obsById(clipId, function (args: any[]) {
      if (!obs.clipColorApi) return
      if (args[0] !== 'color') return
      obs.cell.color = colorHex(args[1])
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, 'color')
  } else {
    obs.clipColorApi.id = clipId
    obs.clipColorApi.property = 'color'
  }
}

function teardownClipObserver(obs: CellObservers) {
  if (obs.clipApi) {
    detach(obs.clipApi)
    obs.clipApi = null
  }
  if (obs.clipColorApi) {
    detach(obs.clipColorApi)
    obs.clipColorApi = null
  }
  if (obs.clipRecordingApi) {
    detach(obs.clipRecordingApi)
    obs.clipRecordingApi = null
  }
}

// ---------------------------------------------------------------------------
// Lazy observer creation (batched)
// ---------------------------------------------------------------------------

function scheduleObserverBatch() {
  if (!observerBatchTask) {
    observerBatchTask = new Task(processObserverBatch) as MaxTask
  }
  observerBatchTask.schedule(0)
}

function processObserverBatch() {
  let count = 0
  while (pendingObserverKeys.length > 0 && count < OBSERVER_BATCH_SIZE) {
    const key = pendingObserverKeys.shift()
    const obs = cellObservers[key]
    if (obs) {
      attachCellObservers(obs)
    }
    count++
  }
  if (pendingObserverKeys.length > 0) {
    scheduleObserverBatch()
  }
}

// ---------------------------------------------------------------------------
// State update & batching
// ---------------------------------------------------------------------------

function queueFullUpdate(obs: CellObservers) {
  const entry: any = { t: obs.trackIdx, sc: obs.sceneIdx, s: obs.cell.state }
  if (obs.cell.name) entry.n = obs.cell.name
  if (obs.cell.color) entry.c = obs.cell.color
  entry.hsb = obs.cell.hsb
  if (trackIsGroup[obs.trackIdx]) {
    entry.ps = obs.cell.ps
    entry.hc = obs.cell.hc
  }
  pendingUpdates.push(entry)
  scheduleFlush()
}

function scheduleFlush() {
  if (!updateFlushTask) {
    updateFlushTask = new Task(flushUpdates) as MaxTask
  }
  updateFlushTask.cancel()
  updateFlushTask.schedule(UPDATE_FLUSH_MS)
}

function flushUpdates() {
  if (pendingUpdates.length === 0) return
  osc('/clips/update', pendingUpdates)
  pendingUpdates = []
}

// ---------------------------------------------------------------------------
// Scene Observer Creation / Teardown
// ---------------------------------------------------------------------------

function createSceneObserver(sceneIdx: number): SceneInfo {
  const sid = sceneIds[sceneIdx]

  cellInitApi.id = sid
  const name = dequote(cellInitApi.get('name').toString())
  const color = colorHex(cellInitApi.get('color'))

  const info: SceneInfo = {
    sceneIdx: sceneIdx,
    nameApi: null,
    colorApi: null,
    name: name,
    color: color,
  }

  info.nameApi = obsById(sid, function (args: any[]) {
    if (!info.nameApi) return
    if (args[0] !== 'name') return
    info.name = dequote(args[1])
    scheduleSceneInfo()
  }, 'name')

  info.colorApi = obsById(sid, function (args: any[]) {
    if (!info.colorApi) return
    if (args[0] !== 'color') return
    info.color = colorHex(args[1])
    scheduleSceneInfo()
  }, 'color')

  return info
}

function teardownSceneObserver(info: SceneInfo) {
  if (info.nameApi) {
    detach(info.nameApi)
    info.nameApi = null
  }
  if (info.colorApi) {
    detach(info.colorApi)
    info.colorApi = null
  }
}

// ---------------------------------------------------------------------------
// Teardown helpers
// ---------------------------------------------------------------------------

function teardownAllCells() {
  for (const key in cellObservers) {
    teardownCellObservers(cellObservers[key])
  }
  cellObservers = {}
}

function teardownAllScenes() {
  for (const key in sceneObservers) {
    teardownSceneObserver(sceneObservers[parseInt(key)])
  }
  sceneObservers = {}
}

function teardownAll() {
  if (observerBatchTask) observerBatchTask.cancel()
  pendingObserverKeys = []
  teardownAllCells()
  teardownAllTrackPlay()
  teardownAllScenes()
  pendingUpdates = []
  if (updateFlushTask) {
    updateFlushTask.cancel()
  }
}

// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------

// Observers are kept WARM across scrolls — not torn down the instant a cell/
// track/scene leaves the viewport — so scroll-back is instant with low GC churn
// (intent of commit 94e86ea, "Accumulate observers instead of recycling on
// scroll"). To keep the resident count BOUNDED (essential for multiplayer: N
// device instances accumulate against the SAME Live set and could otherwise
// approach Live's LiveAPI observer ceiling and freeze change notifications), we
// keep only a WARM_MARGIN buffer around the viewport and EVICT observers outside
// it. So the count stays ~(1+2*WARM_MARGIN)^2 × viewport regardless of grid size
// or scroll distance. (Full teardown still happens on a visible-tracks-list or
// scene-count change.)
function applyWindow() {
  if (leftTrack < 0 || topScene < 0) return

  // Clamp the window to the actual track/scene counts. The app may request
  // a window larger than the live set (e.g. a 4x8 viewport when only 3
  // tracks or 5 scenes exist); without clamping we'd construct LiveAPIs on
  // non-existent slots, which v8 logs as 'invalid path' / 'no valid object'.
  const visRight = Math.min(rightTrack, trackPaths.length)
  const visBottom = Math.min(bottomScene, totalScenes)

  // Warm region = viewport expanded by WARM_MARGIN on each side, clamped to the
  // grid. Observers inside it are kept; everything outside is evicted below.
  const marginCols = Math.ceil((rightTrack - leftTrack) * WARM_MARGIN)
  const marginRows = Math.ceil((bottomScene - topScene) * WARM_MARGIN)
  const warmLeft = Math.max(0, leftTrack - marginCols)
  const warmRight = Math.min(trackPaths.length, rightTrack + marginCols)
  const warmTop = Math.max(0, topScene - marginRows)
  const warmBottom = Math.min(totalScenes, bottomScene + marginRows)

  // --- Track play observers — create BEFORE cell observers so deriveCellState can use them ---
  for (let col = leftTrack; col < visRight; col++) {
    if (!trackPlayObservers[col]) {
      trackPlayObservers[col] = createTrackPlayObservers(col)
    }
  }

  // --- Scene observers ---
  for (let s = topScene; s < visBottom; s++) {
    if (!sceneObservers[s]) {
      sceneObservers[s] = createSceneObserver(s)
    }
  }

  // --- Cell state + observers ---
  if (observerBatchTask) observerBatchTask.cancel()
  pendingObserverKeys = []

  for (let col = leftTrack; col < visRight; col++) {
    for (let row = topScene; row < visBottom; row++) {
      const key = cellKey(col, row)
      if (!cellObservers[key]) {
        cellObservers[key] = readCellState(col, row)
        pendingObserverKeys.push(key)
      }
    }
  }

  // Evict observers outside the warm region (keeps the resident count bounded).
  for (const key in cellObservers) {
    const obs = cellObservers[key]
    if (
      obs.trackIdx < warmLeft ||
      obs.trackIdx >= warmRight ||
      obs.sceneIdx < warmTop ||
      obs.sceneIdx >= warmBottom
    ) {
      teardownCellObservers(obs)
      delete cellObservers[key]
    }
  }
  for (const k in trackPlayObservers) {
    const col = +k
    if (col < warmLeft || col >= warmRight) {
      teardownTrackPlayObservers(trackPlayObservers[col])
      delete trackPlayObservers[col]
    }
  }
  for (const k in sceneObservers) {
    const row = +k
    if (row < warmTop || row >= warmBottom) {
      teardownSceneObserver(sceneObservers[row])
      delete sceneObservers[row]
    }
  }

  sendFullGrid()
  sendTrackInfo()
  sendSceneInfo()
  sendSelectedScene()

  if (pendingObserverKeys.length > 0) {
    scheduleObserverBatch()
  }
}

// ---------------------------------------------------------------------------
// Send State
// ---------------------------------------------------------------------------

function sendFullGrid() {
  if (leftTrack < 0 || topScene < 0) return

  const visBottom = Math.min(bottomScene, totalScenes)
  const rows: any[][] = []

  for (let row = topScene; row < visBottom; row++) {
    const rowData: any[] = []
    for (let col = leftTrack; col < rightTrack; col++) {
      const key = cellKey(col, row)
      const obs = cellObservers[key]
      if (obs) {
        const entry: any = { s: obs.cell.state }
        if (obs.cell.name) entry.n = obs.cell.name
        if (obs.cell.color) entry.c = obs.cell.color
        entry.hsb = obs.cell.hsb
        if (trackIsGroup[col]) {
          entry.ps = obs.cell.ps
          entry.hc = obs.cell.hc
        }
        rowData.push(entry)
      } else {
        rowData.push({ s: CLIP_EMPTY })
      }
    }
    rows.push(rowData)
  }

  osc('/clips/grid', { left: leftTrack, top: topScene, clips: rows })
}

function sendTrackInfo() {
  if (leftTrack < 0) return

  const tracks: any[] = []
  for (let col = leftTrack; col < rightTrack; col++) {
    if (col < trackPaths.length) {
      cellInitApi.id = trackIds[col]
      tracks.push({
        n: dequote(cellInitApi.get('name').toString()),
        c: colorHex(cellInitApi.get('color')),
      })
    }
  }
  osc('/clips/trackInfo', { left: leftTrack, tracks: tracks })
}

function scheduleSceneInfo() {
  if (!sceneInfoTask) {
    sceneInfoTask = new Task(sendSceneInfo) as MaxTask
  }
  sceneInfoTask.cancel()
  sceneInfoTask.schedule(UPDATE_FLUSH_MS)
}

function buildSceneCache() {
  sceneCache = []
  for (let row = 0; row < totalScenes; row++) {
    cellInitApi.id = sceneIds[row]
    sceneCache.push({
      n: dequote(cellInitApi.get('name').toString()),
      c: colorHex(cellInitApi.get('color')),
    })
  }
}

function sendSceneInfo() {
  if (totalScenes <= 0) return

  // Build cache if stale
  if (sceneCache.length !== totalScenes) {
    buildSceneCache()
  }

  const scenes: any[] = []
  for (let row = 0; row < totalScenes; row++) {
    // Use observer data if available, otherwise cached data
    const info = sceneObservers[row]
    const name = info ? info.name : sceneCache[row].n
    const color = info ? info.color : sceneCache[row].c
    const scene: any = { n: name }
    if (color && color !== '000000') scene.c = color
    scenes.push(scene)
  }

  osc('/clips/scenes', scenes)
}

// ---------------------------------------------------------------------------
// Incoming: clipView
// ---------------------------------------------------------------------------

function setupWindow(left: number, top: number, right: number, bottom: number) {
  ensureApis()

  leftTrack = left
  topScene = top
  rightTrack = right
  bottomScene = bottom

  // Guard: prevent watcher callbacks from running teardown+applyWindow during setup
  settingUp = true

  // Set up watchers on first activation
  if (!sceneCountWatcher) {
    sceneCountWatcher = new LiveAPI(onSceneCountChange, 'live_set')
    sceneCountWatcher.property = 'scenes'
  }
  if (!selectedSceneApi) {
    selectedSceneApi = new LiveAPI(
      onSelectedSceneChange,
      'live_set view selected_scene'
    )
    selectedSceneApi.mode = 1
    selectedSceneApi.property = 'id'
  }

  settingUp = false

  totalScenes = querySceneCount()

  applyWindow()
}

function doRefresh(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
  if (leftTrack < 0) return
  setupWindow(leftTrack, topScene, rightTrack, bottomScene)
}

function requestClipsScenes() {
  sendSceneInfo()
}

function clipView(jsonStr: string) {
  const parsed = JSON.parse(jsonStr.toString())
  const left = parseInt(parsed[0].toString())
  const top = parseInt(parsed[1].toString())
  const right = parseInt(parsed[2].toString())
  const bottom = parseInt(parsed[3].toString())

  if (left === right || top === bottom) {
    // Zero-size window — don't teardown observers so actions still work
    // when the user returns to the clips page
    if (viewTask) {
      viewTask.cancel()
      viewTask.freepeer()
      viewTask = null
    }
    return
  }

  if (viewTask) {
    viewTask.cancel()
    viewTask.freepeer()
  }
  viewTask = new Task(function () {
    setupWindow(left, top, right, bottom)
  }) as MaxTask
  viewTask.schedule(VIEW_DEBOUNCE_MS)
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function clipLaunch(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const trackIdx = parseInt(parsed[0].toString())
  const sceneIdx = parseInt(parsed[1].toString())

  if (trackIdx < 0 || trackIdx >= trackPaths.length) return
  if (sceneIdx < 0 || sceneIdx >= totalScenes) return

  const selectOnLaunch = shouldSelectOnLaunch()
  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  scratchApi.call('fire')
  if (selectOnLaunch) selectClipSlot(trackIdx, sceneIdx)
}

function clipRecord(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const trackIdx = parseInt(parsed[0].toString())
  const sceneIdx = parseInt(parsed[1].toString())

  if (trackIdx < 0 || trackIdx >= trackPaths.length) return
  if (sceneIdx < 0 || sceneIdx >= totalScenes) return

  const selectOnLaunch = shouldSelectOnLaunch()
  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  scratchApi.call('fire')
  if (selectOnLaunch) selectClipSlot(trackIdx, sceneIdx)
}

function clipDelete(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const trackIdx = parseInt(parsed[0].toString())
  const sceneIdx = parseInt(parsed[1].toString())

  if (trackIdx < 0 || trackIdx >= trackPaths.length) return
  if (sceneIdx < 0 || sceneIdx >= totalScenes) return

  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  scratchApi.call('delete_clip')
}

function clipSetStopButton(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const trackIdx = parseInt(parsed[0].toString())
  const sceneIdx = parseInt(parsed[1].toString())
  const val = parseInt(parsed[2].toString())

  if (trackIdx < 0 || trackIdx >= trackPaths.length) return
  if (sceneIdx < 0 || sceneIdx >= totalScenes) return

  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  scratchApi.set('has_stop_button', val ? 1 : 0)
}

function clipStop(trackIdx: number) {
  ensureApis()
  const idx = parseInt(trackIdx.toString())
  if (idx < 0 || idx >= trackPaths.length) return

  scratchApi.path = trackPaths[idx]
  scratchApi.call('stop_all_clips')
}

function stopAll() {
  ensureApis()
  scratchApi.path = 'live_set'
  scratchApi.call('stop_all_clips')
}

function sceneLaunch(sceneIdx: number) {
  ensureApis()
  const idx = parseInt(sceneIdx.toString())
  if (idx < 0 || idx >= totalScenes) return

  const selectOnLaunch = shouldSelectOnLaunch()
  scratchApi.path = 'live_set scenes ' + idx
  scratchApi.call('fire')
  if (selectOnLaunch) {
    viewApi.set('selected_scene', ['id', parseInt(scratchApi.id.toString())])
  }
}

function sceneRename(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const idx = parseInt(parsed[0].toString())
  const name = parsed[1].toString()

  if (idx < 0 || idx >= totalScenes) return

  scratchApi.path = 'live_set scenes ' + idx
  scratchApi.set('name', name)
}

function clipColor(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const trackIdx = parseInt(parsed[0].toString())
  const sceneIdx = parseInt(parsed[1].toString())
  const hexStr = parsed[2].toString()

  if (trackIdx < 0 || trackIdx >= trackPaths.length) return
  if (sceneIdx < 0 || sceneIdx >= totalScenes) return

  // Pre-validate on the slot to avoid v8's noisy 'invalid path' warning when
  // the slot is empty (race with the app's view state).
  const slotPath = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  scratchApi.path = slotPath
  if (!parseInt(scratchApi.get('has_clip').toString())) return
  scratchApi.path = slotPath + ' clip'
  scratchApi.set('color', parseInt(hexStr, 16))
}

function sceneColor(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const idx = parseInt(parsed[0].toString())
  const hexStr = parsed[1].toString()

  if (idx < 0 || idx >= totalScenes) return

  scratchApi.path = 'live_set scenes ' + idx
  scratchApi.set('color', parseInt(hexStr, 16))
}

function clipsUpdate(jsonStr: string) {
  ensureApis()
  let updates = JSON.parse(jsonStr.toString())
  if (!Array.isArray(updates)) updates = [updates]

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i]
    const trackIdx = parseInt(u.t.toString())
    const sceneIdx = parseInt(u.sc.toString())
    if (trackIdx < 0 || trackIdx >= trackPaths.length) continue
    if (sceneIdx < 0 || sceneIdx >= totalScenes) continue

    // Pre-validate on the slot to avoid v8's noisy 'invalid path' warning
    // and skip empty slots in one check.
    const slotPath = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
    scratchApi.path = slotPath
    if (!parseInt(scratchApi.get('has_clip').toString())) continue
    scratchApi.path = slotPath + ' clip'

    if (u.n != null) scratchApi.set('name', u.n.toString())
  }
}

function captureScene() {
  ensureApis()
  scratchApi.path = 'live_set'
  scratchApi.call('capture_and_insert_scene')
}

const routes: Route[] = [
  { prefix: '/requestClipsScenes', parse: 'bare', fn: requestClipsScenes },
  { prefix: '/clipView', parse: 'val', fn: clipView },
  { prefix: '/clipLaunch', parse: 'val', fn: clipLaunch },
  { prefix: '/clipRecord', parse: 'val', fn: clipRecord },
  { prefix: '/clipDelete', parse: 'val', fn: clipDelete },
  { prefix: '/clipSetStopButton', parse: 'val', fn: clipSetStopButton },
  { prefix: '/clipStop', parse: 'val', fn: clipStop },
  { prefix: '/clipColor', parse: 'val', fn: clipColor },
  { prefix: '/clips/update', parse: 'val', fn: clipsUpdate },
  { prefix: '/sceneLaunch', parse: 'val', fn: sceneLaunch },
  { prefix: '/sceneRename', parse: 'val', fn: sceneRename },
  { prefix: '/sceneColor', parse: 'val', fn: sceneColor },
  { prefix: '/stopAll', parse: 'bare', fn: stopAll },
  { prefix: '/captureScene', parse: 'bare', fn: captureScene },
]

log('reloaded k4-clipView')

// init() re-pushes the grid on refresh (no-op until a window is set).
export { routes, visibleTracks }
export { doRefresh as init }
