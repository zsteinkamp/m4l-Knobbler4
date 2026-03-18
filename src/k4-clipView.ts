import { cleanArr, detach, dequote, logFactory, osc, sendChunkedData } from './utils'
import config from './config'
import {
  noFn,
  INLET_MSGS,
  OUTLET_OSC,
  TYPE_RETURN,
  TYPE_MAIN,
  TYPE_GROUP,
} from './consts'

autowatch = 1
inlets = 1
outlets = 1

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Messages from router')
setoutletassist(OUTLET_OSC, 'OSC messages to [udpsend]')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLIP_EMPTY = 0
const CLIP_STOPPED = 1
const CLIP_PLAYING = 2
const CLIP_TRIGGERED = 3
const CLIP_RECORDING = 4
const CLIP_ARMED = 5

const OBSERVER_BUFFER = 2
const VIEW_DEBOUNCE_MS = 250
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

function selectClipSlot(trackIdx: number, sceneIdx: number) {
  viewApi.set('selected_track', ['id', trackIds[trackIdx]])
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
  const d = new Dict('visibleTracksDict')
  const raw = d.get('tracks')
  const tracks = JSON.parse(raw.toString())
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
  const sceneIds = cleanArr(scratchApi.get('scenes'))
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
  const trackPath = trackPaths[trackIdx]

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

  // Read initial values
  cellInitApi.path = trackPath
  tObs.playingSlot = parseInt(cellInitApi.get('playing_slot_index').toString())
  tObs.firedSlot = parseInt(cellInitApi.get('fired_slot_index').toString())
  const canBeArmed = !!parseInt(cellInitApi.get('can_be_armed').toString())
  if (canBeArmed) {
    tObs.armed = !!parseInt(cellInitApi.get('arm').toString())
  }

  // Observer: playing_slot_index
  tObs.playingSlotApi = new LiveAPI(function (args: any[]) {
    if (!tObs.playingSlotApi) return
    if (args[0] !== 'playing_slot_index') return
    const newSlot = parseInt(args[1])
    const oldSlot = tObs.playingSlot
    tObs.playingSlot = newSlot

    // Update old slot (was playing, now stopped or empty)
    if (oldSlot >= 0) updateCellFromTrack(trackIdx, oldSlot)
    // Update new slot (now playing)
    if (newSlot >= 0) updateCellFromTrack(trackIdx, newSlot)
  }, trackPath)
  tObs.playingSlotApi.property = 'playing_slot_index'

  // Observer: fired_slot_index
  tObs.firedSlotApi = new LiveAPI(function (args: any[]) {
    if (!tObs.firedSlotApi) return
    if (args[0] !== 'fired_slot_index') return
    const newSlot = parseInt(args[1])
    const oldSlot = tObs.firedSlot
    tObs.firedSlot = newSlot

    // Update old triggered slot (no longer triggered)
    if (oldSlot >= 0) updateCellFromTrack(trackIdx, oldSlot)
    // Update new triggered slot
    if (newSlot >= 0) updateCellFromTrack(trackIdx, newSlot)
  }, trackPath)
  tObs.firedSlotApi.property = 'fired_slot_index'

  // Observer: arm (only for tracks that can be armed)
  if (canBeArmed) {
    tObs.armApi = new LiveAPI(function (args: any[]) {
      if (!tObs.armApi) return
      if (args[0] !== 'arm') return
      const newArmed = !!parseInt(args[1])
      if (newArmed === tObs.armed) return
      tObs.armed = newArmed
      // Update all empty cells on this track (armed state changes their display)
      updateAllCellsOnTrack(trackIdx)
    }, trackPath)
    tObs.armApi.property = 'arm'
  }

  // Observer: track name
  tObs.nameApi = new LiveAPI(function (args: any[]) {
    if (!tObs.nameApi) return
    if (args[0] !== 'name') return
    osc('/clips/trackInfo', JSON.stringify({ t: tObs.trackIdx, n: dequote(args[1]) }))
  }, trackPath)
  tObs.nameApi.property = 'name'

  // Observer: track color
  tObs.colorApi = new LiveAPI(function (args: any[]) {
    if (!tObs.colorApi) return
    if (args[0] !== 'color') return
    osc('/clips/trackInfo', JSON.stringify({ t: tObs.trackIdx, c: colorHex(args[1]) }))
  }, trackPath)
  tObs.colorApi.property = 'color'

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

// Called when arm changes — update all cells on this track in the observer window
function updateAllCellsOnTrack(trackIdx: number) {
  const obsTop = Math.max(0, topScene - OBSERVER_BUFFER)
  const obsBottom = Math.min(totalScenes, bottomScene + OBSERVER_BUFFER)
  for (let row = obsTop; row < obsBottom; row++) {
    updateCellFromTrack(trackIdx, row)
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
  const slotPath = trackPaths[col] + ' clip_slots ' + row

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

  cellInitApi.path = slotPath
  const hasClip = !!parseInt(cellInitApi.get('has_clip').toString())
  obs.hasClip = hasClip
  cell.state = deriveCellState(hasClip, col, row)
  cell.hsb = parseInt(cellInitApi.get('has_stop_button').toString()) ? 1 : 0

  if (hasClip) {
    cellInitApi.path = slotPath + ' clip'
    cell.name = dequote(cellInitApi.get('name').toString())
    cell.color = colorHex(cellInitApi.get('color'))
    if (parseInt(cellInitApi.get('is_recording').toString())) {
      cell.state = CLIP_RECORDING
    }
  }

  if (trackIsGroup[col]) {
    cellInitApi.path = slotPath
    cell.ps = parseInt(cellInitApi.get('playing_status').toString()) || 0
    cell.hc = parseInt(cellInitApi.get('controls_other_clips').toString()) ? 1 : 0
  }

  return obs
}

// Attach LiveAPI observers to a cell (expensive — called lazily in batches)
function attachCellObservers(obs: CellObservers) {
  if (obs.hasClipApi) return // already attached
  const slotPath = trackPaths[obs.trackIdx] + ' clip_slots ' + obs.sceneIdx

  // has_stop_button
  obs.hasStopButtonApi = new LiveAPI(function (args: any[]) {
    if (!obs.hasStopButtonApi) return
    if (args[0] !== 'has_stop_button') return
    const newHsb = parseInt(args[1]) ? 1 : 0
    if (newHsb === obs.cell.hsb) return
    obs.cell.hsb = newHsb
    if (isVisible(obs.trackIdx, obs.sceneIdx)) {
      queueFullUpdate(obs)
    }
  }, slotPath)
  obs.hasStopButtonApi.property = 'has_stop_button'

  // Group track: playing_status and controls_other_clips
  if (trackIsGroup[obs.trackIdx]) {
    obs.playingStatusApi = new LiveAPI(function (args: any[]) {
      if (!obs.playingStatusApi) return
      if (args[0] !== 'playing_status') return
      const newPs = parseInt(args[1]) || 0
      if (newPs === obs.cell.ps) return
      obs.cell.ps = newPs
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, slotPath)
    obs.playingStatusApi.property = 'playing_status'

    obs.controlsOtherClipsApi = new LiveAPI(function (args: any[]) {
      if (!obs.controlsOtherClipsApi) return
      if (args[0] !== 'controls_other_clips') return
      const newHc = parseInt(args[1]) ? 1 : 0
      if (newHc === obs.cell.hc) return
      obs.cell.hc = newHc
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, slotPath)
    obs.controlsOtherClipsApi.property = 'controls_other_clips'
  }

  // has_clip
  obs.hasClipApi = new LiveAPI(function (args: any[]) {
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
  }, slotPath)
  obs.hasClipApi.property = 'has_clip'

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
  const slotPath = trackPaths[obs.trackIdx] + ' clip_slots ' + obs.sceneIdx
  const clipPath = slotPath + ' clip'

  // Read clip info via cellInitApi (not scratchApi — this can be called from observer callbacks)
  cellInitApi.path = clipPath
  obs.cell.name = dequote(cellInitApi.get('name').toString())
  obs.cell.color = colorHex(cellInitApi.get('color'))
  if (parseInt(cellInitApi.get('is_recording').toString())) {
    obs.cell.state = CLIP_RECORDING
  }

  if (!obs.clipApi) {
    obs.clipApi = new LiveAPI(function (args: any[]) {
      if (!obs.clipApi) return
      if (args[0] !== 'name') return
      obs.cell.name = dequote(args[1])
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, clipPath)
    obs.clipApi.property = 'name'
  } else {
    obs.clipApi.path = clipPath
    obs.clipApi.property = 'name'
  }

  if (!obs.clipRecordingApi) {
    obs.clipRecordingApi = new LiveAPI(function (args: any[]) {
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
    }, clipPath)
    obs.clipRecordingApi.property = 'is_recording'
  } else {
    obs.clipRecordingApi.path = clipPath
    obs.clipRecordingApi.property = 'is_recording'
  }

  if (!obs.clipColorApi) {
    obs.clipColorApi = new LiveAPI(function (args: any[]) {
      if (!obs.clipColorApi) return
      if (args[0] !== 'color') return
      obs.cell.color = colorHex(args[1])
      if (isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    }, clipPath)
    obs.clipColorApi.property = 'color'
  } else {
    obs.clipColorApi.path = clipPath
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
  osc('/clips/update', JSON.stringify(pendingUpdates))
  pendingUpdates = []
}

// ---------------------------------------------------------------------------
// Scene Observer Creation / Teardown
// ---------------------------------------------------------------------------

function createSceneObserver(sceneIdx: number): SceneInfo {
  const scenePath = 'live_set scenes ' + sceneIdx

  cellInitApi.path = scenePath
  const name = dequote(cellInitApi.get('name').toString())
  const color = colorHex(cellInitApi.get('color'))

  const info: SceneInfo = {
    sceneIdx: sceneIdx,
    nameApi: null,
    colorApi: null,
    name: name,
    color: color,
  }

  info.nameApi = new LiveAPI(function (args: any[]) {
    if (!info.nameApi) return
    if (args[0] !== 'name') return
    info.name = dequote(args[1])
    scheduleSceneInfo()
  }, scenePath)
  info.nameApi.property = 'name'

  info.colorApi = new LiveAPI(function (args: any[]) {
    if (!info.colorApi) return
    if (args[0] !== 'color') return
    info.color = colorHex(args[1])
    scheduleSceneInfo()
  }, scenePath)
  info.colorApi.property = 'color'

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

function applyWindow() {
  if (leftTrack < 0 || topScene < 0) return

  const obsLeft = Math.max(0, leftTrack - OBSERVER_BUFFER)
  const obsRight = Math.min(trackIds.length, rightTrack + OBSERVER_BUFFER)
  const obsTop = Math.max(0, topScene - OBSERVER_BUFFER)
  const obsBottom = Math.min(totalScenes, bottomScene + OBSERVER_BUFFER)

  // --- Track play observers (one per track in observer window) ---
  const newTrackSet: Record<number, boolean> = {}
  for (let col = obsLeft; col < obsRight; col++) {
    newTrackSet[col] = true
  }

  // Remove old
  for (const key in trackPlayObservers) {
    const idx = parseInt(key)
    if (!newTrackSet[idx]) {
      teardownTrackPlayObservers(trackPlayObservers[idx])
      delete trackPlayObservers[idx]
    }
  }

  // Add new — create BEFORE cell observers so deriveCellState can use them
  for (let col = obsLeft; col < obsRight; col++) {
    if (!trackPlayObservers[col]) {
      trackPlayObservers[col] = createTrackPlayObservers(col)
    }
  }

  // --- Scene observers (visible window + buffer only) ---
  const newSceneSet: Record<number, boolean> = {}
  for (let s = obsTop; s < obsBottom; s++) {
    newSceneSet[s] = true
  }

  // Remove old
  for (const key in sceneObservers) {
    const idx = parseInt(key)
    if (!newSceneSet[idx]) {
      teardownSceneObserver(sceneObservers[idx])
      delete sceneObservers[idx]
    }
  }

  // Add new
  for (let s = obsTop; s < obsBottom; s++) {
    if (!sceneObservers[s]) {
      sceneObservers[s] = createSceneObserver(s)
    }
  }

  // --- Cell state + observers ---
  // Cancel any pending observer batch from a previous window
  if (observerBatchTask) observerBatchTask.cancel()
  pendingObserverKeys = []

  const newCellSet: Record<string, boolean> = {}
  for (let col = obsLeft; col < obsRight; col++) {
    for (let row = obsTop; row < obsBottom; row++) {
      newCellSet[cellKey(col, row)] = true
    }
  }

  // Remove old
  for (const key in cellObservers) {
    if (!newCellSet[key]) {
      teardownCellObservers(cellObservers[key])
      delete cellObservers[key]
    }
  }

  // Read initial state for new cells (fast — no LiveAPI objects created)
  for (let col = obsLeft; col < obsRight; col++) {
    for (let row = obsTop; row < obsBottom; row++) {
      const key = cellKey(col, row)
      if (!cellObservers[key]) {
        cellObservers[key] = readCellState(col, row)
        pendingObserverKeys.push(key)
      }
    }
  }

  // Send full grid, track info, and scene info for visible range
  sendFullGrid()
  sendTrackInfo()
  sendSceneInfo()
  sendSelectedScene()

  // Create observers lazily in batches (after grid is sent)
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

  osc(
    '/clips/grid',
    JSON.stringify({ left: leftTrack, top: topScene, clips: rows })
  )
}

function sendTrackInfo() {
  if (leftTrack < 0) return

  const tracks: any[] = []
  for (let col = leftTrack; col < rightTrack; col++) {
    if (col < trackPaths.length) {
      cellInitApi.path = trackPaths[col]
      tracks.push({
        n: dequote(cellInitApi.get('name').toString()),
        c: colorHex(cellInitApi.get('color')),
      })
    }
  }
  osc('/clips/trackInfo', JSON.stringify({ left: leftTrack, tracks: tracks }))
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
    cellInitApi.path = 'live_set scenes ' + row
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

  sendChunkedData('/clips/scenes', scenes)
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

function refresh() {
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

  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  scratchApi.call('fire', null)
  selectClipSlot(trackIdx, sceneIdx)
}

function clipRecord(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const trackIdx = parseInt(parsed[0].toString())
  const sceneIdx = parseInt(parsed[1].toString())

  if (trackIdx < 0 || trackIdx >= trackPaths.length) return
  if (sceneIdx < 0 || sceneIdx >= totalScenes) return

  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  scratchApi.call('fire', null)
  selectClipSlot(trackIdx, sceneIdx)
}

function clipDelete(jsonStr: string) {
  ensureApis()
  const parsed = JSON.parse(jsonStr.toString())
  const trackIdx = parseInt(parsed[0].toString())
  const sceneIdx = parseInt(parsed[1].toString())

  if (trackIdx < 0 || trackIdx >= trackPaths.length) return
  if (sceneIdx < 0 || sceneIdx >= totalScenes) return

  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx
  scratchApi.call('delete_clip', null)
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
  scratchApi.call('stop_all_clips', null)
}

function stopAll() {
  ensureApis()
  scratchApi.path = 'live_set'
  scratchApi.call('stop_all_clips', null)
}

function sceneLaunch(sceneIdx: number) {
  ensureApis()
  const idx = parseInt(sceneIdx.toString())
  if (idx < 0 || idx >= totalScenes) return

  scratchApi.path = 'live_set scenes ' + idx
  scratchApi.call('fire', null)
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

  scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx + ' clip'
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

    scratchApi.path = trackPaths[trackIdx] + ' clip_slots ' + sceneIdx + ' clip'
    if (parseInt(scratchApi.id.toString()) <= 0) continue

    if (u.n != null) scratchApi.set('name', u.n.toString())
  }
}

function captureScene() {
  ensureApis()
  scratchApi.path = 'live_set'
  scratchApi.call('capture_and_insert_scene', null)
}

log('reloaded k4-clipView')

// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
