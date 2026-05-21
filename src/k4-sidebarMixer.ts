import {
  cleanArr,
  colorToString,
  fixFloat,
  logFactory,
  setOscSink,
  meterVal,
  osc,
  pauseUnpause,
  PauseState,
  SEND_ADDR,
} from './utils'
import config from './config'
import {
  noFn,
  DEFAULT_COLOR,
  MAX_SENDS,
  PAUSE_MS,
  METER_FLUSH_MS,
  TYPE_TRACK,
  TYPE_MAIN,
  TYPE_RETURN,
  TYPE_GROUP,
} from './consts'
import {
  handleExclusiveArm,
  toggleXFade,
  enableArm,
  disableArm,
  disableTrackInput,
  getRecordStatus,
  setParamValue,
  resetParamValue,
  effectiveMute,
  toggleMute as toggleMuteShared,
  toggleSolo as toggleSoloShared,
  xfadeAB,
} from './mixerUtils'

const log = logFactory(config)

// Orchestrator context (set in doRefresh/init) — per-instance persistence.
let ctx: AppContext = null

log('loaded k4-sidebarMixer')

const state = {
  trackLookupObj: null as LiveAPI,
  returnTrackColors: [] as string[],
  returnsObj: null as LiveAPI,
  mixerObj: null as LiveAPI,
  trackObj: null as LiveAPI,
  lastTrackId: 0 as number,
  volObj: null as LiveAPI,
  panObj: null as LiveAPI,
  muteObj: null as LiveAPI,
  mutedViaSoloObj: null as LiveAPI,
  xfadeAssignObj: null as LiveAPI,
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
      osc('/mixer/meters', state.meterBuffer)
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

function page(pageNameArg: string) {
  const pageName = pageNameArg.toString()
  const wasMixerPage = state.onMixerPage
  state.onMixerPage = pageName === 'mixer' || pageName === 'session'

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
    if (!state.watchers[i]) continue
    state.watchers[i].property = ''
    if (sendIds[i] !== undefined) {
      state.watchers[i].id = sendIds[i]
      if (state.watchers[i].type === 'DeviceParameter') {
        state.watchers[i].property = 'value'
      } else {
        log(
          'send watcher',
          i,
          'expected DeviceParameter, got',
          state.watchers[i].type
        )
        state.watchers[i].id = 0
        osc(SEND_ADDR[i], 0)
      }
    } else {
      state.watchers[i].id = 0
      osc(SEND_ADDR[i], 0)
    }
  }
  osc('/mixer/numSends', sendIds.length)
}

function updateSendsFromMixer() {
  if (!state.mixerObj || +state.mixerObj.id === 0) return
  const sendIds = cleanArr(state.mixerObj.get('sends') as any)
  setSendWatcherIds(sendIds)
}

const sendReturnTrackColors = () => {
  osc('/mixer/returnTrackColors', state.returnTrackColors)
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
  toggleXFade(state.mixerObj, 0)
}

function toggleXFadeB() {
  toggleXFade(state.mixerObj, 2)
}

function sendRecordStatus(lookupObj: LiveAPI) {
  const status = getRecordStatus(lookupObj)
  osc('/mixer/recordArm', status.armStatus)
  osc('/mixer/inputEnabled', status.inputEnabled ? 1 : 0)
}

function disableInput() {
  disableTrackInput(state.trackObj)
  sendRecordStatus(state.trackObj)
}

function enableRecord() {
  if (!state.trackObj || +state.trackObj.id === 0) return
  enableArm(state.trackObj, state.trackLookupObj)
  sendRecordStatus(state.trackObj)
}

function disableRecord() {
  if (!state.trackObj || +state.trackObj.id === 0) return
  disableArm(state.trackObj)
  sendRecordStatus(state.trackObj)
}

function toggleMute() {
  if (!state.trackObj || +state.trackObj.id === 0) {
    return
  }
  toggleMuteShared(state.trackObj)
  emitEffectiveMute()
}

// Effective mute = mute || muted_via_solo (the user sees both as "muted").
// Reads via trackLookupObj since it always points at the currently-displayed
// track; toggleMute writes via trackObj but the result is the same row.
function emitEffectiveMute() {
  if (!state.trackLookupObj || +state.trackLookupObj.id === 0) return
  osc('/mixer/mute', effectiveMute(state.trackLookupObj))
}

function handleMuteChange(args: IArguments) {
  if (args[0] === 'mute' || args[0] === 'muted_via_solo') {
    emitEffectiveMute()
  }
}

function emitXfadeAssign() {
  if (!state.mixerObj || +state.mixerObj.id === 0) return
  const [aOn, bOn] = xfadeAB(state.mixerObj)
  osc('/mixer/xFadeA', aOn)
  osc('/mixer/xFadeB', bOn)
}

function handleXfadeAssignChange(args: IArguments) {
  if (args[0] === 'crossfade_assign') {
    emitXfadeAssign()
  }
}

function toggleSolo() {
  if (!state.trackObj || +state.trackObj.id === 0) {
    return
  }
  const newState = toggleSoloShared(state.trackObj, state.trackLookupObj)
  osc('/mixer/solo', newState)
}

function handleCrossfader(val: string) {
  if (!state.crossfaderObj || +state.crossfaderObj.id === 0) {
    return
  }
  pauseUnpause(state.pause['crossfader'], PAUSE_MS)
  state.crossfaderObj.set('value', parseFloat(val))
}

function handleCrossfaderDefault() {
  if (!state.crossfaderObj || +state.crossfaderObj.id === 0) {
    return
  }
  state.crossfaderObj.set(
    'value',
    parseFloat(state.crossfaderObj.get('default_value'))
  )
}

function handlePan(val: string) {
  if (!state.panObj || +state.panObj.id === 0) {
    return
  }
  pauseUnpause(state.pause['pan'], PAUSE_MS)
  osc('/mixer/panStr', setParamValue(state.panObj, val))
}

function handlePanDefault() {
  const res = resetParamValue(state.panObj)
  if (!res) return
  osc('/mixer/pan', res.value)
  osc('/mixer/panStr', res.str)
}

function handleVol(val: string) {
  if (!state.volObj || +state.volObj.id === 0) {
    return
  }
  pauseUnpause(state.pause['vol'], PAUSE_MS)
  osc('/mixer/volStr', setParamValue(state.volObj, val))
}

function handleVolDefault() {
  const res = resetParamValue(state.volObj)
  if (!res) return
  osc('/mixer/vol', res.value)
  osc('/mixer/volStr', res.str)
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
    const str = state.volObj.call('str_for_value', fixFloat(fVal)) as any
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
    const str = state.panObj.call('str_for_value', fixFloat(fVal)) as any
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

let trackChangeDebounce: MaxTask = null

const onTrackChange = (args: IdObserverArg) => {
  if (!state.trackObj) {
    return
  }
  // Property name is at args[0] per the type declaration; the historical
  // `args[1] !== 'id'` check was accidentally correct in [js] (which used to
  // deliver args reversed) and broke under [v8].
  if (args[0] !== 'id') {
    return
  }

  const id = cleanArr(args)[0]

  if (id === state.lastTrackId) {
    return
  }
  state.lastTrackId = id

  if (trackChangeDebounce) {
    trackChangeDebounce.cancel()
  }
  trackChangeDebounce = new Task(function () {
    handleTrackChange(id)
  }) as MaxTask
  trackChangeDebounce.schedule(40)
}

function handleTrackChange(id: number) {
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

  // mute / solo — master has neither property. Repoint the observers to the
  // selected track first, then attach the property (skip both on master to
  // avoid v8 warnings).
  if (!isMain) {
    state.muteObj.property = ''
    state.muteObj.path = path
    state.muteObj.property = 'mute'
    state.mutedViaSoloObj.property = ''
    state.mutedViaSoloObj.path = path
    state.mutedViaSoloObj.property = 'muted_via_solo'
    emitEffectiveMute()
    osc('/mixer/solo', parseInt(state.trackLookupObj.get('solo')))
  } else {
    state.muteObj.property = ''
    state.mutedViaSoloObj.property = ''
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

  // crossfade assign — every track type except master has it (returns
  // included). Detach on master to avoid v8 warnings.
  if (!isMain) {
    state.xfadeAssignObj.property = ''
    state.xfadeAssignObj.path = path + ' mixer_device'
    state.xfadeAssignObj.property = 'crossfade_assign'
    emitXfadeAssign()
  } else {
    state.xfadeAssignObj.property = ''
    osc('/mixer/xFadeA', 0)
    osc('/mixer/xFadeB', 0)
  }

  // track color
  osc('/mixer/trackColor', parseInt(state.trackLookupObj.get('color')))

  // vol/pan str
  const volVal = parseFloat(state.volObj.get('value')) || 0
  osc('/mixer/vol', volVal)
  const volStr = state.volObj.call('str_for_value', fixFloat(volVal)) as any
  osc('/mixer/volStr', volStr ? volStr.toString() : '')

  const panVal = parseFloat(state.panObj.get('value')) || 0
  osc('/mixer/pan', panVal)
  const panStr = state.panObj.call('str_for_value', fixFloat(panVal)) as any
  osc('/mixer/panStr', panStr ? panStr.toString() : '')

  // sends
  updateSendsFromMixer()
}

const onReturnsChange = (args: IdObserverArg) => {
  if (!state.returnsObj || args[0] !== 'return_tracks') {
    return
  }
  const returnIds = cleanArr(args)
  for (let i = 0; i < MAX_SENDS; i++) {
    let color = DEFAULT_COLOR
    if (returnIds[i]) {
      state.trackLookupObj.id = returnIds[i]
      color = colorToString(state.trackLookupObj.get('color').toString())
    }
    state.returnTrackColors[i] = '#' + color
  }
  sendReturnTrackColors()
  // Return track count changed — re-query sends for the selected track
  updateSendsFromMixer()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function doRefresh(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
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

  // Mute + muted_via_solo observers — NOT mode=1. Master track has neither
  // property, and a mode=1 observer would re-attach itself the instant the
  // selection changes (before handleTrackChange's debounced clear runs),
  // producing "Main track has no 'mute' property!" warnings. We manage path
  // and property explicitly from handleTrackChange instead.
  if (!state.muteObj) {
    state.muteObj = new LiveAPI(handleMuteChange, 'live_set')
  }
  if (!state.mutedViaSoloObj) {
    state.mutedViaSoloObj = new LiveAPI(handleMuteChange, 'live_set')
  }

  // Crossfade assign observer — lives on the track's mixer_device, not the
  // track itself. Master's mixer_device lacks crossfade_assign, so same
  // detach-on-master pattern as the mute observers.
  if (!state.xfadeAssignObj) {
    state.xfadeAssignObj = new LiveAPI(handleXfadeAssignChange, 'live_set')
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

  // Restore meters state from settings dict; carry forward from pre-[v8] sets
  // (old key "<port>_metersEnabled" in the shared [dict settingsDict]).
  // TODO(cleanup, after 2026-07-01 / v65): remove — see k4-settings legacy bridge.
  let meters = ctx.settings.get('metersEnabled')
  if (meters === null || meters === undefined) {
    const legacy = ctx.settings.legacyGet('metersEnabled')
    if (legacy !== null && legacy !== undefined) {
      meters = legacy
      ctx.settings.set('metersEnabled', legacy)
    }
  }
  state.metersEnabled = !!meters
  osc('/sidebarMeters', state.metersEnabled ? 1 : 0)
}

// Route table — the single-track mixer commands (old router OUTLET_MIXER).
const routes: Route[] = [
  { prefix: '/mixer/volDefault', parse: 'val', fn: handleVolDefault },
  { prefix: '/mixer/panDefault', parse: 'bare', fn: handlePanDefault },
  { prefix: '/mixer/crossfaderDefault', parse: 'bare', fn: handleCrossfaderDefault },
  { prefix: '/mixer/sendDefault', parse: 'slot', fn: handleSendDefault },
  { prefix: '/mixer/send', parse: 'slotVal', fn: updateSendVal, coalesce: true },
  { prefix: '/mixer/toggleXFadeA', parse: 'bare', fn: toggleXFadeA },
  { prefix: '/mixer/toggleXFadeB', parse: 'bare', fn: toggleXFadeB },
  { prefix: '/mixer/disableInput', parse: 'bare', fn: disableInput },
  { prefix: '/mixer/enableRecord', parse: 'bare', fn: enableRecord },
  { prefix: '/mixer/disableRecord', parse: 'bare', fn: disableRecord },
  { prefix: '/mixer/toggleSolo', parse: 'bare', fn: toggleSolo },
  { prefix: '/mixer/toggleMute', parse: 'bare', fn: toggleMute },
  { prefix: '/mixer/pan', parse: 'val', fn: handlePan, coalesce: true },
  { prefix: '/mixer/vol', parse: 'val', fn: handleVol, coalesce: true },
  { prefix: '/mixer/crossfader', parse: 'val', fn: handleCrossfader, coalesce: true },
]

log('reloaded k4-sidebarMixer')

// init() early-returns once observers exist, so use doRefresh (full reset +
// rebuild) as the entry's init/refresh hook to re-push on app reconnect.
export { routes, page, sidebarMeters }
export { doRefresh as init }
