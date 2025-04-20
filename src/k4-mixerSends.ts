import { cleanArr, colorToString, logFactory } from './utils'
import config from './config'
import {
  noFn,
  INLET_MSGS,
  OUTLET_MSGS,
  OUTLET_OSC,
  TYPE_TRACK,
  TYPE_MAIN,
  TYPE_RETURN,
  TYPE_GROUP,
  DEFAULT_COLOR,
} from './consts'
import {
  getTrackInputStatus,
  disableTrackInput,
  enableTrackInput,
} from './toggleInput'

autowatch = 1
inlets = 1
outlets = 2

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setoutletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')
setoutletassist(OUTLET_MSGS, 'Output messages to other objects')

type PauseTypes = 'send' | 'vol' | 'pan' | 'crossfader'

const state = {
  trackLookupObj: null as LiveAPI,
  returnTrackColors: [] as string[],
  returnsObj: null as LiveAPI,
  mixerObj: null as LiveAPI,
  trackObj: null as LiveAPI,
  lastTrackId: 0 as number,
  volObj: null as LiveAPI,
  panObj: null as LiveAPI,
  crossfaderObj: null as LiveAPI,
  watchers: [] as LiveAPI[],
  pause: {
    send: { paused: false as boolean, task: null as MaxTask },
    vol: { paused: false as boolean, task: null as MaxTask },
    pan: { paused: false as boolean, task: null as MaxTask },
    crossfader: { paused: false as boolean, task: null as MaxTask },
  } as Record<PauseTypes, { paused: boolean; task: MaxTask }>,
}

function pauseUnpause(key: PauseTypes) {
  if (state.pause[key].paused) {
    state.pause[key].task.cancel()
    state.pause[key].task.freepeer()
  }
  state.pause[key].paused = true
  state.pause[key].task = new Task(() => {
    state.pause[key].paused = false
  }) as MaxTask
  state.pause[key].task.schedule(300)
}

const setSendWatcherIds = (sendIds: number[]) => {
  for (let i = 0; i < MAX_SENDS; i++) {
    if (sendIds[i] !== undefined) {
      state.watchers[i] && (state.watchers[i].id = sendIds[i])
    } else {
      state.watchers[i] && (state.watchers[i].id = 0)
      outlet(OUTLET_OSC, ['/mixer/send' + (i + 1), 0])
    }
  }
  outlet(OUTLET_OSC, ['/mixer/numSends', sendIds.length])
}

function updateSendVal(slot: number, val: number) {
  //log('UPDATESENDVAL ' + idx + ' v=' + val)
  const idx = slot - 1
  if (!state.watchers[idx]) {
    //log('EARLY ' + idx + ' v=' + val)
    return
  }
  pauseUnpause('send')
  state.watchers[idx].set('value', val)
}

function handleSendDefault(slot: number) {
  const idx = slot - 1
  if (!state.watchers[idx]) {
    //log('EARLY ' + idx + ' v=' + val)
    return
  }
  state.watchers[idx].set('value', state.watchers[idx].get('default_value'))
}

function toggleXFadeA() {
  if (!state.mixerObj || state.mixerObj.id === 0) {
    return
  }
  const currState = parseInt(state.mixerObj.get('crossfade_assign'))
  if (currState === 0) {
    // currently enabled, so disable all
    state.mixerObj.set('crossfade_assign', 1)
  } else {
    // enable
    state.mixerObj.set('crossfade_assign', 0)
  }
}
function toggleXFadeB() {
  if (!state.mixerObj || state.mixerObj.id === 0) {
    return
  }
  const currState = parseInt(state.mixerObj.get('crossfade_assign'))
  if (currState === 2) {
    // currently enabled, so disable all
    state.mixerObj.set('crossfade_assign', 1)
  } else {
    // enable
    state.mixerObj.set('crossfade_assign', 2)
  }
}

function sendRecordStatus(lookupObj: LiveAPI) {
  const armStatus =
    parseInt(lookupObj.get('can_be_armed')) && parseInt(lookupObj.get('arm'))
  const trackInputStatus = getTrackInputStatus(lookupObj)
  const inputStatus = trackInputStatus && trackInputStatus.inputEnabled
  outlet(OUTLET_OSC, ['/mixer/recordArm', armStatus ? 1 : 0])
  outlet(OUTLET_OSC, ['/mixer/inputEnabled', inputStatus ? 1 : 0])
}

enum Intent {
  Enable,
  Disable,
  Toggle,
}
function disableInput() {
  disableTrackInput(state.trackObj)
  sendRecordStatus(state.trackObj)
}
function enableRecord() {
  handleRecordInternal(Intent.Enable)
}
function disableRecord() {
  handleRecordInternal(Intent.Disable)
}
function handleRecordInternal(intent: Intent) {
  if (!state.trackObj || state.trackObj.id === 0) {
    return
  }
  if (intent === Intent.Enable) {
    enableTrackInput(state.trackObj)
    state.trackObj.set('arm', 1)
    // TODO handle exclusive
    const api = new LiveAPI(noFn, 'live_set')
    if (parseInt(api.get('exclusive_arm')) === 1) {
      // disarm any other track
      const tracks = cleanArr(api.get('tracks'))
      for (const trackId of tracks) {
        if (trackId === parseInt(state.trackObj.id.toString())) {
          continue
        }
        api.id = trackId
        if (parseInt(api.get('can_be_armed'))) {
          api.set('arm', 0)
        }
      }
    }
  } else if (intent === Intent.Disable) {
    state.trackObj.set('arm', 0)
  }
  sendRecordStatus(state.trackObj)
}

function toggleMute() {
  if (!state.trackObj || state.trackObj.id === 0) {
    return
  }
  const currState = parseInt(state.trackObj.get('mute'))
  state.trackObj.set('mute', currState ? 0 : 1)
}
function toggleSolo() {
  if (!state.trackObj || state.trackObj.id === 0) {
    return
  }
  const currState = parseInt(state.trackObj.get('solo'))
  const newState = currState ? 0 : 1

  if (newState) {
    // enabling solo, look at exclusive
    const api = new LiveAPI(noFn, 'live_set')
    if (parseInt(api.get('exclusive_solo')) === 1) {
      // un-solo any other track
      const tracks = cleanArr(api.get('tracks'))
      const returns = cleanArr(api.get('return_tracks'))
      for (const trackId of [...tracks, ...returns]) {
        if (trackId === parseInt(state.trackObj.id.toString())) {
          continue
        }
        api.id = trackId
        api.set('solo', 0)
      }
    }
  }
  state.trackObj.set('solo', newState)
  // TODO handle exclusive
}

function handleCrossfader(val: string) {
  //log('PAN OVJ VAL=' + val + ' type=' + typeof val)
  if (!state.crossfaderObj || state.crossfaderObj.id === 0) {
    return
  }
  pauseUnpause('crossfader')
  state.crossfaderObj.set('value', parseFloat(val))
}
function handleCrossfaderDefault() {
  //log('PAN OVJ VAL=' + val + ' type=' + typeof val)
  if (!state.crossfaderObj || state.crossfaderObj.id === 0) {
    return
  }
  state.crossfaderObj.set(
    'value',
    parseFloat(state.crossfaderObj.get('default_value'))
  )
}
function handlePan(val: string) {
  //log('PAN OVJ VAL=' + val + ' type=' + typeof val)
  if (!state.panObj || state.panObj.id === 0) {
    return
  }
  pauseUnpause('pan')
  state.panObj.set('value', parseFloat(val))
}
function handlePanDefault() {
  //log('PAN OVJ VAL=' + val + ' type=' + typeof val)
  if (!state.panObj || state.panObj.id === 0) {
    return
  }
  state.panObj.set('value', parseFloat(state.panObj.get('default_value')))
}
function handleVol(val: string) {
  if (!state.volObj || state.volObj.id === 0) {
    return
  }
  pauseUnpause('vol')
  state.volObj.set('value', parseFloat(val))
}
function handleVolDefault() {
  if (!state.volObj || state.volObj.id === 0) {
    return
  }
  state.volObj.set('value', parseFloat(state.volObj.get('default_value')))
}

const handleVolVal = (val: IdObserverArg) => {
  //log('HANDLE_VOL_VAL val=' + val + ' paused=' + state.pause.vol.paused)
  if (val[0] !== 'value') {
    return
  }
  if (!state.pause.vol.paused) {
    outlet(OUTLET_OSC, ['/mixer/vol', val[1] || 0])
  }
}
const handlePanVal = (val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  //log('HANDLE_PAN_VAL i=' + idx + ' val=' + val)
  if (!state.pause.pan.paused) {
    outlet(OUTLET_OSC, ['/mixer/pan', val[1] || 0])
  }
}
const handleCrossfaderVal = (val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  //log('HANDLE_XFAD_VAL i=' + idx + ' val=' + val)
  if (!state.pause.crossfader.paused) {
    outlet(OUTLET_OSC, ['/mixer/crossfader', val[1] || 0])
  }
}
const handleSendVal = (idx: number, val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
  if (!state.pause.send.paused) {
    outlet(OUTLET_OSC, ['/mixer/send' + (idx + 1), val[1] || 0])
  }
}

const MAX_SENDS = 12

const onTrackChange = (args: IdObserverArg) => {
  if (!state.trackObj) {
    return
  }
  if (args[1].toString() !== 'id') {
    return
  }

  const id = cleanArr(args)[0]

  //log('TRACK CHANGE ' + [id, state.lastTrackId].join(' '))

  if (id === state.lastTrackId) {
    //log('SAME AS LAST, eARLY ' + id)
    return
  }
  state.lastTrackId = id
  state.trackLookupObj.id = id

  // track type
  const path = state.trackLookupObj.unquotedpath
  let trackType = TYPE_TRACK
  if (path.indexOf('live_set master_track') === 0) {
    trackType = TYPE_MAIN
  } else if (path.indexOf('live_set return_tracks') === 0) {
    trackType = TYPE_RETURN
  } else if (parseInt(state.trackLookupObj.get('is_foldable')) === 1) {
    trackType = TYPE_GROUP
  }
  outlet(OUTLET_OSC, ['/mixer/type', trackType])

  //log('ON TRACK CHANGE ' + trackType + ' => ' + path)

  sendRecordStatus(state.trackLookupObj)
}

const sendReturnTrackColors = () => {
  outlet(OUTLET_OSC, [
    '/mixer/returnTrackColors',
    JSON.stringify(state.returnTrackColors),
  ])
}

const onReturnsChange = (args: IdObserverArg) => {
  if (!state.returnsObj || args[0] !== 'return_tracks') {
    return
  }
  //log('ON RETURNS CHANGE ' + args)
  const api = new LiveAPI(noFn, 'live_set')
  const returnIds = cleanArr(args)
  for (let i = 0; i < MAX_SENDS; i++) {
    let color = DEFAULT_COLOR
    if (returnIds[i]) {
      api.id = returnIds[i]
      color = colorToString(api.get('color').toString())
    }
    state.returnTrackColors[i] = '#' + color
  }
  sendReturnTrackColors()
}

function refresh() {
  state.watchers = []
  state.trackLookupObj = null
  state.returnsObj = null
  state.mixerObj = null
  state.trackObj = null
  state.volObj = null
  state.panObj = null
  state.crossfaderObj = null
  state.lastTrackId = 0
  init()
}

function init() {
  if (state.watchers.length === MAX_SENDS) {
    return
  }
  for (let i = 0; i < MAX_SENDS; i++) {
    const watcher = new LiveAPI(
      (val: IdObserverArg) => handleSendVal(i, val),
      'live_set'
    )
    state.watchers.push(watcher)
    watcher.property = 'value'
  }

  if (!state.trackLookupObj) {
    state.trackLookupObj = new LiveAPI(noFn, 'live_set')
  }

  // returns obj
  state.returnTrackColors = []
  if (!state.returnsObj) {
    state.returnsObj = new LiveAPI(onReturnsChange, 'live_set')
    state.returnsObj.property = 'return_tracks'
    state.returnsObj.mode = 1
  }

  // mixer obj
  if (!state.mixerObj) {
    state.mixerObj = new LiveAPI(
      noFn,
      'live_set view selected_track mixer_device'
    )
    state.mixerObj.mode = 1
  }

  // track obj
  if (!state.trackObj) {
    state.trackObj = new LiveAPI(onTrackChange, 'live_set view selected_track')
    state.trackObj.mode = 1
    state.trackObj.property = 'id'
  }

  // volume obj
  if (!state.volObj) {
    state.volObj = new LiveAPI(
      handleVolVal,
      'live_set view selected_track mixer_device volume'
    )
    state.volObj.mode = 1
    state.volObj.property = 'value'
  }

  // pan obj
  if (!state.panObj) {
    state.panObj = new LiveAPI(
      handlePanVal,
      'live_set view selected_track mixer_device panning'
    )
    state.panObj.property = 'value'
    state.panObj.mode = 1
  }

  // crossfader obj
  if (!state.crossfaderObj) {
    state.crossfaderObj = new LiveAPI(
      handleCrossfaderVal,
      'live_set master_track mixer_device crossfader'
    )
    state.crossfaderObj.property = 'value'
    state.crossfaderObj.mode = 1
  }
  outlet(OUTLET_MSGS, ['gate', 1])
}

function handleSends(...sendArr: IdObserverArg) {
  //log('HANDLE SENDS ' + sendArr)
  const sendIds = cleanArr(sendArr)

  setSendWatcherIds(sendIds)
}

log('reloaded k4-mixerSends')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
