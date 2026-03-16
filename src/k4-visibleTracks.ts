import {
  cleanArr,
  colorToString,
  logFactory,
  sendChunkedData,
  truncate,
} from './utils'
import config from './config'
import {
  noFn,
  INLET_MSGS,
  TYPE_TRACK,
  TYPE_RETURN,
  TYPE_MAIN,
  TYPE_GROUP,
  MAX_NAME_LEN,
} from './consts'

autowatch = 1
inlets = 1
outlets = 2

const OUTLET_OSC = 0
const OUTLET_TRACK_DATA = 1

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Messages')
setoutletassist(OUTLET_OSC, 'OSC messages to [udpsend]')
setoutletassist(OUTLET_TRACK_DATA, 'Track data to mixer/clips')

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let scratchApi: LiveAPI = null
let visibleTracksWatcher: LiveAPI = null
let returnTracksWatcher: LiveAPI = null

type TrackInfo = {
  id: number
  type: number
  name: string
  color: string
  path: string
  parentId: number
}

let trackList: TrackInfo[] = []

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

const TRACK_DICT_NAME = 'visibleTracksDict'

function sendVisibleTracks() {
  // Send to app via chunked OSC
  const items = trackList.map(function (t) {
    return [t.type, t.id, t.name, t.color, null, null, t.parentId]
  })
  sendChunkedData('/visibleTracks', items)

  // Write to shared dict, then notify mixer/clips
  const d = new Dict(TRACK_DICT_NAME)
  d.set('tracks', JSON.stringify(trackList))
  outlet(OUTLET_TRACK_DATA, 'visibleTracks')
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

function refresh() {
  ensureApis()
  trackList = buildTrackList()
  sendVisibleTracks()
}

function init() {
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
  sendVisibleTracks()
}

log('reloaded k4-visibleTracks')

// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
