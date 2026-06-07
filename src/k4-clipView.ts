import {
  cleanArr,
  detach,
  dequote,
  getVisibleTracksList,
  loadSetting,
  logFactory,
  osc,
  setOscSink,
} from './utils'
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
  playingClipId: number // id of the clip at playingSlot, -1 if none (drives /clips/progress polling)
  playCount: number // loop iterations of the playing clip since launch (left of the pie)
  clipBeats: number // loop length of the playing clip in beats (right of the pie)
  lastFrac: number // last progress fraction, for loop-wrap detection
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

// Free pools of PARKED observer structs (all observers unsubscribed). On scroll,
// observers leaving the warm region are parked here and RE-POINTED onto cells/
// tracks/scenes entering it instead of being torn down — teardown leaks ~6
// symbols per observer, re-point is free (see CLAUDE.md). Real teardown happens
// only on a full rebuild. Caps bound the pools; overflow (rare) is torn down.
let cellPool: CellObservers[] = []
let trackPlayPool: TrackPlayObservers[] = []
let scenePool: SceneInfo[] = []
const CELL_POOL_CAP = 512
const TRACK_POOL_CAP = 128
const SCENE_POOL_CAP = 128
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
// Clip progress (the per-track "phase pie" — mimics Live's track-status
// playing-position indicator next to the clip-stop button)
// ---------------------------------------------------------------------------
// Only ONE clip plays per track at a time, so progress is per-track: we poll
// playing_position on each visible, playing, non-group track's clip and stream a
// compact /clips/progress [{t,f}] (f = 0..1000). Polling reads are numeric →
// symbol-free (CLAUDE.md), so this adds NO observers — no churn. The poll only
// runs while the page has a live window AND the connected app advertised `prog`
// AND at least one track is playing; it self-stops otherwise.
const PROGRESS_POLL_MS = 50
let progressApi: LiveAPI = null // scratchpad for reading clip playing_position
let progressTask: MaxTask = null
let progressRunning = false
let progressPaused = false // true while the clips page is hidden (zero-size window)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureApis() {
  if (!scratchApi) scratchApi = new LiveAPI(noFn, 'live_set')
  if (!cellInitApi) cellInitApi = new LiveAPI(noFn, 'live_set')
  if (!viewApi) viewApi = new LiveAPI(noFn, 'live_set view')
  if (!progressApi) progressApi = new LiveAPI(noFn, 'live_set')
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

// Re-point an existing observer to a new object id + property — free (no path
// interning, no teardown leak). Basis of the observer pools below.
function reArm(api: LiveAPI, id: number, prop: string) {
  api.id = id
  api.property = prop
}

// Reuse an observer if present (re-point — free), else create one bound by id.
// The callback `cb` is used only on first creation; on reuse the existing api's
// callback (closed over the persistent struct) is kept.
function ensureObs(api: LiveAPI, id: number, cb: any, prop: string): LiveAPI {
  if (api) {
    reArm(api, id, prop)
    return api
  }
  return obsById(id, cb, prop)
}

// Unsubscribe an observer without tearing it down (property '' — free; teardown
// leaks ~6 symbols, see CLAUDE.md). Keeps the object alive for re-pointing.
function disableObs(api: LiveAPI) {
  if (api) api.property = ''
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
  viewApi.set('highlighted_clip_slot', [
    'id',
    parseInt(scratchApi.id.toString()),
  ])
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
// Clip progress polling
// ---------------------------------------------------------------------------

// The connected app advertises `prog` in its handshake capabilities (saved to
// the shared k4Runtime dict by k4-system). Gate the whole feature on it so we
// never poll/stream for a client that can't render the pie.
function appSupportsProgress(): boolean {
  const caps = loadSetting('clientCapabilities')
  return !!caps && ('' + caps).indexOf('prog') !== -1
}

// Resolve (and cache on the struct) the id of the clip currently playing on this
// track, or -1 when nothing is playing / it's a group track. Read via the
// observer-safe scratchpad so it's callable from the playing_slot_index callback.
function setTrackPlayingClip(tObs: TrackPlayObservers, slot: number) {
  if (slot < 0 || trackIsGroup[tObs.trackIdx]) {
    tObs.playingClipId = -1
    return
  }
  cellInitApi.id = slotId(tObs.trackIdx, slot)
  const clip = cleanArr(cellInitApi.get('clip'))
  const clipId = clip.length && +clip[0] > 0 ? clip[0] : -1
  tObs.playingClipId = clipId
  if (clipId < 0) return

  // Cache the loop length in beats and (re)start the play counter — these feed
  // the numbers flanking the pie (left = play count, right = beats). Clip.length
  // is already the loop length in beats.
  cellInitApi.id = clipId
  tObs.clipBeats = parseFloat(cellInitApi.get('length').toString()) || 0
  tObs.playCount = 1
  tObs.lastFrac = 0
  sendPlayInfo(tObs)
}

// Low-frequency companion to /clips/progress: the play count (left of the pie)
// and loop length in beats (right). Sent on launch and on each loop wrap only —
// NOT every poll — so it never forces the page to re-render on the pie's hot path.
function sendPlayInfo(tObs: TrackPlayObservers) {
  if (leftTrack < 0) return
  osc('/clips/playInfo', {
    t: tObs.trackIdx,
    pc: tObs.playCount,
    b: Math.round(tObs.clipBeats * 100) / 100,
  })
}

function ensureProgressRunning() {
  if (progressRunning || progressPaused) return
  if (leftTrack < 0) return
  if (!appSupportsProgress()) return
  if (!progressTask) progressTask = new Task(progressTick) as MaxTask
  progressRunning = true
  progressTask.schedule(PROGRESS_POLL_MS)
}

// Poll each visible playing track's clip position and stream a compact batch.
// Self-stops (stops rescheduling) when nothing is playing; restarts via
// ensureProgressRunning when the next clip launches.
function progressTick() {
  progressRunning = false
  if (progressPaused || leftTrack < 0) return

  const batch: { t: number; f: number }[] = []
  for (const k in trackPlayObservers) {
    const tObs = trackPlayObservers[k]
    if (tObs.playingClipId < 0) continue
    progressApi.id = tObs.playingClipId
    const len = parseFloat(progressApi.get('length').toString())
    if (!(len > 0)) continue
    const pos = parseFloat(progressApi.get('playing_position').toString())
    const loopStart = parseFloat(progressApi.get('loop_start').toString())
    // Fraction within the current loop iteration, wrapped to [0,1).
    let f = (pos - loopStart) / len
    f = f - Math.floor(f)
    // A fraction that jumps back near 0 from near 1 = the loop wrapped → bump
    // the play counter and push the (low-frequency) playInfo.
    if (f + 0.5 < tObs.lastFrac) {
      tObs.playCount++
      sendPlayInfo(tObs)
    }
    tObs.lastFrac = f
    batch.push({ t: tObs.trackIdx, f: Math.round(f * 1000) })
  }

  if (batch.length === 0) return // nothing playing → stop until next launch
  osc('/clips/progress', batch)
  progressRunning = true
  progressTask.schedule(PROGRESS_POLL_MS)
}

// Per-track delta: a quantized clip-stop is pending (sp=1) or cleared (sp=0).
// The app flashes that track's stop button while pending. Cheap + event-driven
// (only fires when a stop is armed or lands), so it streams regardless of `prog`.
function sendStopPending(trackIdx: number, pending: boolean) {
  if (leftTrack < 0) return
  osc('/clips/stopPending', { t: trackIdx, sp: pending ? 1 : 0 })
}

// ---------------------------------------------------------------------------
// Track List
// ---------------------------------------------------------------------------

function visibleTracks() {
  const tracks = getVisibleTracksList()
  if (!tracks || tracks.length === 0) return
  const oldTrackIds = trackIds // capture before rebuild to diff which cols moved
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
  if (leftTrack < 0 || settingUp) {
    trackSlotIds = {}
    return
  }
  // Only re-point observers for COLUMNS whose track actually changed (appending a
  // track leaves earlier columns untouched); keep the rest. applyWindow re-points
  // the parked ones. Scenes are unaffected by track changes, so untouched.
  reconcileTrackChange(oldTrackIds)
  applyWindow()
}

// Park (into the pool) only the cells / track-play observers whose column's track
// id changed — and invalidate the clip_slot cache for just those columns. Kept
// columns keep their bindings (same track => same clip_slots), so nothing is
// re-touched needlessly. This is the win over parking the whole grid.
function reconcileTrackChange(oldTrackIds: number[]) {
  const n = trackIds.length
  for (const key in cellObservers) {
    const obs = cellObservers[key]
    const col = obs.trackIdx
    if (col >= n || oldTrackIds[col] !== trackIds[col]) {
      parkCell(obs)
      if (cellPool.length < CELL_POOL_CAP) cellPool.push(obs)
      else teardownCellObservers(obs)
      delete cellObservers[key]
    }
  }
  for (const k in trackPlayObservers) {
    const col = +k
    if (col >= n || oldTrackIds[col] !== trackIds[col]) {
      const t = trackPlayObservers[col]
      parkTrackPlay(t)
      if (trackPlayPool.length < TRACK_POOL_CAP) trackPlayPool.push(t)
      else teardownTrackPlayObservers(t)
      delete trackPlayObservers[col]
    }
  }
  for (const k in trackSlotIds) {
    const col = +k
    if (col >= n || oldTrackIds[col] !== trackIds[col]) delete trackSlotIds[col]
  }
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
    parkAllCells()
    parkAllScenes()
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

// Acquire a track-play struct from the pool (parked, observers unsubscribed) or
// allocate a fresh one; then configure it for trackIdx. Callbacks reference
// tObs.trackIdx (the mutable field), NOT a captured local, so a pooled struct is
// safe to re-point to a different track.
function createTrackPlayObservers(trackIdx: number): TrackPlayObservers {
  const tObs = trackPlayPool.pop() || {
    trackIdx: trackIdx,
    playingSlotApi: null,
    firedSlotApi: null,
    armApi: null,
    nameApi: null,
    colorApi: null,
    playingSlot: -2,
    firedSlot: -2,
    armed: false,
    playingClipId: -1,
    playCount: 1,
    clipBeats: 0,
    lastFrac: 0,
  }

  const trackId = trackIds[trackIdx]
  tObs.trackIdx = trackIdx

  // Read initial values (by id — no path interning)
  cellInitApi.id = trackId
  tObs.playingSlot = parseInt(cellInitApi.get('playing_slot_index').toString())
  tObs.firedSlot = parseInt(cellInitApi.get('fired_slot_index').toString())
  const canBeArmed = !!parseInt(cellInitApi.get('can_be_armed').toString())
  tObs.armed = canBeArmed
    ? !!parseInt(cellInitApi.get('arm').toString())
    : false

  // Seed progress for an already-playing clip and start the poll if needed.
  setTrackPlayingClip(tObs, tObs.playingSlot)
  if (tObs.playingClipId >= 0) ensureProgressRunning()

  // Seed a pending quantized stop (e.g. track scrolled into view mid-stop).
  if (tObs.firedSlot === -2) sendStopPending(trackIdx, true)

  tObs.playingSlotApi = ensureObs(
    tObs.playingSlotApi,
    trackId,
    function (args: any[]) {
      if (!tObs.playingSlotApi || args[0] !== 'playing_slot_index') return
      const newSlot = parseInt(args[1])
      const oldSlot = tObs.playingSlot
      tObs.playingSlot = newSlot
      if (oldSlot >= 0) updateCellFromTrack(tObs.trackIdx, oldSlot)
      if (newSlot >= 0) updateCellFromTrack(tObs.trackIdx, newSlot)
      // Retarget progress polling at the now-playing clip (or clear it).
      setTrackPlayingClip(tObs, newSlot)
      if (tObs.playingClipId >= 0) ensureProgressRunning()
    },
    'playing_slot_index'
  )

  tObs.firedSlotApi = ensureObs(
    tObs.firedSlotApi,
    trackId,
    function (args: any[]) {
      if (!tObs.firedSlotApi || args[0] !== 'fired_slot_index') return
      const newSlot = parseInt(args[1])
      const oldSlot = tObs.firedSlot
      tObs.firedSlot = newSlot
      if (oldSlot >= 0) updateCellFromTrack(tObs.trackIdx, oldSlot)
      if (newSlot >= 0) updateCellFromTrack(tObs.trackIdx, newSlot)
      // fired_slot_index === -2 means a clip-stop button was fired: the track
      // has a quantized stop pending (still playing + blinking until it lands).
      // Tell the app so it can flash the track stop button like a triggered clip.
      if ((oldSlot === -2) !== (newSlot === -2)) {
        sendStopPending(tObs.trackIdx, newSlot === -2)
      }
    },
    'fired_slot_index'
  )

  // arm only for tracks that can be armed; disable (not teardown) otherwise.
  if (canBeArmed) {
    tObs.armApi = ensureObs(
      tObs.armApi,
      trackId,
      function (args: any[]) {
        if (!tObs.armApi || args[0] !== 'arm') return
        const newArmed = !!parseInt(args[1])
        if (newArmed === tObs.armed) return
        tObs.armed = newArmed
        updateAllCellsOnTrack(tObs.trackIdx)
      },
      'arm'
    )
  } else {
    disableObs(tObs.armApi)
  }

  tObs.nameApi = ensureObs(
    tObs.nameApi,
    trackId,
    function (args: any[]) {
      if (!tObs.nameApi || args[0] !== 'name') return
      osc('/clips/trackInfo', { t: tObs.trackIdx, n: dequote(args[1]) })
    },
    'name'
  )

  tObs.colorApi = ensureObs(
    tObs.colorApi,
    trackId,
    function (args: any[]) {
      if (!tObs.colorApi || args[0] !== 'color') return
      osc('/clips/trackInfo', { t: tObs.trackIdx, c: colorHex(args[1]) })
    },
    'color'
  )

  return tObs
}

// Park a track-play struct: unsubscribe all observers (keeps objects for reuse).
function parkTrackPlay(tObs: TrackPlayObservers) {
  disableObs(tObs.playingSlotApi)
  disableObs(tObs.firedSlotApi)
  disableObs(tObs.armApi)
  disableObs(tObs.nameApi)
  disableObs(tObs.colorApi)
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

// Release all resident track-play observers for a rebuild: PARK into the pool
// (re-pointed on the next applyWindow) instead of tearing down — teardown leaks.
function parkAllTrackPlay() {
  for (const key in trackPlayObservers) {
    const t = trackPlayObservers[key]
    parkTrackPlay(t)
    if (trackPlayPool.length < TRACK_POOL_CAP) trackPlayPool.push(t)
    else teardownTrackPlayObservers(t)
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
// Acquire a cell struct from the pool (parked, observers unsubscribed) or a fresh
// one, point it at (col,row), and read its display state. Observers are (re-)armed
// later by attachCellObservers. All cell callbacks reference obs.* (mutable
// fields), so a pooled struct is safe to re-point to a different cell.
function readCellState(col: number, row: number): CellObservers {
  const obs = cellPool.pop() || {
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
    cell: { state: CLIP_EMPTY, name: '', color: '', ps: 0, hc: 0, hsb: 0 },
  }
  obs.trackIdx = col
  obs.sceneIdx = row
  const cell = obs.cell
  cell.state = CLIP_EMPTY
  cell.name = ''
  cell.color = ''
  cell.ps = 0
  cell.hc = 0
  cell.hsb = 0

  const sid = slotId(col, row)
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
    cell.hc = parseInt(cellInitApi.get('controls_other_clips').toString())
      ? 1
      : 0
  }

  return obs
}

// (Re-)arm a cell's observers — called lazily in batches. Re-points a pooled
// cell's observers or creates fresh ones (ensureObs); enables group/clip
// observers for this cell or disables (not tears down) the ones it doesn't need.
function attachCellObservers(obs: CellObservers) {
  const sid = slotId(obs.trackIdx, obs.sceneIdx)

  // has_stop_button
  obs.hasStopButtonApi = ensureObs(
    obs.hasStopButtonApi,
    sid,
    function (args: any[]) {
      if (!obs.hasStopButtonApi || args[0] !== 'has_stop_button') return
      const newHsb = parseInt(args[1]) ? 1 : 0
      if (newHsb === obs.cell.hsb) return
      obs.cell.hsb = newHsb
      if (isVisible(obs.trackIdx, obs.sceneIdx)) queueFullUpdate(obs)
    },
    'has_stop_button'
  )

  // Group track: playing_status and controls_other_clips (disabled for others)
  if (trackIsGroup[obs.trackIdx]) {
    obs.playingStatusApi = ensureObs(
      obs.playingStatusApi,
      sid,
      function (args: any[]) {
        if (!obs.playingStatusApi || args[0] !== 'playing_status') return
        const newPs = parseInt(args[1]) || 0
        if (newPs === obs.cell.ps) return
        obs.cell.ps = newPs
        if (isVisible(obs.trackIdx, obs.sceneIdx)) queueFullUpdate(obs)
      },
      'playing_status'
    )

    obs.controlsOtherClipsApi = ensureObs(
      obs.controlsOtherClipsApi,
      sid,
      function (args: any[]) {
        if (!obs.controlsOtherClipsApi || args[0] !== 'controls_other_clips')
          return
        const newHc = parseInt(args[1]) ? 1 : 0
        if (newHc === obs.cell.hc) return
        obs.cell.hc = newHc
        if (isVisible(obs.trackIdx, obs.sceneIdx)) queueFullUpdate(obs)
      },
      'controls_other_clips'
    )
  } else {
    disableObs(obs.playingStatusApi)
    disableObs(obs.controlsOtherClipsApi)
  }

  // has_clip
  obs.hasClipApi = ensureObs(
    obs.hasClipApi,
    sid,
    function (args: any[]) {
      if (!obs.hasClipApi || args[0] !== 'has_clip') return
      const newHasClip = !!parseInt(args[1])
      if (newHasClip === obs.hasClip) return
      obs.hasClip = newHasClip
      if (newHasClip) {
        setupClipObserver(obs)
      } else {
        disableClipObservers(obs)
        obs.cell.name = ''
        obs.cell.color = ''
      }
      const newState = deriveCellState(newHasClip, obs.trackIdx, obs.sceneIdx)
      const oldState = obs.cell.state
      obs.cell.state = newState
      if (newState !== oldState && isVisible(obs.trackIdx, obs.sceneIdx)) {
        queueFullUpdate(obs)
      }
    },
    'has_clip'
  )

  // Clip sub-observers: arm for this cell's clip, or disable if no clip.
  if (obs.hasClip) setupClipObserver(obs)
  else disableClipObservers(obs)
}

// Unsubscribe the clip sub-observers (keep objects for reuse). Used when a clip
// is removed and when parking a cell.
function disableClipObservers(obs: CellObservers) {
  disableObs(obs.clipApi)
  disableObs(obs.clipColorApi)
  disableObs(obs.clipRecordingApi)
}

// Park a cell: unsubscribe every observer (keeps objects for re-pointing).
function parkCell(obs: CellObservers) {
  disableObs(obs.hasClipApi)
  disableObs(obs.hasStopButtonApi)
  disableObs(obs.playingStatusApi)
  disableObs(obs.controlsOtherClipsApi)
  disableClipObservers(obs)
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
    obs.clipApi = obsById(
      clipId,
      function (args: any[]) {
        if (!obs.clipApi) return
        if (args[0] !== 'name') return
        obs.cell.name = dequote(args[1])
        if (isVisible(obs.trackIdx, obs.sceneIdx)) {
          queueFullUpdate(obs)
        }
      },
      'name'
    )
  } else {
    obs.clipApi.id = clipId
    obs.clipApi.property = 'name'
  }

  if (!obs.clipRecordingApi) {
    obs.clipRecordingApi = obsById(
      clipId,
      function (args: any[]) {
        if (!obs.clipRecordingApi) return
        if (args[0] !== 'is_recording') return
        const recording = !!parseInt(args[1])
        if (recording) {
          obs.cell.state = CLIP_RECORDING
        } else {
          obs.cell.state = deriveCellState(
            obs.hasClip,
            obs.trackIdx,
            obs.sceneIdx
          )
        }
        if (isVisible(obs.trackIdx, obs.sceneIdx)) {
          queueFullUpdate(obs)
        }
      },
      'is_recording'
    )
  } else {
    obs.clipRecordingApi.id = clipId
    obs.clipRecordingApi.property = 'is_recording'
  }

  if (!obs.clipColorApi) {
    obs.clipColorApi = obsById(
      clipId,
      function (args: any[]) {
        if (!obs.clipColorApi) return
        if (args[0] !== 'color') return
        obs.cell.color = colorHex(args[1])
        if (isVisible(obs.trackIdx, obs.sceneIdx)) {
          queueFullUpdate(obs)
        }
      },
      'color'
    )
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

// Acquire a scene struct from the pool or a fresh one; configure for sceneIdx.
// Callbacks reference info.* (mutable), so a pooled struct is safe to re-point.
function createSceneObserver(sceneIdx: number): SceneInfo {
  const info = scenePool.pop() || {
    sceneIdx: sceneIdx,
    nameApi: null,
    colorApi: null,
    name: '',
    color: '',
  }
  const sid = sceneIds[sceneIdx]
  info.sceneIdx = sceneIdx
  cellInitApi.id = sid
  info.name = dequote(cellInitApi.get('name').toString())
  info.color = colorHex(cellInitApi.get('color'))

  info.nameApi = ensureObs(
    info.nameApi,
    sid,
    function (args: any[]) {
      if (!info.nameApi || args[0] !== 'name') return
      info.name = dequote(args[1])
      scheduleSceneInfo()
    },
    'name'
  )

  info.colorApi = ensureObs(
    info.colorApi,
    sid,
    function (args: any[]) {
      if (!info.colorApi || args[0] !== 'color') return
      info.color = colorHex(args[1])
      scheduleSceneInfo()
    },
    'color'
  )

  return info
}

// Park a scene: unsubscribe its observers (keep objects for re-pointing).
function parkScene(info: SceneInfo) {
  disableObs(info.nameApi)
  disableObs(info.colorApi)
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

// Release all resident cells for a rebuild (track-list / scene-count change):
// PARK into the pool so applyWindow re-points them — no teardown leak. This is
// why creating a track/scene while on the clips page no longer floods symbols.
function parkAllCells() {
  for (const key in cellObservers) {
    const obs = cellObservers[key]
    parkCell(obs)
    if (cellPool.length < CELL_POOL_CAP) cellPool.push(obs)
    else teardownCellObservers(obs)
  }
  cellObservers = {}
}

function parkAllScenes() {
  for (const key in sceneObservers) {
    const info = sceneObservers[parseInt(key)]
    parkScene(info)
    if (scenePool.length < SCENE_POOL_CAP) scenePool.push(info)
    else teardownSceneObserver(info)
  }
  sceneObservers = {}
}

function teardownAll() {
  if (observerBatchTask) observerBatchTask.cancel()
  pendingObserverKeys = []
  parkAllCells()
  parkAllTrackPlay()
  parkAllScenes()
  for (let k = 0; k < cellPool.length; k++) teardownCellObservers(cellPool[k])
  for (let k = 0; k < trackPlayPool.length; k++)
    teardownTrackPlayObservers(trackPlayPool[k])
  for (let k = 0; k < scenePool.length; k++) teardownSceneObserver(scenePool[k])
  cellPool = []
  trackPlayPool = []
  scenePool = []
  pendingUpdates = []
  if (updateFlushTask) {
    updateFlushTask.cancel()
  }
  if (progressTask) progressTask.cancel()
  progressRunning = false
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

  // Evict observers outside the warm region — PARK (unsubscribe + pool) rather
  // than tear down (teardown leaks; re-point is free). They are re-pointed back
  // when they re-enter. Only pool overflow (rare) is actually torn down.
  for (const key in cellObservers) {
    const obs = cellObservers[key]
    if (
      obs.trackIdx < warmLeft ||
      obs.trackIdx >= warmRight ||
      obs.sceneIdx < warmTop ||
      obs.sceneIdx >= warmBottom
    ) {
      parkCell(obs)
      if (cellPool.length < CELL_POOL_CAP) cellPool.push(obs)
      else teardownCellObservers(obs)
      delete cellObservers[key]
    }
  }
  for (const k in trackPlayObservers) {
    const col = +k
    if (col < warmLeft || col >= warmRight) {
      const t = trackPlayObservers[col]
      parkTrackPlay(t)
      if (trackPlayPool.length < TRACK_POOL_CAP) trackPlayPool.push(t)
      else teardownTrackPlayObservers(t)
      delete trackPlayObservers[col]
    }
  }
  for (const k in sceneObservers) {
    const row = +k
    if (row < warmTop || row >= warmBottom) {
      const info = sceneObservers[row]
      parkScene(info)
      if (scenePool.length < SCENE_POOL_CAP) scenePool.push(info)
      else teardownSceneObserver(info)
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

  // Page is (re)active — allow progress polling again. applyWindow →
  // createTrackPlayObservers will kick it off for any playing tracks.
  progressPaused = false

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
    // Zero-size window — the clips page is hidden. Keep observers alive (so
    // actions still work on return) but pause progress streaming so we don't
    // poll/send while off-screen.
    progressPaused = true
    if (progressTask) progressTask.cancel()
    progressRunning = false
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
