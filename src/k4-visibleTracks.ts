import {
  cleanArr,
  colorToString,
  logFactory,
  setOscSink,
  sendChunkedData,
  setVisibleTracks,
  truncate,
  TrackInfo,
} from './utils'
import config from './config'
import {
  noFn,
  TYPE_TRACK,
  TYPE_RETURN,
  TYPE_MAIN,
  TYPE_GROUP,
  MAX_NAME_LEN,
} from './consts'

const log = logFactory(config)

// Orchestrator context (set in init) — its notifyVisibleTracks() fans a
// track-list change out to the consumers (clip/mixer) + the notify outlet.
let ctx: AppContext = null

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let scratchApi: LiveAPI = null
let visibleTracksWatcher: LiveAPI = null
let returnTracksWatcher: LiveAPI = null

let trackList: TrackInfo[] = []
let colorObservers: LiveAPI[] = []
let colorDebounceTask: MaxTask = null

function ensureApis() {
  if (!scratchApi) scratchApi = new LiveAPI(noFn, 'live_set')
}

// ---------------------------------------------------------------------------
// Track List Builder
// ---------------------------------------------------------------------------

function buildTrackList(): TrackInfo[] {
  const ret: TrackInfo[] = []

  // visible tracks (respects group folding)
  scratchApi.path = 'live_set'
  const trackIds = cleanArr(scratchApi.get('visible_tracks'))
  for (const id of trackIds) {
    scratchApi.id = id
    const isFoldable = parseInt(scratchApi.get('is_foldable').toString())
    const parentId = cleanArr(scratchApi.get('group_track'))[0] || 0
    ret.push({
      id: id,
      type: isFoldable ? TYPE_GROUP : TYPE_TRACK,
      name: truncate(scratchApi.get('name').toString(), MAX_NAME_LEN),
      color: colorToString(scratchApi.get('color').toString()),
      path: scratchApi.unquotedpath,
      parentId: parentId,
    })
  }

  // return tracks
  scratchApi.path = 'live_set'
  const returnIds = cleanArr(scratchApi.get('return_tracks'))
  for (const id of returnIds) {
    scratchApi.id = id
    ret.push({
      id: id,
      type: TYPE_RETURN,
      name: truncate(scratchApi.get('name').toString(), MAX_NAME_LEN),
      color: colorToString(scratchApi.get('color').toString()),
      path: scratchApi.unquotedpath,
      parentId: 0,
    })
  }

  // master track
  scratchApi.path = 'live_set'
  const mainId = cleanArr(scratchApi.get('master_track'))[0]
  scratchApi.id = mainId
  ret.push({
    id: mainId,
    type: TYPE_MAIN,
    name: truncate(scratchApi.get('name').toString(), MAX_NAME_LEN),
    color: colorToString(scratchApi.get('color').toString()),
    path: scratchApi.unquotedpath,
    parentId: 0,
  })

  return ret
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

function sendVisibleTracks() {
  // Send to app via chunked OSC
  const items = trackList.map(function (t) {
    return [t.type, t.id, t.name, t.color, null, null, t.parentId]
  })
  sendChunkedData('/visibleTracks', items)

  // Write to shared dict, then notify mixer/clips
  setVisibleTracks(trackList)
  ctx.notifyVisibleTracks()
}

// ---------------------------------------------------------------------------
// Color Observers
// ---------------------------------------------------------------------------

function teardownColorObservers() {
  for (let i = 0; i < colorObservers.length; i++) {
    colorObservers[i].property = ''
    colorObservers[i].id = 0
  }
  colorObservers = []
}

function createColorObservers() {
  teardownColorObservers()
  for (let i = 0; i < trackList.length; i++) {
    const idx = i
    const obs = new LiveAPI(function (args: any[]) {
      if (args[0] === 'color') {
        trackList[idx].color = colorToString(args[1].toString())
        scheduleColorUpdate()
      }
    }, 'live_set')
    obs.id = trackList[i].id
    obs.property = 'color'
    colorObservers.push(obs)
  }
}

function scheduleColorUpdate() {
  if (!colorDebounceTask) {
    colorDebounceTask = new Task(function () {
      sendVisibleTracks()
    }) as MaxTask
  }
  colorDebounceTask.cancel()
  colorDebounceTask.schedule(50)
}

// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------

function onVisibleTracksChange(args: any[]) {
  if (args[0] !== 'visible_tracks') return
  ensureApis()
  trackList = buildTrackList()
  createColorObservers()
  sendVisibleTracks()
}

function onReturnTracksChange(args: any[]) {
  if (args[0] !== 'return_tracks') return
  ensureApis()
  trackList = buildTrackList()
  createColorObservers()
  sendVisibleTracks()
}

// ---------------------------------------------------------------------------
// Incoming Messages
// ---------------------------------------------------------------------------

function requestVisibleTracks() {
  ensureApis()
  if (trackList.length === 0) {
    trackList = buildTrackList()
  }
  sendVisibleTracks()
}

function doRefresh() {
  ensureApis()
  trackList = buildTrackList()
  createColorObservers()
  sendVisibleTracks()
}

function init(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
  ensureApis()

  if (!visibleTracksWatcher) {
    visibleTracksWatcher = new LiveAPI(onVisibleTracksChange, 'live_set')
    visibleTracksWatcher.property = 'visible_tracks'
  }
  if (!returnTracksWatcher) {
    returnTracksWatcher = new LiveAPI(onReturnTracksChange, 'live_set')
    returnTracksWatcher.property = 'return_tracks'
  }

  trackList = buildTrackList()
  createColorObservers()
  sendVisibleTracks()
}

const routes: Route[] = [
  { prefix: '/requestVisibleTracks', parse: 'bare', fn: requestVisibleTracks },
]

log('reloaded k4-visibleTracks')

export { routes, init }
