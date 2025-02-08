import { cleanArr, logFactory } from './utils'
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
} from './consts'

autowatch = 1
inlets = 1
outlets = 2

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setoutletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')
setoutletassist(OUTLET_MSGS, 'Output messages to other objects')

type PauseTypes = 'send' | 'vol' | 'pan' | 'crossfader'

const state = {
  mixerObj: null as LiveAPI,
  trackObj: null as LiveAPI,
  lastTrackId: null as number,
  volObj: null as LiveAPI,
  panObj: null as LiveAPI,
  crossfaderObj: null as LiveAPI,
  watchers: [] as LiveAPI[],
  pause: {
    send: { paused: false as boolean, task: null as Task },
    vol: { paused: false as boolean, task: null as Task },
    pan: { paused: false as boolean, task: null as Task },
    crossfader: { paused: false as boolean, task: null as Task },
  } as Record<PauseTypes, { paused: boolean; task: Task }>,
}

function pauseUnpause(key: PauseTypes) {
  if (state.pause[key].paused) {
    state.pause[key].task.cancel()
  }
  state.pause[key].paused = true
  state.pause[key].task = new Task(() => {
    state.pause[key].paused = false
  })
  state.pause[key].task.schedule(300)
}

const setSendWatcherIds = (sendIds: number[]) => {
  for (let i = 0; i < MAX_SENDS; i++) {
    if (sendIds[i] !== undefined) {
      state.watchers[i].id = sendIds[i]
    } else {
      state.watchers[i].id = 0
      outlet(OUTLET_OSC, '/mixer/send' + (i + 1), [0])
    }
  }
  outlet(OUTLET_OSC, '/mixer/numSends', sendIds.length)
}

function updateSendVal(idx: number, val: number) {
  //log('UPDATESENDVAL ' + idx + ' v=' + val)
  idx -= 1
  if (!state.watchers[idx]) {
    //log('EARLY ' + idx + ' v=' + val)
    return
  }
  pauseUnpause('send')
  state.watchers[idx].set('value', val)
}

function handleSendDefault(idx: number) {
  idx = idx - 1
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

function toggleRecordArm() {
  if (!state.trackObj || state.trackObj.id === 0) {
    return
  }
  const currState = parseInt(state.trackObj.get('arm'))
  state.trackObj.set('arm', currState ? 0 : 1)
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
  state.trackObj.set('solo', currState ? 0 : 1)
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
  if (val[0] !== 'value') {
    return
  }
  //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
  if (!state.pause.vol.paused) {
    outlet(OUTLET_OSC, '/mixer/vol', [val[1] || 0])
  }
}
const handlePanVal = (val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
  if (!state.pause.pan.paused) {
    outlet(OUTLET_OSC, '/mixer/pan', [val[1] || 0])
  }
}
const handleCrossfaderVal = (val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
  if (!state.pause.crossfader.paused) {
    outlet(OUTLET_OSC, '/mixer/crossfader', [val[1] || 0])
  }
}
const handleSendVal = (idx: number, val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  //log('HANDLE_SEND_VAL i=' + idx + ' val=' + val)
  if (!state.pause.send.paused) {
    outlet(OUTLET_OSC, '/mixer/send' + (idx + 1), [val[1] || 0])
  }
}

const MAX_SENDS = 12

const onTrackChange = (args: IdObserverArg) => {
  if (!state.trackObj || state.trackObj.id === 0) {
    return
  }
  const id = parseInt((cleanArr(args) as IdObserverArg)[0])
  if (id === state.lastTrackId) {
    return
  }
  state.lastTrackId = id

  // track type
  const path = state.trackObj.unquotedpath
  let trackType = TYPE_TRACK
  if (path.indexOf('live_set master_track') === 0) {
    trackType = TYPE_MAIN
  } else if (path.indexOf('live_set return_tracks') === 0) {
    trackType = TYPE_RETURN
  } else if (parseInt(state.trackObj.get('is_foldable')) === 1) {
    trackType = TYPE_GROUP
  }
  outlet(OUTLET_OSC, '/mixer/type', [trackType])

  // disable volume/pan for MIDI tracks
  const hasOutput = parseInt(state.trackObj.get('has_audio_output'))
  outlet(OUTLET_OSC, '/mixer/hasOutput', [hasOutput])

  const sends = cleanArr(state.mixerObj.get('sends'))

  setSendWatcherIds(sends)

  //log('ON TRACK CHANGE ' + trackType + ' => ' + path)
}

function refresh() {
  state.watchers = []
  state.mixerObj = null
  state.trackObj = null
  state.volObj = null
  state.panObj = null
  state.crossfaderObj = null
  state.lastTrackId = null
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

  // mixer obj
  if (!state.mixerObj) {
    (state.mixerObj = new LiveAPI(
      noFn,
      'live_set view selected_track mixer_device'
    )),
      (state.mixerObj.mode = 1)
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
    state.volObj.property = 'value'
    state.volObj.mode = 1
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
}

function handleSends(...sendArr: IdObserverArg) {
  //log('HANDLE SENDS ' + sendArr)
  const sendIds = cleanArr(sendArr)

  setSendWatcherIds(sendIds)

  init()
}

log('reloaded k4-mixerSends')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
