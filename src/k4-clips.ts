import { cleanArr, colorToString, isDeviceSupported, logFactory } from './utils'
import config from './config'
import { noFn, INLET_MSGS, OUTLET_MSGS, OUTLET_OSC } from './consts'

autowatch = 1
inlets = 1
outlets = 1

const log = logFactory(config)

const NUM_TRACKS = 8

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setoutletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')

type ClipSlotType = {
  hasStopButton: boolean
  hasClip: boolean
  isRecording: boolean
  name: string
  color: string
}

type SceneMeta = {
  name: string
  color: string
}

type ScenesType = Record<string, SceneMeta>

type TrackMeta = {
  name: string
  color: string
  groupState: number
}

type GroupStack = [number, string][]

type TrackSlotMeta = {
  obsPlayingSlotIndex: LiveAPI
  obsFiredSlotIndex: LiveAPI
  obsTrackClipSlots: LiveAPI
  obsArm: LiveAPI
  playingSlotIndex: number
  firedSlotIndex: number
  arm: number
  clipSlots: ClipSlotType[]
  groupParents: GroupStack
}

type TracksType = Record<string, TrackMeta>

type TrackSlotsType = TrackSlotMeta[]

type StateType = {
  obsVisibleTracks: LiveAPI
  obsScenes: LiveAPI
  obsSelScene: LiveAPI
  obsSelTrack: LiveAPI
  scenes: ScenesType
  tracks: TracksType
  trackSlots: TrackSlotsType
  visibleTrackIds: number[]
  displayTrackIds: number[]
  sceneIds: number[]
  displaySceneIds: number[]
  updateDebounce: Task
  utilObj: LiveAPI
  outputLast: Record<string, string | number>
  groupStack: GroupStack
}

const state: StateType = {
  obsVisibleTracks: null,
  obsScenes: null,
  obsSelScene: null,
  obsSelTrack: null,
  scenes: {},
  tracks: {},
  trackSlots: [],
  visibleTrackIds: [],
  displayTrackIds: [],
  sceneIds: [],
  displaySceneIds: [],
  updateDebounce: null,
  utilObj: null,
  outputLast: {},
  groupStack: [],
}

// MESSAGE HANDLERS
function rename(slot: number, data: string) {
  const [clipSlotIdx, name] = JSON.parse(data)
  //log('RENAME', { slot, clipSlotIdx, name })
  const trackId = state.displayTrackIds[slot]
  if (!trackId) {
    log('WEIRD WE GOT A SLOT THAT HAS NO TRACK', slot)
    return
  }
  state.utilObj.id = trackId
  state.utilObj.goto('clip_slots ' + clipSlotIdx + ' clip')
  state.utilObj.set('name', name)

  const clipSlotIdArr = cleanArr(
    state.trackSlots[slot].obsTrackClipSlots.get('clip_slots')
  )
  refreshClipSlotsInSlot(slot, clipSlotIdArr)

  updateDisplay()
}

function fire(slot: number, clipSlot: number) {
  //log('FIRE', slot, clipSlot)
  const trackId = state.displayTrackIds[slot]
  if (!trackId) {
    log('WEIRD WE GOT A SLOT THAT HAS NO TRACK', slot)
    return
  }
  state.utilObj.id = trackId
  state.utilObj.goto('clip_slots ' + clipSlot)
  state.utilObj.call('fire', null)
  const slotId = state.utilObj.id
  state.utilObj.goto('live_set view')
  state.utilObj.set('highlighted_clip_slot', 'id ' + slotId)
}

function renameScene(sceneIdx: number, name: string) {
  const sceneId = state.sceneIds[sceneIdx]
  if (!sceneId) {
    log('INVALUD SCENE ID')
    return
  }
  state.utilObj.id = sceneId
  state.utilObj.set('name', name)
  fillSceneMetadata(sceneId)
  updateDisplay()
}

function fireScene(sceneIdx: number) {
  const sceneId = state.sceneIds[sceneIdx]
  if (!sceneId) {
    log('INVALUD SCENE ID')
    return
  }
  state.utilObj.id = sceneId
  state.utilObj.call('fire', null)
}
function captureInsert() {
  //log('CAPTURE INSERT')
  state.utilObj.goto('live_set')
  state.utilObj.call('capture_and_insert_scene', null)
}

function stopAll() {
  state.utilObj.goto('live_set')
  state.utilObj.call('stop_all_clips', null)
}
function stop(slot: number) {
  //log('STOP', slot)
  const trackId = state.displayTrackIds[slot]
  if (!trackId) {
    log('WEIRD WE GOT A SLOT THAT HAS NO TRACK', slot)
    return
  }
  state.utilObj.id = trackId
  state.utilObj.call('stop_all_clips', null)
}
function groupFold(slot: number) {
  //log('FOLD', slot)
  foldInternal(slot, 1)
}
function groupUnfold(slot: number) {
  //log('UNFOLD', slot)
  foldInternal(slot, 0)
}

function foldInternal(slot: number, foldState: 0 | 1) {
  const trackId = state.displayTrackIds[slot]
  if (!trackId) {
    log('WEIRD WE GOT A SLOT THAT HAS NO TRACK', slot)
    return
  }
  state.utilObj.id = trackId
  if (!+state.utilObj.get('is_foldable')) {
    log('WEIRD WE GOT AN FOLD COMMAND ON A NON-GROUP TRACK', slot, foldState)
    return
  }
  state.utilObj.set('fold_state', foldState)
}

// LISTENERS / DATA PROVIDERS BELOW
function dedupOscOutput(key: string, val: string | number) {
  if (state.outputLast[key] === val) {
    return
  }
  state.outputLast[key] = val
  outlet(OUTLET_OSC, [key, val])
  //log('OSC OUTPUT', key, val)
}

function formatScenes() {
  const sceneRet = state.sceneIds.map((sceneId) => {
    return [state.scenes[sceneId].name, state.scenes[sceneId].color]
  })
  state.utilObj.path = 'live_set master_track'
  const mainColor = colorToString(state.utilObj.get('color'))
  sceneRet.unshift(['Main', mainColor])
  return sceneRet
}

function updateDisplay() {
  if (!state.updateDebounce) {
    state.updateDebounce = new Task(() => {
      const numTrackSlotsKey = '/clips/numTrackSlots'
      dedupOscOutput(numTrackSlotsKey, state.trackSlots.length)

      dedupOscOutput('/clips/scenes', JSON.stringify(formatScenes()))

      state.trackSlots.forEach((_, idx) => {
        const outputKey = '/clips/trackSlot' + idx
        const outputString = JSON.stringify(formatTrackSlot(idx))
        dedupOscOutput(outputKey, outputString)
      })
    })
  }
  state.updateDebounce.cancel()
  state.updateDebounce.schedule(10)
}

function fillTrackMetadata(trackId: number) {
  //log('GET METADATA', trackId)
  state.utilObj.id = trackId
  if (state.utilObj.id === 0) {
    return
  }
  const groupState = +state.utilObj.get('is_foldable')
    ? +state.utilObj.get('fold_state')
    : -1
  state.tracks[trackId.toString()] = {
    groupState,
    name: state.utilObj.get('name').toString(),
    color: colorToString(state.utilObj.get('color')),
  }
}

function refreshClipSlotsInSlot(slot: number, clipSlotIdArr: number[]) {
  const trackId = state.trackSlots[slot].obsTrackClipSlots.id
  const isGroup = state.tracks[trackId].groupState >= 0
  state.trackSlots[slot].clipSlots = []
  for (const clipSlotId of clipSlotIdArr) {
    state.utilObj.id = clipSlotId
    const hasStopButton = !!+state.utilObj.get('has_stop_button')

    let hasClip = false
    let name = ''
    let color = ''
    let isRecording = false

    if (isGroup) {
      hasClip = !!+state.utilObj.get('controls_other_clips')
    } else {
      hasClip = !!+state.utilObj.get('has_clip')
      if (hasClip) {
        const clipId = cleanArr(state.utilObj.get('clip'))[0]
        if (clipId) {
          //log('ID', state.utilObj.id, clipId)
          state.utilObj.id = clipId
          name = state.utilObj.get('name').toString()
          color = colorToString(state.utilObj.get('color'))
          isRecording = !!+state.utilObj.get('is_recording')
        }
      }
    }
    state.trackSlots[slot].clipSlots.push({
      hasClip,
      hasStopButton,
      isRecording,
      name,
      color,
    })
  }
}

function handlePlayingSlotIndex(slot: number, args: IArguments) {
  const argsArr = arrayfromargs(args)
  if (argsArr.shift() !== 'playing_slot_index') {
    return
  }
  state.trackSlots[slot].playingSlotIndex = argsArr.shift()

  if (state.trackSlots[slot].arm) {
    const clipSlotIdArr = cleanArr(
      state.trackSlots[slot].obsTrackClipSlots.get('clip_slots')
    )
    refreshClipSlotsInSlot(slot, clipSlotIdArr)
  }

  updateDisplay()
}

function handleFiredSlotIndex(slot: number, args: IArguments) {
  const argsArr = arrayfromargs(args)
  if (argsArr.shift() !== 'fired_slot_index') {
    return
  }
  state.trackSlots[slot].firedSlotIndex = argsArr.shift()
  updateDisplay()
}

function handleArm(slot: number, args: IArguments) {
  const argsArr = arrayfromargs(args)
  if (argsArr.shift() !== 'arm') {
    return
  }
  state.trackSlots[slot].arm = argsArr.shift()
  updateDisplay()
}

function handleClipSlots(slot: number, args: IArguments) {
  const argsArr = arrayfromargs(args)
  if (argsArr.shift() !== 'clip_slots') {
    return
  }
  const clipSlotIdArr = cleanArr(argsArr as IdObserverArg)
  refreshClipSlotsInSlot(slot, clipSlotIdArr)
}

function configureTrackSlot(slot: number, trackId: number) {
  //log('CONFIGURE SLOT', { slot, trackId })
  if (!state.trackSlots[slot]) {
    state.trackSlots[slot] = {
      obsTrackClipSlots: null,
      obsPlayingSlotIndex: null,
      obsFiredSlotIndex: null,
      obsArm: null,
      playingSlotIndex: -1,
      firedSlotIndex: -1,
      arm: 0,
      clipSlots: [],
      groupParents: [],
    }
  }
  if (!state.trackSlots[slot].obsTrackClipSlots) {
    state.trackSlots[slot].obsTrackClipSlots = new LiveAPI(
      (args: IArguments) => handleClipSlots(slot, args),
      'live_set'
    )
  }
  state.trackSlots[slot].obsTrackClipSlots.id = trackId
  state.trackSlots[slot].obsTrackClipSlots.property = 'clip_slots'

  if (!state.trackSlots[slot].obsPlayingSlotIndex) {
    state.trackSlots[slot].obsPlayingSlotIndex = new LiveAPI(
      (args: IArguments) => handlePlayingSlotIndex(slot, args),
      'live_set'
    )
  }
  state.trackSlots[slot].obsPlayingSlotIndex.id = trackId
  state.trackSlots[slot].obsPlayingSlotIndex.property = 'playing_slot_index'

  if (!state.trackSlots[slot].obsFiredSlotIndex) {
    state.trackSlots[slot].obsFiredSlotIndex = new LiveAPI(
      (args: IArguments) => handleFiredSlotIndex(slot, args),
      'live_set'
    )
  }
  state.trackSlots[slot].obsFiredSlotIndex.id = trackId
  state.trackSlots[slot].obsFiredSlotIndex.property = 'fired_slot_index'

  const groupTrackId = cleanArr(
    state.trackSlots[slot].obsFiredSlotIndex.get('group_track')
  )[0]
  // initialize empty
  state.trackSlots[slot].groupParents = []

  if (groupTrackId) {
    // this track is a member of a group, so find that group track in the groupStack array
    while (state.groupStack.length) {
      if (state.groupStack[state.groupStack.length - 1][0] !== groupTrackId) {
        state.groupStack.pop()
      } else {
        // found our group, so take everything from there and up
        state.trackSlots[slot].groupParents = [...state.groupStack]
        break
      }
    }
  }

  // only observe arm in non-group tracks
  if (state.tracks[trackId].groupState === -1) {
    if (!state.trackSlots[slot].obsArm) {
      state.trackSlots[slot].obsArm = new LiveAPI(
        (args: IArguments) => handleArm(slot, args),
        'id ' + trackId
      )
    }
    //log('HERE', state.trackSlots[slot].obsArm.type)
    state.trackSlots[slot].obsArm.id = trackId
    state.trackSlots[slot].obsArm.property = 'arm'
  } else {
    // this is a group, so push its id and color onto state.groupStack
    state.groupStack.push([trackId, state.tracks[trackId].color])
  }
}

function formatTrackSlot(slot: number) {
  const trackSlot = state.trackSlots[slot]
  const trackId = state.displayTrackIds[slot]
  const trackMeta = state.tracks[trackId.toString()]
  return [
    trackId,
    trackMeta.name,
    trackMeta.color,
    trackMeta.groupState,
    trackSlot.playingSlotIndex,
    trackSlot.firedSlotIndex,
    trackSlot.arm,
    trackSlot.clipSlots.map((cs) => {
      return [
        cs.hasClip ? 1 : 0,
        cs.hasStopButton ? 1 : 0,
        cs.name,
        cs.color,
        cs.isRecording ? 1 : 0,
      ]
    }),
    trackSlot.groupParents,
  ]
}

function handleVisibleTracks(args: IArguments) {
  // visible tracks have changed, so look for new items in the display list
  const argsArr = arrayfromargs(args)
  if (argsArr.shift() !== 'visible_tracks') {
    return
  }
  state.visibleTrackIds = cleanArr(argsArr as IdObserverArg)
  state.tracks = {}
  state.trackSlots = []
  state.groupStack = []

  state.displayTrackIds = state.visibleTrackIds
  //log('DISPLAY TRACK IDs', state.displayTrackIds)

  let slot = 0
  for (const trackId of state.displayTrackIds) {
    if (!state.tracks[trackId.toString()]) {
      // need metadata for this track
      // populates state.tracks[trackId]
      fillTrackMetadata(trackId)
    }
    configureTrackSlot(slot, trackId)
    slot++
  }

  updateDisplay()
}

function fillSceneMetadata(sceneId: number) {
  //log('GET SCENE METADATA', sceneId)
  state.utilObj.id = sceneId
  if (state.utilObj.id === 0) {
    return
  }
  state.scenes[sceneId.toString()] = {
    name: state.utilObj.get('name').toString(),
    color: colorToString(state.utilObj.get('color')),
  }
}

function handleScenes(args: IArguments) {
  // visible tracks have changed, so look for new items in the display list
  const argsArr = arrayfromargs(args)
  if (argsArr.shift() !== 'scenes') {
    return
  }
  state.sceneIds = cleanArr(argsArr as IdObserverArg)
  state.scenes = {}

  // temp do them all
  state.displaySceneIds = state.sceneIds

  let slot = 0
  for (const sceneId of state.displaySceneIds) {
    //log('STEP', { slot, trackId })
    if (!state.tracks[sceneId.toString()]) {
      // need metadata for this scene
      // populates state.scenes[sceneId]
      fillSceneMetadata(sceneId)
    }
    slot++
  }
  updateDisplay()
}

function handleSelTrack(args: IArguments) {
  // visible tracks have changed, so look for new items in the display list
  const argsArr = arrayfromargs(args)
  if (argsArr.shift() !== 'id') {
    return
  }
  const selTrackId = +argsArr[0]
  dedupOscOutput('/clips/selectedTrack', selTrackId)
}

function handleSelScene(args: IArguments) {
  // visible tracks have changed, so look for new items in the display list
  const argsArr = arrayfromargs(args)
  if (argsArr.shift() !== 'id') {
    return
  }
  const selSceneId = +argsArr[0]
  dedupOscOutput('/clips/selectedSceneIdx', state.sceneIds.indexOf(selSceneId))
}

function init() {
  state.outputLast = {}
  state.obsVisibleTracks = null
  state.obsScenes = null

  if (!state.utilObj) {
    state.utilObj = new LiveAPI(noFn, 'live_set')
  }
  if (!state.obsVisibleTracks) {
    state.obsVisibleTracks = new LiveAPI(handleVisibleTracks, 'live_set')
    state.obsVisibleTracks.property = 'visible_tracks'
  }
  if (!state.obsScenes) {
    state.obsScenes = new LiveAPI(handleScenes, 'live_set')
    state.obsScenes.property = 'scenes'
  }
  if (!state.obsSelTrack) {
    state.obsSelTrack = new LiveAPI(
      handleSelTrack,
      'live_set view selected_track'
    )
    state.obsSelTrack.mode = 1
  }
  if (!state.obsSelScene) {
    state.obsSelScene = new LiveAPI(
      handleSelScene,
      'live_set view selected_scene'
    )
    state.obsSelScene.mode = 1
  }
}

log('reloaded k4-clips')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
