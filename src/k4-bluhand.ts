// [v8 k4-bluhand] entry node. Single object in the patcher that owns all
// bluhand behavior: device/parameter observers, transport + name/color
// observers, the 16 parameter slots (k4-bluhandSlots), and bank navigation.
// Bank-layout computation lives in k4-bluhandBanks; per-slot parameter control
// lives in k4-bluhandSlots.

import {
  cleanArr,
  dequote,
  isDeviceSupported,
  logFactory,
  osc,
} from './utils'
import config from './config'
import { noFn, OUTLET_MSGS } from './consts'
import {
  deprecatedDeviceDelta,
  deprecatedTrackDelta,
} from './deprecatedMethods'
import { getBankParamArr } from './k4-bluhandBanks'
import * as Slots from './k4-bluhandSlots'

const log = logFactory(config)

// On the [v8 knobbler] entry, outlet 1 carries bkMap messages to the
// [s ---KNOBBLER] receiver. (Same index the standalone object used.)
const OUTLET_KNOBBLER = OUTLET_MSGS

const state = {
  devicePath: null as string,
  onOffWatcher: null as LiveAPI,
  paramsWatcher: null as LiveAPI,
  variationsWatcher: null as LiveAPI,
  currDeviceId: 0 as number,
  currBank: 1,
  numBanks: 1,
  bankParamArr: [] as BluhandBank[],
  cuePointsWatcher: null as LiveAPI,
  cuePointNames: [] as LiveAPI[],
  cuePointTimes: [] as LiveAPI[],
}

// --- Bank display ----------------------------------------------------------

function sendBankNames() {
  const currBankIdx = state.currBank - 1
  const banks = state.bankParamArr.map((bank, idx) => {
    return { name: bank.name, sel: idx === currBankIdx }
  })
  osc('/bBanks', banks)
}

const sendCurrBankTask = new Task(sendCurrBank)
function debounceSendCurrBank() {
  sendCurrBankTask.cancel()
  sendCurrBankTask.schedule(20)
}

function sendCurrBank() {
  const currBankIdx = Math.max(0, state.currBank - 1)
  if (!state.bankParamArr || !state.bankParamArr[currBankIdx]) {
    sendBankNames()
    return
  }
  const bluBank = state.bankParamArr[currBankIdx]
  osc('/bTxtCurrBank', bluBank.name)
  while (bluBank.paramIdxArr.length < Slots.NUM_BLU_SLOTS) {
    bluBank.paramIdxArr.push(-1)
  }
  bluBank.paramIdxArr.forEach((paramIdx, idx) => {
    Slots.setParamIdx(idx + 1, paramIdx)
  })
  sendBankNames()
}

function gotoBank(idx: number) {
  if (idx > 0 && idx <= state.numBanks) {
    state.currBank = idx
  }
  sendCurrBank()
}
function bankNext() {
  if (state.currBank < state.numBanks) {
    state.currBank++
  }
  sendCurrBank()
}
function bankPrev() {
  if (state.currBank > 0) {
    state.currBank--
  }
  sendCurrBank()
}

// --- Slot message handlers (delegate to k4-bluhandSlots) -------------------

// new value over OSC for a bluhand slot
function val(slot: number, value: number) {
  Slots.val(slot, value)
}
// reset a bluhand slot to its parameter default (router msg renamed from
// 'default' since that is a reserved word and cannot be a [v8] function)
function bSetDefault(slot: number) {
  Slots.setDefault(slot)
}
// map the parameter currently shown in bluhand slot `bluSlot` onto knobbler
// slot `knobblerSlot`
function bkMap(bluSlot: number, knobblerSlot: number) {
  const paramId = Slots.getParamId(bluSlot)
  if (paramId === 0) {
    return
  }
  outlet(OUTLET_KNOBBLER, 'bkMap', knobblerSlot, paramId)
}

// --- Selected device parameter tracking ------------------------------------

const pcDebounce = new Task(onParameterChange)
function debouncedParameterChange(args: IdObserverArg) {
  if (args[0].toString() !== 'parameters') {
    return
  }
  pcDebounce.cancel()
  pcDebounce.schedule(20)
}

function onParameterChange() {
  const api = state.paramsWatcher
  if (+api.id === 0) {
    return
  }
  const isSupported = isDeviceSupported(api)
  const deviceType = isSupported ? api.get('class_name').toString() : api.type
  let paramIds = isSupported ? cleanArr(api.get('parameters')) : []

  if (paramIds.length === 0) {
    state.onOffWatcher && (state.onOffWatcher.id = 0)
  } else {
    const onOffParamId = paramIds.shift() // remove device on/off
    if (!state.onOffWatcher) {
      state.onOffWatcher = new LiveAPI(updateDeviceOnOff, 'id ' + onOffParamId)
      state.onOffWatcher.property = 'value'
    } else {
      state.onOffWatcher.id = onOffParamId
    }
  }

  const canHaveChains =
    isDeviceSupported(api) && parseInt(api.get('can_have_chains'))
  if (canHaveChains) {
    // see if we should slice off some macros
    const numMacros = parseInt(api.get('visible_macro_count'))
    if (numMacros) {
      paramIds = paramIds.slice(0, numMacros)
      if (numMacros > 1) {
        // put filler in the macros to look more like the
        // even 2-row split that Live shows
        const halfMacros = numMacros / 2
        const filler = Array(8 - halfMacros)
        for (let i = 0; i < filler.length; i++) {
          filler[i] = 0
        }
        paramIds = [
          ...paramIds.slice(0, halfMacros),
          ...filler,
          ...paramIds.slice(halfMacros, numMacros),
          ...filler,
        ]
      }
    }
  }

  if (state.paramsWatcher.id !== state.currDeviceId) {
    // changed device, reset bank
    state.currBank = 1
    state.currDeviceId = state.paramsWatcher.id
  }

  state.devicePath = api.unquotedpath

  if (!canHaveChains) {
    // null send variation stuff
    osc('/blu/variations', '')
  } else {
    // Push variation state from here (the reliable 'parameters' observer that
    // fires on every device selection) rather than relying solely on the
    // variation_count observer, which only exists on racks and fires
    // unreliably when selection follows into one.
    const varCount = +api.get('variation_count')
    const varSelected = +api.get('selected_variation_index')
    osc('/blu/variations', { count: varCount, selected: varSelected })
  }
  state.bankParamArr = getBankParamArr(paramIds, deviceType, api)
  state.numBanks = state.bankParamArr.length

  if (state.currBank > state.numBanks) {
    state.currBank = state.numBanks
  }

  debounceSendCurrBank()
}

function toggleOnOff() {
  if (!state.onOffWatcher) {
    return
  }
  const currVal = parseInt(state.onOffWatcher.get('value'))
  state.onOffWatcher.set('value', currVal ? 0 : 1)
}

function updateDeviceOnOff(iargs: IArguments) {
  const args = arrayfromargs(iargs)
  if (args[0] === 'value') {
    osc('/bOnOff', parseInt(args[1]))
  }
}

// --- Variations ------------------------------------------------------------

function onVariationChange() {
  const api = getSelectedDeviceApi()
  if (+api.id === 0) {
    return
  }
  if (!+api.get('can_have_chains')) {
    // only applies to racks
    return
  }
  const varCount = +api.get('variation_count')
  const varSelected = +api.get('selected_variation_index')
  osc('/blu/variations', { count: varCount, selected: varSelected })
}

function variationNew() {
  const api = getSelectedDeviceApi()
  if (+api.id === 0) {
    return
  }
  if (!+api.get('can_have_chains')) {
    return
  }
  api.call('store_variation')
  const numVariations = +api.get('variation_count') || 1
  api.set('selected_variation_index', numVariations - 1)
  onVariationChange()
}
function variationDelete(idx: number) {
  const api = getSelectedDeviceApi()
  if (+api.id === 0) {
    return
  }
  if (!+api.get('can_have_chains')) {
    return
  }
  api.set('selected_variation_index', idx)
  api.call('delete_selected_variation')
}
function variationRecall(idx: number) {
  const api = getSelectedDeviceApi()
  if (+api.id === 0) {
    return
  }
  if (!+api.get('can_have_chains')) {
    return
  }
  api.set('selected_variation_index', idx)
  api.call('recall_selected_variation')
  onVariationChange()
}
function randomMacros() {
  const api = getSelectedDeviceApi()
  if (+api.id === 0) {
    return
  }
  if (!+api.get('can_have_chains')) {
    return
  }
  api.call('randomize_macros')
}

// --- Cue points ------------------------------------------------------------

function sendCuePoints() {
  const api = getUtilApi()
  api.goto('live_set')
  let numerator = parseFloat(api.get('signature_numerator').toString())
  if (typeof numerator !== 'number' || numerator <= 0) {
    numerator = 4
    log('Warning: Could not retrieve time signature. Defaulting to 4/4.')
  }

  const result = state.cuePointNames.map((cuePoint, idx) => {
    const cuePointTime = parseFloat(cuePoint.get('time'))
    const rawBarIndex = Math.floor(cuePointTime / numerator)
    const rawBeatIndex = cuePointTime % numerator
    const displayBar = rawBarIndex + 1
    let displayBeat = rawBeatIndex + 1
    displayBeat = Math.floor(displayBeat)
    const displaySixteenths = Math.floor((cuePointTime % 1.0) * 4) + 1
    const disp = displayBar + '.' + displayBeat + '.' + displaySixteenths

    return {
      idx,
      name: cuePoint.get('name').toString(),
      time: cuePointTime,
      disp,
    }
  })
  osc('/cuePoints', result)
}

const sendCuePointsTask = new Task(sendCuePoints)
function debounceSendCuePoints() {
  sendCuePointsTask.cancel()
  sendCuePointsTask.schedule(20)
}

function onCuePointNameChange(args: IArguments) {
  if (args[0] !== 'name') {
    return
  }
  debounceSendCuePoints()
}
function onCuePointTimeChange(args: IArguments) {
  if (args[0] !== 'time') {
    return
  }
  debounceSendCuePoints()
}

function cuePointsChange(args: IArguments) {
  if (args[0] !== 'cue_points') {
    return
  }
  const cuePointIds = cleanArr(arrayfromargs(args) as IdObserverArg)

  state.cuePointNames = []
  state.cuePointTimes = []
  for (const cuePointId of cuePointIds) {
    const nameApi = new LiveAPI(onCuePointNameChange, 'id ' + cuePointId)
    nameApi.property = 'name'
    state.cuePointNames.push(nameApi)

    const timeApi = new LiveAPI(onCuePointTimeChange, 'id ' + cuePointId)
    timeApi.property = 'time'
    state.cuePointTimes.push(timeApi)
  }
  debounceSendCuePoints()
}

function playCuePoint(val: number) {
  const api = new LiveAPI(null, 'live_set cue_points ' + val)
  if (api.id) {
    api.call('jump')
    const ctlApi = getLiveSetApi()
    const isPlaying = parseInt(ctlApi.get('is_playing'))
    if (!isPlaying) {
      ctlApi.call('start_playing')
    }
  }
}
function gotoCuePoint(val: number) {
  const api = new LiveAPI(null, 'live_set cue_points ' + val)
  if (api.id) {
    api.call('jump')
  }
}

// --- Transport observers ---------------------------------------------------

const transportObservers: LiveAPI[] = []
const TRANSPORT_MAP: [string, string][] = [
  ['is_playing', '/isPlaying'],
  ['loop', '/loop'],
  ['tempo', '/tempo'],
  ['metronome', '/metronome'],
  ['record_mode', '/recordMode'],
  ['session_record', '/sessionRecord'],
  ['arrangement_overdub', '/arrangementOverdub'],
  ['re_enable_automation_enabled', '/reEnableAutomationEnabled'],
]
function makeTransportCb(prop: string, addr: string) {
  return function (args: IArguments) {
    if (args[0] !== prop) {
      return
    }
    osc(addr, parseFloat(args[1] as any))
  }
}
function initTransportObservers() {
  if (transportObservers.length) {
    return
  }
  for (const pair of TRANSPORT_MAP) {
    const api = new LiveAPI(makeTransportCb(pair[0], pair[1]), 'live_set')
    api.property = pair[0]
    transportObservers.push(api)
  }
}

// --- Selected track/device name + track color ------------------------------

let trackName = ''
let deviceName = ''
let trackNameApi: LiveAPI = null
let deviceNameApi: LiveAPI = null
let trackColorApi: LiveAPI = null

function emitCurrDeviceName() {
  osc('/bcurrDeviceName', trackName + ' > ' + deviceName)
}

function initNameColorObservers() {
  if (trackNameApi) {
    return
  }
  trackNameApi = new LiveAPI(function (args: IArguments) {
    if (args[0] !== 'name') {
      return
    }
    trackName = dequote(args[1].toString())
    emitCurrDeviceName()
  }, 'live_set view selected_track')
  trackNameApi.mode = 1
  trackNameApi.property = 'name'

  deviceNameApi = new LiveAPI(function (args: IArguments) {
    if (args[0] !== 'name') {
      return
    }
    deviceName = dequote(args[1].toString())
    emitCurrDeviceName()
  }, 'live_set view selected_track view selected_device')
  deviceNameApi.mode = 1
  deviceNameApi.property = 'name'

  trackColorApi = new LiveAPI(function (args: IArguments) {
    if (args[0] !== 'color') {
      return
    }
    Slots.setColor(args[1].toString())
  }, 'live_set view selected_track')
  trackColorApi.mode = 1
  trackColorApi.property = 'color'
}

// Re-push all bluhand state to a (re)connecting client. Called at the end of
// init() so the existing 'init' trigger (fired on app refresh) re-syncs the
// client; [v8] reserves the `refresh` selector, so we never route it here.
function pushState() {
  const api = getLiveSetApi()
  for (const pair of TRANSPORT_MAP) {
    osc(pair[1], parseFloat(api.get(pair[0])))
  }
  emitCurrDeviceName()
  onVariationChange()
  sendCurrBank()
}

// --- Navigation ------------------------------------------------------------

function unfoldParentTracks(objId: number) {
  const util = getUtilApi()
  util.id = objId
  if (+util.id === 0) {
    return
  }
  let counter = 0
  while (counter < 20) {
    const isFoldable =
      util.type === 'Track' && parseInt(util.get('is_foldable'))
    if (isFoldable) {
      const foldState = parseInt(util.get('fold_state'))
      if (foldState === 1) {
        util.set('fold_state', 0)
      }
    }
    util.id = parseInt(util.get('canonical_parent')[1] as any)
    if (util.type === 'Song') {
      break
    }
    counter++
  }
}

function getParentTrackForDevice(deviceId: number) {
  const util = new LiveAPI(noFn, 'id ' + deviceId)
  if (isDeviceSupported(util)) {
    let counter = 0
    while (counter < 20) {
      util.id = parseInt(util.get('canonical_parent')[1] as any)
      if (util.type === 'Track') {
        return +util.id
      }
      counter++
    }
  }
  return 0
}

function gotoDevice(deviceIdStr: string) {
  const deviceId = parseInt(deviceIdStr)
  if (deviceId === 0) {
    return
  }
  const api = getLiveSetViewApi()
  const trackId = getParentTrackForDevice(deviceId)
  if (trackId === 0) {
    log('no track for device ' + deviceId)
  } else {
    gotoTrack(trackId.toString())
  }
  api.call('select_device', ['id', deviceId])
}

function hideChains(deviceId: string) {
  const obj = new LiveAPI(noFn, 'id ' + deviceId)
  if (+obj.id === 0) {
    return
  }
  if (isDeviceSupported(obj) && +obj.get('can_have_chains')) {
    obj.goto('view')
    obj.set('is_showing_chain_devices', 0)
  }
}

function gotoChain(chainIdStr: string) {
  const chainId = parseInt(chainIdStr)
  unfoldParentTracks(chainId)
  const viewApi = getLiveSetViewApi()
  const api = getUtilApi()
  api.id = chainId
  const devices = cleanArr(api.get('devices'))
  if (devices && devices[0]) {
    viewApi.call('select_device', ['id', devices[0]])
    return
  }
}

function toggleGroup(groupId: number) {
  const util = getUtilApi()
  util.id = groupId
  if (+util.id === 0) {
    log('ERROR: Invalid id ' + groupId)
    return
  }
  const isFoldable = util.type === 'Track' && parseInt(util.get('is_foldable'))
  if (!isFoldable) {
    log('ERROR: Not foldable ' + groupId)
  }
  const foldState = parseInt(util.get('fold_state'))
  util.set('fold_state', foldState ? 0 : 1)
}

function gotoTrack(trackIdStr: string) {
  const trackId = parseInt(trackIdStr)
  const util = getUtilApi()
  util.id = trackId
  if (+util.id !== 0) {
    let counter = 0
    while (counter < 20) {
      const groupIds = cleanArr(util.get('group_track'))
      if (!groupIds.length) break
      util.id = groupIds[0]
      if (+util.id === 0) break
      const foldState = parseInt(util.get('fold_state').toString())
      if (foldState === 1) {
        util.set('fold_state', 0)
      }
      counter++
    }
  }
  const api = getLiveSetViewApi()
  api.set('selected_track', ['id', trackId])
}

// --- Reusable LiveAPI handles ----------------------------------------------

let utilApi: LiveAPI = null
function getUtilApi() {
  if (!utilApi) {
    utilApi = new LiveAPI(noFn, 'live_set')
  }
  return utilApi
}
let selectedDeviceApi: LiveAPI = null
function getSelectedDeviceApi() {
  if (!selectedDeviceApi) {
    selectedDeviceApi = new LiveAPI(
      noFn,
      'live_set view selected_track view selected_device'
    )
    selectedDeviceApi.mode = 1
  }
  return selectedDeviceApi
}
let liveSetViewApi: LiveAPI = null
function getLiveSetViewApi() {
  if (!liveSetViewApi) {
    liveSetViewApi = new LiveAPI(noFn, 'live_set view')
  }
  return liveSetViewApi
}
let liveSetApi: LiveAPI = null
function getLiveSetApi() {
  if (!liveSetApi) {
    liveSetApi = new LiveAPI(noFn, 'live_set')
  }
  return liveSetApi
}

// --- Transport controls ----------------------------------------------------

function toggleMetronome() {
  const api = getLiveSetApi()
  const metroVal = parseInt(api.get('metronome'))
  api.set('metronome', metroVal ? 0 : 1)
}
function tapTempo() {
  const api = getLiveSetApi()
  api.call('tap_tempo')
}
function setTempo(val: number) {
  const api = getLiveSetApi()
  api.set('tempo', val)
}
function btnSkipPrev() {
  getLiveSetApi().call('jump_to_prev_cue')
}
function btnSkipNext() {
  getLiveSetApi().call('jump_to_next_cue')
}
function btnReEnableAutomation() {
  getLiveSetApi().call('re_enable_automation')
}
function btnLoop() {
  const ctlApi = getLiveSetApi()
  const isLoop = parseInt(ctlApi.get('loop'))
  ctlApi.set('loop', isLoop ? 0 : 1)
}
function btnCaptureMidi() {
  getLiveSetApi().call('capture_midi')
}
function btnArrangementOverdub() {
  const ctlApi = getLiveSetApi()
  const isOverdub = parseInt(ctlApi.get('arrangement_overdub'))
  ctlApi.set('arrangement_overdub', isOverdub ? 0 : 1)
}
function btnSessionRecord() {
  const ctlApi = getLiveSetApi()
  const isRecord = parseInt(ctlApi.get('session_record'))
  ctlApi.set('session_record', isRecord ? 0 : 1)
}

function trackDelta(delta: -1 | 1) {
  return deprecatedTrackDelta(delta)
}
function deviceDelta(delta: -1 | 1) {
  return deprecatedDeviceDelta(delta)
}
function trackPrev() {
  trackDelta(-1)
}
function trackNext() {
  trackDelta(1)
}
function devPrev() {
  deviceDelta(-1)
}
function devNext() {
  deviceDelta(1)
}

function ctlRec() {
  const ctlApi = getLiveSetApi()
  const currMode = parseInt(ctlApi.get('record_mode'))
  ctlApi.set('record_mode', currMode === 1 ? 0 : 1)
}
function ctlPlay() {
  getLiveSetApi().call('start_playing')
}
function ctlStop() {
  getLiveSetApi().call('stop_playing')
}
function undo() {
  getLiveSetApi().call('undo')
}
function redo() {
  getLiveSetApi().call('redo')
}

// --- Init ------------------------------------------------------------------

// Idempotent: 'init' fires on every app refresh, not just load. Creating an
// observer re-fires it with the current value, so first-time setup pushes all
// state; pushState() covers the re-refresh case where observers already exist.
function init() {
  Slots.initSlots()
  initTransportObservers()
  initNameColorObservers()

  if (!state.paramsWatcher) {
    state.paramsWatcher = new LiveAPI(
      debouncedParameterChange,
      'live_set view selected_track view selected_device'
    )
    state.paramsWatcher.mode = 1
    state.paramsWatcher.property = 'parameters'
  }

  if (!state.variationsWatcher) {
    state.variationsWatcher = new LiveAPI(
      onVariationChange,
      'live_set view selected_track view selected_device'
    )
    state.variationsWatcher.mode = 1
    state.variationsWatcher.property = 'variation_count'
  }

  if (!state.cuePointsWatcher) {
    state.cuePointsWatcher = new LiveAPI(cuePointsChange, 'live_set')
    state.cuePointsWatcher.property = 'cue_points'
  }

  pushState()
}

// --- Route table (the module's slice of the OSC namespace) -----------------
// Dispatched by the [v8 knobbler] entry via direct function calls. Mirrors the
// old router's OUTLET_BLUHAND entries (parse kind = old handler: bare=bareMsg,
// val=stdVal, slot=stdSlot, slotVal=stdSlotVal).
const routes: Route[] = [
  { prefix: '/bval', parse: 'slotVal', fn: val, coalesce: true },
  { prefix: '/bkMap', parse: 'slotVal', fn: bkMap },
  { prefix: '/bBank', parse: 'slot', fn: gotoBank },
  { prefix: '/bbankPrev', parse: 'bare', fn: bankPrev },
  { prefix: '/bbankNext', parse: 'bare', fn: bankNext },
  { prefix: '/bdefaultbval', parse: 'slot', fn: bSetDefault },
  { prefix: '/bdefault bval', parse: 'slot', fn: bSetDefault },
  { prefix: '/toggleOnOff', parse: 'bare', fn: toggleOnOff },
  { prefix: '/hideChains', parse: 'val', fn: hideChains },
  { prefix: '/toggleGroup', parse: 'val', fn: toggleGroup },
  { prefix: '/gotoTrack', parse: 'val', fn: gotoTrack },
  { prefix: '/gotoChain', parse: 'val', fn: gotoChain },
  { prefix: '/gotoDevice', parse: 'val', fn: gotoDevice },
  { prefix: '/bPrevTrack', parse: 'bare', fn: trackPrev },
  { prefix: '/bNextTrack', parse: 'bare', fn: trackNext },
  { prefix: '/bPrevDev', parse: 'bare', fn: devPrev },
  { prefix: '/bNextDev', parse: 'bare', fn: devNext },
  { prefix: '/blu/macros/random', parse: 'bare', fn: randomMacros },
  { prefix: '/blu/variation/new', parse: 'bare', fn: variationNew },
  { prefix: '/blu/variation/delete', parse: 'val', fn: variationDelete },
  { prefix: '/blu/variation/select', parse: 'val', fn: variationRecall },
  { prefix: '/gotoCuePoint', parse: 'val', fn: gotoCuePoint },
  { prefix: '/playCuePoint', parse: 'val', fn: playCuePoint },
  { prefix: '/btnSkipPrev', parse: 'bare', fn: btnSkipPrev },
  { prefix: '/btnSkipNext', parse: 'bare', fn: btnSkipNext },
  { prefix: '/btnReEnableAutomation', parse: 'bare', fn: btnReEnableAutomation },
  { prefix: '/btnLoop', parse: 'bare', fn: btnLoop },
  { prefix: '/btnCaptureMidi', parse: 'bare', fn: btnCaptureMidi },
  { prefix: '/btnArrangementOverdub', parse: 'bare', fn: btnArrangementOverdub },
  { prefix: '/btnSessionRecord', parse: 'bare', fn: btnSessionRecord },
  { prefix: '/bCtlRec', parse: 'bare', fn: ctlRec },
  { prefix: '/bCtlPlay', parse: 'bare', fn: ctlPlay },
  { prefix: '/bCtlStop', parse: 'bare', fn: ctlStop },
  { prefix: '/metronome', parse: 'bare', fn: toggleMetronome },
  { prefix: '/tapTempo', parse: 'bare', fn: tapTempo },
  { prefix: '/tempo', parse: 'val', fn: setTempo, coalesce: true },
  { prefix: '/undo', parse: 'bare', fn: undo },
  { prefix: '/redo', parse: 'bare', fn: redo },
]

log('reloaded k4-bluhand')

export { routes, init }
