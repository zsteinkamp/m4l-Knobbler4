import {
  cleanArr,
  colorToString,
  dequote,
  logFactory,
  osc,
  setOscSink,
  setVisibleTracks,
  truncate,
  TrackInfo,
} from './utils'
import config from './k4-config'
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
// In Live a track must be SELECTED to rename or recolor it, so a single pair of
// path-following observers on the selected track catches every user edit — no
// need for per-track observers (which would also push N instances toward Live's
// observer ceiling in multiplayer). The visible_tracks / return_tracks watchers
// cover list membership and folding.
let selTrackNameApi: LiveAPI = null
let selTrackColorApi: LiveAPI = null
let trackUpdateDebounceTask: MaxTask = null

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
  osc('/visibleTracks', items)

  // Write to shared dict, then notify mixer/clips
  setVisibleTracks(trackList)
  ctx.notifyVisibleTracks()
}

// ---------------------------------------------------------------------------
// Selected-track name/color observers
// ---------------------------------------------------------------------------

function findTrack(id: number): TrackInfo | null {
  for (let i = 0; i < trackList.length; i++) {
    if (trackList[i].id === id) return trackList[i]
  }
  return null
}

// Fires on name edits of the selected track AND on selection changes (the
// path-following observer re-resolves). The change guard makes a mere selection
// change a no-op; only a real rename re-sends.
function onSelTrackNameChange(args: any[]) {
  if (args[0] !== 'name') return
  const t = findTrack(+selTrackNameApi.id)
  if (!t) return
  const newName = truncate(dequote(args[1].toString()), MAX_NAME_LEN)
  if (t.name === newName) return
  t.name = newName
  scheduleTrackUpdate()
}

function onSelTrackColorChange(args: any[]) {
  if (args[0] !== 'color') return
  const t = findTrack(+selTrackColorApi.id)
  if (!t) return
  const newColor = colorToString(args[1].toString())
  if (t.color === newColor) return
  t.color = newColor
  scheduleTrackUpdate()
}

function scheduleTrackUpdate() {
  if (!trackUpdateDebounceTask) {
    trackUpdateDebounceTask = new Task(function () {
      sendVisibleTracks()
    }) as MaxTask
  }
  trackUpdateDebounceTask.cancel()
  trackUpdateDebounceTask.schedule(50)
}

// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------

function onVisibleTracksChange(args: any[]) {
  if (args[0] !== 'visible_tracks') return
  ensureApis()
  trackList = buildTrackList()
  sendVisibleTracks()
}

function onReturnTracksChange(args: any[]) {
  if (args[0] !== 'return_tracks') return
  ensureApis()
  trackList = buildTrackList()
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
  if (!selTrackNameApi) {
    selTrackNameApi = new LiveAPI(onSelTrackNameChange, 'live_set view selected_track')
    selTrackNameApi.mode = 1
    selTrackNameApi.property = 'name'
  }
  if (!selTrackColorApi) {
    selTrackColorApi = new LiveAPI(onSelTrackColorChange, 'live_set view selected_track')
    selTrackColorApi.mode = 1
    selTrackColorApi.property = 'color'
  }

  trackList = buildTrackList()
  sendVisibleTracks()
}

const routes: Route[] = [
  { prefix: '/requestVisibleTracks', parse: 'bare', fn: requestVisibleTracks },
]

log('reloaded k4-visibleTracks')

export { routes, init }
