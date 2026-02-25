import { cleanArr, loadSetting, logFactory, meterVal, numArrToJson, osc, pauseUnpause, PauseState, SEND_ADDR } from './utils'
import config from './config'
import {
  noFn,
  INLET_MSGS,
  OUTLET_OSC,
  MAX_SENDS,
  PAUSE_MS,
  METER_FLUSH_MS,
  TYPE_TRACK,
  TYPE_MAIN,
  TYPE_RETURN,
  TYPE_GROUP,
} from './consts'
import {
  getTrackInputStatus,
  disableTrackInput,
  enableTrackInput,
} from './toggleInput'

autowatch = 1
inlets = 2
outlets = 1

const log = logFactory(config)
const INLET_PAGE = 1

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setinletassist(INLET_PAGE, 'Page change messages')
setoutletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')

const state = {
  trackLookupObj: null as LiveAPI,
  returnsObj: null as LiveAPI,
  mixerObj: null as LiveAPI,
  trackObj: null as LiveAPI,
  lastTrackId: 0 as number,
  volObj: null as LiveAPI,
  panObj: null as LiveAPI,
  crossfaderObj: null as LiveAPI,
  watchers: [] as LiveAPI[],
  onMixerPage: false as boolean,
  metersEnabled: false as boolean,
  hasOutput: false as boolean,
  meterLeftObj: null as LiveAPI,
  meterRightObj: null as LiveAPI,
  meterLevelObj: null as LiveAPI,
  meterBuffer: [0, 0, 0] as number[],
  meterDirty: false as boolean,
  meterFlushTask: null as MaxTask,
  pause: {
    send: { paused: false, task: null },
    vol: { paused: false, task: null },
    pan: { paused: false, task: null },
    crossfader: { paused: false, task: null },
  } as Record<string, PauseState>,
}

// ---------------------------------------------------------------------------
// Meter observers
// ---------------------------------------------------------------------------

function ensureMeterObservers() {
  if (state.meterLeftObj) return
  state.meterLeftObj = new LiveAPI(function (args: any[]) {
    if (args[0] === 'output_meter_left') {
      const v = meterVal(args[1])
      if (v !== state.meterBuffer[0]) {
        state.meterBuffer[0] = v
        state.meterDirty = true
      }
    }
  }, 'live_set')
  state.meterRightObj = new LiveAPI(function (args: any[]) {
    if (args[0] === 'output_meter_right') {
      const v = meterVal(args[1])
      if (v !== state.meterBuffer[1]) {
        state.meterBuffer[1] = v
        state.meterDirty = true
      }
    }
  }, 'live_set')
  state.meterLevelObj = new LiveAPI(function (args: any[]) {
    if (args[0] === 'output_meter_level') {
      const v = meterVal(args[1])
      if (v !== state.meterBuffer[2]) {
        state.meterBuffer[2] = v
        state.meterDirty = true
      }
    }
  }, 'live_set')
}

function pointMetersAt(trackPath: string) {
  ensureMeterObservers()
  state.meterLeftObj.path = trackPath
  state.meterLeftObj.property = 'output_meter_left'
  state.meterRightObj.path = trackPath
  state.meterRightObj.property = 'output_meter_right'
  state.meterLevelObj.path = trackPath
  state.meterLevelObj.property = 'output_meter_level'
}

function disableMeters() {
  if (state.meterLeftObj) state.meterLeftObj.id = 0
  if (state.meterRightObj) state.meterRightObj.id = 0
  if (state.meterLevelObj) state.meterLevelObj.id = 0
  state.meterBuffer[0] = 0
  state.meterBuffer[1] = 0
  state.meterBuffer[2] = 0
}

function startMeterFlush() {
  if (state.meterFlushTask) return
  state.meterFlushTask = new Task(function () {
    if (state.meterDirty) {
      state.meterDirty = false
      outlet(OUTLET_OSC, ['/mixer/meters', numArrToJson(state.meterBuffer)])
    }
    state.meterFlushTask.schedule(METER_FLUSH_MS)
  }) as MaxTask
  state.meterFlushTask.schedule(METER_FLUSH_MS)
}

function stopMeterFlush() {
  if (!state.meterFlushTask) return
  state.meterFlushTask.cancel()
  state.meterFlushTask.freepeer()
  state.meterFlushTask = null
}

function sidebarMeters(val: number) {
  const enabled = !!parseInt(val.toString())
  state.metersEnabled = enabled
  osc('/sidebarMeters', state.metersEnabled ? 1 : 0)

  if (state.metersEnabled && state.hasOutput && state.trackLookupObj) {
    pointMetersAt(state.trackLookupObj.unquotedpath)
    if (!state.onMixerPage) startMeterFlush()
  } else {
    stopMeterFlush()
    disableMeters()
  }
}

function page() {
  const pageName = arguments[0].toString()
  const wasMixerPage = state.onMixerPage
  state.onMixerPage = pageName === 'mixer'

  if (!state.onMixerPage && wasMixerPage) {
    if (state.metersEnabled && state.hasOutput) startMeterFlush()
  } else if (state.onMixerPage && !wasMixerPage) {
    stopMeterFlush()
  }
}

// ---------------------------------------------------------------------------
// Send watcher management
// ---------------------------------------------------------------------------

const setSendWatcherIds = (sendIds: number[]) => {
  for (let i = 0; i < MAX_SENDS; i++) {
    if (sendIds[i] !== undefined) {
      state.watchers[i] && (state.watchers[i].id = sendIds[i])
    } else {
      state.watchers[i] && (state.watchers[i].id = 0)
      osc(SEND_ADDR[i], 0)
    }
  }
}

// ---------------------------------------------------------------------------
// Command handlers (called by Max message dispatch)
// ---------------------------------------------------------------------------

function updateSendVal(slot: number, val: number) {
  const idx = slot - 1
  if (!state.watchers[idx]) {
    return
  }
  pauseUnpause(state.pause['send'], PAUSE_MS)
  state.watchers[idx].set('value', val)
}

function handleSendDefault(slot: number) {
  const idx = slot - 1
  if (!state.watchers[idx]) {
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
    state.mixerObj.set('crossfade_assign', 1)
  } else {
    state.mixerObj.set('crossfade_assign', 0)
  }
}

function toggleXFadeB() {
  if (!state.mixerObj || state.mixerObj.id === 0) {
    return
  }
  const currState = parseInt(state.mixerObj.get('crossfade_assign'))
  if (currState === 2) {
    state.mixerObj.set('crossfade_assign', 1)
  } else {
    state.mixerObj.set('crossfade_assign', 2)
  }
}

function sendRecordStatus(lookupObj: LiveAPI) {
  const armStatus =
    parseInt(lookupObj.get('can_be_armed')) && parseInt(lookupObj.get('arm'))
  const trackInputStatus = getTrackInputStatus(lookupObj)
  const inputStatus = trackInputStatus && trackInputStatus.inputEnabled
  osc('/mixer/recordArm', armStatus ? 1 : 0)
  osc('/mixer/inputEnabled', inputStatus ? 1 : 0)
}

enum Intent {
  Enable,
  Disable,
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
    state.trackLookupObj.path = 'live_set'
    if (parseInt(state.trackLookupObj.get('exclusive_arm')) === 1) {
      const tracks = cleanArr(state.trackLookupObj.get('tracks'))
      for (const trackId of tracks) {
        if (trackId === parseInt(state.trackObj.id.toString())) {
          continue
        }
        state.trackLookupObj.id = trackId
        if (parseInt(state.trackLookupObj.get('can_be_armed'))) {
          state.trackLookupObj.set('arm', 0)
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
  const newState = currState ? 0 : 1
  state.trackObj.set('mute', newState)
  osc('/mixer/mute', newState)
}

function toggleSolo() {
  if (!state.trackObj || state.trackObj.id === 0) {
    return
  }
  const currState = parseInt(state.trackObj.get('solo'))
  const newState = currState ? 0 : 1

  if (newState) {
    state.trackLookupObj.path = 'live_set'
    if (parseInt(state.trackLookupObj.get('exclusive_solo')) === 1) {
      const tracks = cleanArr(state.trackLookupObj.get('tracks'))
      const returns = cleanArr(state.trackLookupObj.get('return_tracks'))
      for (const trackId of [...tracks, ...returns]) {
        if (trackId === parseInt(state.trackObj.id.toString())) {
          continue
        }
        state.trackLookupObj.id = trackId
        state.trackLookupObj.set('solo', 0)
      }
    }
  }
  state.trackObj.set('solo', newState)
  osc('/mixer/solo', newState)
}

function handleCrossfader(val: string) {
  if (!state.crossfaderObj || state.crossfaderObj.id === 0) {
    return
  }
  pauseUnpause(state.pause['crossfader'], PAUSE_MS)
  state.crossfaderObj.set('value', parseFloat(val))
}

function handleCrossfaderDefault() {
  if (!state.crossfaderObj || state.crossfaderObj.id === 0) {
    return
  }
  state.crossfaderObj.set(
    'value',
    parseFloat(state.crossfaderObj.get('default_value'))
  )
}

function handlePan(val: string) {
  if (!state.panObj || state.panObj.id === 0) {
    return
  }
  pauseUnpause(state.pause['pan'], PAUSE_MS)
  const fVal = parseFloat(val)
  state.panObj.set('value', fVal)
  const str = state.panObj.call('str_for_value', fVal) as any
  osc('/mixer/panStr', str ? str.toString() : '')
}

function handlePanDefault() {
  if (!state.panObj || state.panObj.id === 0) {
    return
  }
  const defVal = parseFloat(state.panObj.get('default_value'))
  state.panObj.set('value', defVal)
  osc('/mixer/pan', defVal)
  const str = state.panObj.call('str_for_value', defVal) as any
  osc('/mixer/panStr', str ? str.toString() : '')
}

function handleVol(val: string) {
  if (!state.volObj || state.volObj.id === 0) {
    return
  }
  pauseUnpause(state.pause['vol'], PAUSE_MS)
  const fVal = parseFloat(val)
  state.volObj.set('value', fVal)
  const str = state.volObj.call('str_for_value', fVal) as any
  osc('/mixer/volStr', str ? str.toString() : '')
}

function handleVolDefault() {
  if (!state.volObj || state.volObj.id === 0) {
    return
  }
  const defVal = parseFloat(state.volObj.get('default_value'))
  state.volObj.set('value', defVal)
  osc('/mixer/vol', defVal)
  const str = state.volObj.call('str_for_value', defVal) as any
  osc('/mixer/volStr', str ? str.toString() : '')
}

// ---------------------------------------------------------------------------
// Observer callbacks
// ---------------------------------------------------------------------------

const handleVolVal = (val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  if (!state.pause.vol.paused) {
    const fVal = parseFloat(val[1].toString()) || 0
    osc('/mixer/vol', fVal)
    const str = state.volObj.call('str_for_value', fVal) as any
    osc('/mixer/volStr', str ? str.toString() : '')
  }
}

const handlePanVal = (val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  if (!state.pause.pan.paused) {
    const fVal = parseFloat(val[1].toString()) || 0
    osc('/mixer/pan', fVal)
    const str = state.panObj.call('str_for_value', fVal) as any
    osc('/mixer/panStr', str ? str.toString() : '')
  }
}

const handleCrossfaderVal = (val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  if (!state.pause.crossfader.paused) {
    osc('/mixer/crossfader', val[1] || 0)
  }
}

const handleSendVal = (idx: number, val: IdObserverArg) => {
  if (val[0] !== 'value') {
    return
  }
  if (!state.pause.send.paused) {
    osc(SEND_ADDR[idx], val[1] || 0)
  }
}

// ---------------------------------------------------------------------------
// Track change handler
// ---------------------------------------------------------------------------

const onTrackChange = (args: IdObserverArg) => {
  if (!state.trackObj) {
    return
  }
  if (args[1].toString() !== 'id') {
    return
  }

  const id = cleanArr(args)[0]

  if (id === state.lastTrackId) {
    return
  }
  state.lastTrackId = id
  state.trackLookupObj.id = id

  // track type
  const path = state.trackLookupObj.unquotedpath
  let trackType = TYPE_TRACK
  let isMain = false
  if (path.indexOf('live_set master_track') === 0) {
    trackType = TYPE_MAIN
    isMain = true
  } else if (path.indexOf('live_set return_tracks') === 0) {
    trackType = TYPE_RETURN
  } else if (parseInt(state.trackLookupObj.get('is_foldable')) === 1) {
    trackType = TYPE_GROUP
  }
  osc('/mixer/type', trackType)

  // record / input status
  sendRecordStatus(state.trackLookupObj)

  // mute / solo
  if (!isMain) {
    osc('/mixer/mute', parseInt(state.trackLookupObj.get('mute')))
    osc('/mixer/solo', parseInt(state.trackLookupObj.get('solo')))
  } else {
    osc('/mixer/mute', 0)
    osc('/mixer/solo', 0)
  }

  // has_audio_output
  const trackInfo = state.trackLookupObj.info.toString()
  state.hasOutput =
    trackInfo.indexOf('has_audio_output') > -1
      ? !!parseInt(state.trackLookupObj.get('has_audio_output'))
      : false
  osc('/mixer/hasOutput', state.hasOutput ? 1 : 0)

  // meters — repoint or disable
  if (state.metersEnabled && state.hasOutput) {
    pointMetersAt(path)
    if (!state.onMixerPage) startMeterFlush()
  } else {
    stopMeterFlush()
    disableMeters()
  }

  // crossfade assign
  if (!isMain) {
    const xfade = parseInt(state.mixerObj.get('crossfade_assign'))
    osc('/mixer/xFadeA', xfade === 0 ? 1 : 0)
    osc('/mixer/xFadeB', xfade === 2 ? 1 : 0)
  } else {
    osc('/mixer/xFadeA', 0)
    osc('/mixer/xFadeB', 0)
  }

  // track color
  osc('/mixer/trackColor', parseInt(state.trackLookupObj.get('color')))

  // vol/pan str
  const volVal = parseFloat(state.volObj.get('value')) || 0
  osc('/mixer/vol', volVal)
  const volStr = state.volObj.call('str_for_value', volVal) as any
  osc('/mixer/volStr', volStr ? volStr.toString() : '')

  const panVal = parseFloat(state.panObj.get('value')) || 0
  osc('/mixer/pan', panVal)
  const panStr = state.panObj.call('str_for_value', panVal) as any
  osc('/mixer/panStr', panStr ? panStr.toString() : '')
}

const onReturnsChange = (args: IdObserverArg) => {
  if (!state.returnsObj || args[0] !== 'return_tracks') {
    return
  }
  const returnIds = cleanArr(args)
  setSendWatcherIds(returnIds)
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

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

  // Send watchers
  for (let i = 0; i < MAX_SENDS; i++) {
    const watcher = new LiveAPI(
      (val: IdObserverArg) => handleSendVal(i, val),
      'live_set'
    )
    state.watchers.push(watcher)
    watcher.property = 'value'
  }

  // Lookup obj for querying track properties on change
  if (!state.trackLookupObj) {
    state.trackLookupObj = new LiveAPI(noFn, 'live_set')
  }

  // Return tracks watcher
  if (!state.returnsObj) {
    state.returnsObj = new LiveAPI(onReturnsChange, 'live_set')
    state.returnsObj.property = 'return_tracks'
    state.returnsObj.mode = 1
  }

  // Mixer obj (follows selected track)
  if (!state.mixerObj) {
    state.mixerObj = new LiveAPI(
      noFn,
      'live_set view selected_track mixer_device'
    )
    state.mixerObj.mode = 1
  }

  // Volume obj (follows selected track)
  if (!state.volObj) {
    state.volObj = new LiveAPI(
      handleVolVal,
      'live_set view selected_track mixer_device volume'
    )
    state.volObj.mode = 1
    state.volObj.property = 'value'
  }

  // Pan obj (follows selected track)
  if (!state.panObj) {
    state.panObj = new LiveAPI(
      handlePanVal,
      'live_set view selected_track mixer_device panning'
    )
    state.panObj.property = 'value'
    state.panObj.mode = 1
  }

  // Track obj (follows selected track)
  // NOTE: must be created AFTER volObj, panObj, mixerObj because setting
  // trackObj.property = 'id' fires onTrackChange synchronously, which
  // reads from those objects.
  if (!state.trackObj) {
    state.trackObj = new LiveAPI(onTrackChange, 'live_set view selected_track')
    state.trackObj.mode = 1
    state.trackObj.property = 'id'
  }

  // Crossfader obj (always master track)
  if (!state.crossfaderObj) {
    state.crossfaderObj = new LiveAPI(
      handleCrossfaderVal,
      'live_set master_track mixer_device crossfader'
    )
    state.crossfaderObj.property = 'value'
    state.crossfaderObj.mode = 1
  }

  // Restore meters state from settings dict
  state.metersEnabled = !!loadSetting('metersEnabled')
  osc('/sidebarMeters', state.metersEnabled ? 1 : 0)
}

log('reloaded k4-sidebarMixer')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
