import { cleanArr, logFactory } from './utils'
import config from './config'
import { noFn, INLET_MSGS, OUTLET_MSGS, OUTLET_OSC } from './consts'
import { deviceParamMapFor } from './k4-deviceParamMaps'
import {
  deprecatedDeviceDelta,
  deprecatedTrackDelta,
} from './deprecatedMethods'

autowatch = 1
inlets = 1
outlets = 2

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setinletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')
setinletassist(
  OUTLET_MSGS,
  'Output messages to the [poly finger] instances to set their parameter index'
)

type RecordNameToIdx = Record<string, number>
let paramNameToIdx: RecordNameToIdx = null

const state = {
  devicePath: null as string,
  onOffWatcher: null as LiveAPI,
  currBank: 1,
  numBanks: 1,
  bankParamArr: [] as BluhandBank[],
  nameLookupCache: {} as Record<number, RecordNameToIdx>,
}

function getMaxBanksParamArr(bankCount: number, deviceObj: LiveAPI) {
  const rawBanks: BluhandBank[] = []

  //log('BANK_COUNT ' + bankCount)

  for (let i = 0; i < bankCount; i++) {
    const bankName = deviceObj.call('get_bank_name', i) as unknown as string
    const bankParams = deviceObj.call(
      'get_bank_parameters',
      i
    ) as unknown as number[]
    //log(
    //  ' BANK ROW ' + JSON.stringify({ name: bankName, paramIdxArr: bankParams })
    //)
    rawBanks.push({ name: bankName, paramIdxArr: bankParams })
  }

  const ret: BluhandBank[] = []
  for (let i = 0; rawBanks[i]; i++) {
    const oddBank = rawBanks[i]
    const evenBank = rawBanks[++i]

    if (oddBank && evenBank) {
      ret.push({
        name: oddBank.name + ' / ' + evenBank.name,
        paramIdxArr: [...oddBank.paramIdxArr, ...evenBank.paramIdxArr],
      })
    } else {
      ret.push(oddBank)
    }
  }

  return ret
}

function getBasicParamArr(paramIds: number[]) {
  //log('GET BASIC ' + paramIds.join(','))
  const ret: BluhandBank[] = []
  let currBank = 0
  const blankRow = () => {
    return {
      name: 'Page ' + ++currBank,
      paramIdxArr: [] as number[],
    }
  }
  let currRow: BluhandBank = null

  let idx = 0
  paramIds.forEach((paramId) => {
    // set up a new row for the first one
    if (idx % 16 === 0) {
      if (currRow) {
        ret.push(currRow)
      }
      currRow = blankRow()
    }
    if (paramId === 0) {
      // special case filler
      currRow.paramIdxArr.push(-1)
    } else {
      currRow.paramIdxArr.push(idx + 1)
      idx++ // only increment here
    }
  })
  if (currRow) {
    ret.push(currRow)
  }

  //log('RET ' + JSON.stringify(ret))
  return ret
}

function getBankParamArr(
  paramIds: number[],
  deviceType: string,
  deviceObj: LiveAPI
) {
  if (deviceType.substring(0, 4) === 'Max ') {
    // Max device, look for live.banks
    const bankCount =
      (deviceObj.call('get_bank_count', null) as unknown as number) || 0

    if (bankCount > 0) {
      return getMaxBanksParamArr(bankCount, deviceObj)
    }
  }

  // deviceParamMap is custom or crafted parameter organization
  //log('BBANKS ' + deviceType)
  const deviceParamMap = deviceParamMapFor(deviceType)

  if (!deviceParamMap) {
    const paramArr = getBasicParamArr(paramIds)
    // nothing to customize, return the basic array
    //log('BASIC RETURN ' + JSON.stringify(paramArr))
    return paramArr
  }

  const ret: BluhandBank[] = []
  // cache id to name mapping because it is super slow with giant devices like
  // Operator and honestly it should just be a compile-time step of the data
  // files that need this information. frankly this is stupid and should be
  // burned.
  const lookupCacheKey = deviceObj.id
  paramNameToIdx = state.nameLookupCache[lookupCacheKey]
  if (!paramNameToIdx) {
    //log('CACHE MISS ' + lookupCacheKey)
    paramNameToIdx = {} as RecordNameToIdx
    // more "bespoke" setups get this
    const param = getUtilApi()
    paramIds.forEach((paramId: number, idx: number) => {
      if (paramId <= 0) {
        return
      }
      param.id = paramId
      paramNameToIdx[param.get('name').toString()] = idx
      //log(`NAME TO IDX [${param.get('name')}]=${idx}`)
    })
    state.nameLookupCache[lookupCacheKey] = paramNameToIdx
  }

  deviceParamMap.forEach((nameBank, idx) => {
    const row: BluhandBank = {
      name: nameBank.name,
      paramIdxArr: [],
    }
    nameBank.paramNames.forEach((paramName) => {
      let found = false
      let pIdx = null
      if (typeof paramName === 'number') {
        // can specify a param index instead of a name in the data structure
        row.paramIdxArr.push(paramName)
        return
      }
      for (const singleName of paramName.toString().split('|')) {
        // can have multiple options pipe-separated (e.g. for meld)
        pIdx = paramNameToIdx[singleName]
        //log('IS IT ' + pIdx)
        if (pIdx !== undefined) {
          found = true
          break
        }
      }
      if (!found) {
        // the world of parameters is a complicated one
        //log(
        //  'ERROR (' +
        //    deviceType +
        //    ') NO pIDX FOR NAME ' +
        //    paramName +
        //    ' ' +
        //    JSON.stringify(Object.keys(paramNameToIdx))
        //)
        return
      }
      row.paramIdxArr.push(pIdx + 1)
    })

    //log('ROW ' + JSON.stringify(row))
    ret.push(row)
  })

  //log('PARAMARRFINAL ' + JSON.stringify(paramArr))
  return ret
}

function sendBankNames() {
  const currBankIdx = state.currBank - 1

  const banks = state.bankParamArr.map((bank, idx) => {
    return { name: bank.name, sel: idx === currBankIdx }
  })
  //log('BANKS: ' + JSON.stringify(banks))
  outlet(OUTLET_OSC, ['/bBanks', JSON.stringify(banks)])
}

function sendCurrBank() {
  //log('SEND CURR BANK ' + JSON.stringify(state))
  const currBankIdx = state.currBank - 1
  if (!state.bankParamArr || !state.bankParamArr[currBankIdx]) {
    //log('EARLY')
    sendBankNames()
    return
  }
  const bluBank = state.bankParamArr[currBankIdx]
  //log('MADE IT ' + JSON.stringify(bluBank))
  outlet(OUTLET_OSC, ['/bTxtCurrBank', bluBank.name])
  while (bluBank.paramIdxArr.length < 16) {
    bluBank.paramIdxArr.push(-1)
  }
  bluBank.paramIdxArr.forEach((paramIdx, idx) => {
    outlet(OUTLET_MSGS, ['target', idx + 1])
    outlet(OUTLET_MSGS, ['paramIdx', paramIdx])
    //log(JSON.stringify({ str: 'MSG', target: idx + 1, paramIdx }))
  })
  sendBankNames()
}

function unfoldParentTracks(objId: number) {
  const util = getUtilApi()
  util.id = objId
  //log('GOTO TRACK ' + trackId + ' ' + util.id)

  if (util.id === 0) {
    // invalid objId (e.g. deleted object)
    return
  }

  // first we need to surf up the hierarchy to make sure we are not in a
  // collapsed group
  let counter = 0
  while (counter < 20) {
    const isFoldable =
      util.type === 'Track' && parseInt(util.get('is_foldable'))
    //log(util.id + ' isFoldable=' + util.get('is_foldable'))
    if (isFoldable) {
      const foldState = parseInt(util.get('fold_state'))
      if (foldState === 1) {
        // need to unfold
        util.set('fold_state', 0)
      }
    }
    util.id = util.get('canonical_parent')[1]
    //log('TYPE=' + util.type)
    if (util.type === 'Song') {
      break
    }
    counter++
  }
}

function gotoDevice(deviceIdStr: string) {
  const deviceId = parseInt(deviceIdStr)
  unfoldParentTracks(deviceId)
  const api = getLiveSetViewApi()
  //log('GOTO DEVICE ' + deviceId)
  api.call('select_device', ['id', deviceId])
}

function gotoChain(chainIdStr: string) {
  const chainId = parseInt(chainIdStr)
  //log('GOTO CHAIN ' + chainId + ' ' + typeof chainId)
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

function gotoTrack(trackIdStr: string) {
  const trackId = parseInt(trackIdStr)
  unfoldParentTracks(trackId)
  const api = getLiveSetViewApi()
  api.set('selected_track', ['id', trackId])
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
    outlet(OUTLET_OSC, ['/bOnOff', parseInt(args[1])])
  }
}

function id(deviceId: number) {
  const api = new LiveAPI(noFn, 'id ' + deviceId)
  api.id = deviceId
  const deviceType = api.get('class_name').toString()
  //log(
  //  JSON.stringify({
  //    deviceType,
  //    name: api.get('name').toString(),
  //    type: api.type,
  //  })
  //)

  let paramIds = cleanArr(api.get('parameters'))
  const onOffParamId = paramIds.shift() // remove device on/off
  if (!state.onOffWatcher) {
    state.onOffWatcher = new LiveAPI(updateDeviceOnOff, 'id ' + onOffParamId)
    state.onOffWatcher.property = 'value'
  } else {
    state.onOffWatcher.id = onOffParamId
  }

  const canHaveChains = parseInt(api.get('can_have_chains'))
  //log('CAN_HAVE_CHAINS: ' + canHaveChains)
  if (canHaveChains) {
    // see if we should slice off some macros
    const numMacros = parseInt(api.get('visible_macro_count'))
    if (numMacros) {
      //log('GonNNA SlIcE ' + numMacros)
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
  //log('PARAMIDS ' + JSON.stringify(paramIds))

  state.devicePath = api.unquotedpath
  state.currBank = 1
  state.bankParamArr = getBankParamArr(paramIds, deviceType, api)
  state.numBanks = state.bankParamArr.length
  //log('STATE CHECK ' + JSON.stringify(state))
  sendCurrBank()
}

function gotoBank(idx: number) {
  //log('HERE ' + idx)
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

let utilApi: LiveAPI = null
function getUtilApi() {
  if (!utilApi) {
    utilApi = new LiveAPI(noFn, 'live_set')
  }
  return utilApi
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

function toggleMetronome() {
  const api = getLiveSetApi()
  const metroVal = parseInt(api.get('metronome'))
  api.set('metronome', metroVal ? 0 : 1)
}
function tapTempo() {
  const api = getLiveSetApi()
  api.call('tap_tempo', null)
}
function setTempo(val: number) {
  const api = getLiveSetApi()
  api.set('tempo', val)
}

function btnSkipPrev() {
  const ctlApi = getLiveSetApi()
  ctlApi.call('jump_to_prev_cue', null)
}
function btnSkipNext() {
  const ctlApi = getLiveSetApi()
  ctlApi.call('jump_to_next_cue', null)
}
function btnReEnableAutomation() {
  const ctlApi = getLiveSetApi()
  ctlApi.call('re_enable_automation', null)
}
function btnLoop() {
  const ctlApi = getLiveSetApi()
  const isLoop = parseInt(ctlApi.get('loop'))
  ctlApi.set('loop', isLoop ? 0 : 1)
}
function btnCaptureMidi() {
  const ctlApi = getLiveSetApi()
  ctlApi.call('capture_midi', null)
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
  const ctlApi = getLiveSetApi()
  ctlApi.call('start_playing', null)
}
function ctlStop() {
  const ctlApi = getLiveSetApi()
  ctlApi.call('stop_playing', null)
}

log('reloaded k4-bluhandBanks')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
