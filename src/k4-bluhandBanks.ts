import { logFactory } from './utils'
import config from './config'
import { noFn, INLET_MSGS, OUTLET_MSGS, OUTLET_OSC } from './consts'

import { DeviceParamMaps } from './k4-deviceParamMaps'

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

const updateParams = () => {}
let paramNameToIdx: Record<string, number> = null

const state = {
  devicePath: null as string,
  currBank: 1,
  numBanks: 1,
  bankParamArr: [] as BluhandBank[],
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
  const numBanks = Math.ceil(paramIds.length / 16)
  let currBank = 0
  const blankRow = () => {
    return {
      name: 'Page ' + ++currBank,
      paramIdxArr: [] as number[],
    }
  }
  let currRow: BluhandBank = null

  paramIds.forEach((paramId, idx) => {
    // set up a new row for the first one
    if (idx % 16 === 0) {
      if (currRow) {
        ret.push(currRow)
      }
      currRow = blankRow()
    }
    currRow.paramIdxArr.push(idx + 1)
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
  const deviceParamMap = DeviceParamMaps[deviceType]

  const paramArr = getBasicParamArr(paramIds)
  paramNameToIdx = {}
  // more "bespoke" setups get this
  const param = new LiveAPI(() => {}, '')
  paramIds.forEach((paramId: number, idx: number) => {
    param.id = paramId
    paramNameToIdx[param.get('name')] = idx
    //log(`NAME TO IDX [${param.get('name')}]=${idx}`)
  })

  if (!deviceParamMap) {
    // nothing to customize, return the basic array
    //log('BASIC RETURN ' + JSON.stringify(paramArr))
    return paramArr
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
        log(
          'ERROR (' +
            deviceType +
            ') NO pIDX FOR NAME ' +
            paramName +
            ' ' +
            JSON.stringify(Object.keys(paramNameToIdx))
        )
        return
      }
      row.paramIdxArr.push(pIdx + 1)
    })

    //log('ROW ' + JSON.stringify(row))
    paramArr.splice(idx, 0, row)
  })

  //log('PARAMARRFINAL ' + JSON.stringify(paramArr))
  return paramArr
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

function gotoDevice(deviceId: number) {
  const api = new LiveAPI(noFn, 'live_set view')
  //log('GOTO DEVICE ' + deviceId)
  api.call('select_device', ['id', deviceId])
}
function gotoTrack(trackId: number) {
  const api = new LiveAPI(noFn, 'live_set view')
  //log('GOTO TRACK ' + trackId)
  api.set('selected_track', ['id', trackId])
}

function id(deviceId: number) {
  const api = new LiveAPI(updateParams, 'id ' + deviceId.toString())
  const deviceType = api.get('class_display_name').toString()
  //log(JSON.stringify({ deviceType, name: api.get('name') }))
  const rawParams = api.get('parameters')
  let paramIds: number[] = []
  rawParams.forEach((paramId: string | number, idx: number) => {
    if (paramId === 'id') {
      return
    }
    paramIds.push(paramId as number)
  })
  paramIds.shift() // remove device on/off

  const canHaveChains = parseInt(api.get('can_have_chains'))
  //log('CAN_HAVE_CHAINS: ' + canHaveChains)
  if (canHaveChains) {
    // see if we should slice off some macros
    const numMacros = parseInt(api.get('visible_macro_count'))
    if (numMacros) {
      //log('GonNNA SlIcE ' + numMacros)
      paramIds = paramIds.slice(0, numMacros)
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

let liveSetApi: LiveAPI = null
function getApi() {
  if (!liveSetApi) {
    liveSetApi = new LiveAPI(noFn, 'live_set')
  }
  return liveSetApi
}

function toggleMetronome() {
  const api = getApi()
  const metroVal = parseInt(api.get('metronome'))
  api.set('metronome', metroVal ? 0 : 1)
}
function tapTempo() {
  const api = getApi()
  api.call('tap_tempo', null)
}
function setTempo(val: number) {
  const api = getApi()
  api.set('tempo', val)
}

function trackDelta(delta: -1 | 1) {
  //log('TRACK DELTA ' + delta)
  const setObj = getApi()
  const viewObj = new LiveAPI(() => {}, 'live_set view')

  const track = viewObj.get('selected_track')
  const trackObj = new LiveAPI(() => {}, track)

  const path = trackObj.unquotedpath.split(' ').slice(0, 3).join(' ')
  const isReturn = !!path.match(/ return_tracks /)
  const isMaster = !!path.match(/ master_track/)
  const tracks = setObj.get('tracks')
  const returnTracks = setObj.get('return_tracks')
  const numTracks = tracks.length / 2
  const numReturnTracks = returnTracks.length / 2

  //log('UQPATH=' + path)

  if (isMaster) {
    //log('ISMASTER')
    if (delta > 0) {
      //log('NONEXT')
      // no "next" from master, only "prev"
      return
    }
    if (numReturnTracks) {
      //log('RETURN  live_set return_tracks ' + (numReturnTracks - 1))
      trackObj.goto('live_set return_tracks ' + (numReturnTracks - 1))
    } else {
      //log('RETURN live_set tracks ' + (numTracks - 1))
      trackObj.goto('live_set tracks ' + (numTracks - 1))
    }
  } else {
    // not master (return or track)
    const trackIdx = parseInt(path.match(/\d+$/)[0] || '0')
    if (isReturn) {
      if (delta < 0) {
        // prev track
        if (trackIdx < 1) {
          // shift to last track
          trackObj.goto('live_set tracks ' + (numTracks - 1))
        } else {
          trackObj.goto('live_set return_tracks ' + (trackIdx + delta))
        }
      } else {
        // next track
        if (trackIdx >= numReturnTracks - 1) {
          // last return track, so go to master
          trackObj.goto('live_set master_track')
        } else {
          trackObj.goto('live_set return_tracks ' + (trackIdx + delta))
        }
      }
    } else {
      // regular track
      if (delta < 0) {
        // prev track
        if (trackIdx < 1) {
          // no "prev" from first track
          return
        }
        trackObj.goto('live_set tracks ' + (trackIdx + delta))
      } else {
        // next track
        if (trackIdx < numTracks - 1) {
          trackObj.goto('live_set tracks ' + (trackIdx + delta))
        } else {
          if (numReturnTracks) {
            trackObj.goto('live_set return_tracks 0')
          } else {
            trackObj.goto('live_set master_track')
          }
        }
      }
    }
  }

  if (trackObj.id == 0) {
    log('HMM ZERO ' + trackObj.unquotedpath)
    return
  }

  viewObj.set('selected_track', ['id', trackObj.id])
  //log('TRACK ' + trackObj.id)
}

function deviceDelta(delta: -1 | 1) {
  const devObj = new LiveAPI(() => {}, 'live_set appointed_device')
  if (devObj.id == 0) {
    return
  }
  const path = devObj.unquotedpath
  const devIdx = parseInt(path.match(/\d+$/)[0] || '0')
  try {
    const newPath = path.replace(/\d+$/, (devIdx + delta).toString())
    const newObj = new LiveAPI(() => {}, newPath)
    const viewApi = new LiveAPI(() => {}, 'live_set view')
    if (newObj.id > 0) {
      viewApi.call('select_device', ['id', newObj.id])
    } else {
      const parentPath = path.split(' ').slice(0, -2).join(' ')
      if (parentPath.indexOf(' devices ') > -1) {
        const parentObj = new LiveAPI(() => {}, parentPath)
        //log('PARENT_PATH ' + parentPath + ' ' + parentObj.type)
        if (parentObj.id > 0 && parentObj.type !== 'Chain') {
          viewApi.call('select_device', ['id', parentObj.id])
        } else {
          const gparentPath = path.split(' ').slice(0, -4).join(' ')
          if (gparentPath.indexOf(' devices ') > -1) {
            //log('GPARENT_PATH ' + parentPath)
            const gparentObj = new LiveAPI(() => {}, gparentPath)
            if (gparentObj.id > 0) {
              viewApi.call('select_device', ['id', gparentObj.id])
            }
          }
        }
      }
    }
  } catch (e) {}
  //log('APPORT ' + devObj.id)
}

function btnSkipPrev() {
  const ctlApi = getApi()
  ctlApi.call('jump_to_prev_cue', null)
}
function btnSkipNext() {
  const ctlApi = getApi()
  ctlApi.call('jump_to_next_cue', null)
}
function btnReEnableAutomation() {
  const ctlApi = getApi()
  ctlApi.call('re_enable_automation', null)
}
function btnLoop() {
  const ctlApi = getApi()
  const isLoop = parseInt(ctlApi.get('loop'))
  ctlApi.set('loop', isLoop ? 0 : 1)
}
function btnCaptureMidi() {
  const ctlApi = getApi()
  ctlApi.call('capture_midi', null)
}
function btnArrangementOverdub() {
  const ctlApi = getApi()
  const isOverdub = parseInt(ctlApi.get('arrangement_overdub'))
  ctlApi.set('arrangement_overdub', isOverdub ? 0 : 1)
}
function btnSessionRecord() {
  const ctlApi = getApi()
  const isRecord = parseInt(ctlApi.get('session_record'))
  ctlApi.set('session_record', isRecord ? 0 : 1)
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
  const ctlApi = getApi()
  const currMode = ctlApi.get('record_mode')
  ctlApi.set('record_mode', currMode == 1 ? 0 : 1)
}
function ctlPlay() {
  const ctlApi = getApi()
  ctlApi.call('start_playing', null)
}
function ctlStop() {
  const ctlApi = getApi()
  ctlApi.call('stop_playing', null)
}

log('reloaded k4-bluhandBanks')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
