import { logFactory } from './utils'
import config from './config'
import { INLET_MSGS, OUTLET_MSGS, OUTLET_OSC } from './consts'

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
  currBank: 1,
  numBanks: 1,
  bankParamArr: null as BluhandBank[],
}

function getBasicParamArr(paramIds: number[]) {
  const ret: BluhandBank[] = []
  const numBanks = Math.ceil(paramIds.length / 16)
  let currBank = 0
  const blankRow = () => {
    return {
      name: 'Page ' + ++currBank + ' of ' + numBanks,
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
  ret.push(currRow)

  //log('RET ' + JSON.stringify(ret))
  return ret
}

function getBankParamArr(paramIds: number[], deviceType: string) {
  const deviceParamMap = DeviceParamMaps[deviceType]

  const paramArr = getBasicParamArr(paramIds)
  paramNameToIdx = {}
  // more "bespoke" setups get this
  paramIds.forEach((paramId: number, idx: number) => {
    const param = new LiveAPI(() => {}, 'id ' + paramId)
    paramNameToIdx[param.get('name')] = idx
    log(`NAME TO IDX [${param.get('name')}]=${idx}`)
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
      const idx = paramNameToIdx[paramName]
      if (idx === undefined) {
        log(
          'ERROR (' +
            deviceType +
            ') NO IDX FOR NAME ' +
            paramName +
            ' ' +
            JSON.stringify(Object.keys(paramNameToIdx))
        )
        return
      }
      row.paramIdxArr.push(idx + 1)
    })

    //log('ROW ' + JSON.stringify(row))
    paramArr.splice(idx, 0, row)
  })

  //log('PARAMARRFINAL ' + JSON.stringify(paramArr))
  return paramArr
}

function sendCurrBank() {
  //log('SEND CURR BANK ' + JSON.stringify(state))
  const currBankIdx = state.currBank - 1
  if (!state.bankParamArr || !state.bankParamArr[currBankIdx]) {
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
    ////log(JSON.stringify({ str: 'MSG', target: idx + 1, paramIdx }))
  })
}

function id(deviceId: number) {
  const api = new LiveAPI(updateParams, 'id ' + deviceId.toString())
  const deviceType = api.get('class_display_name')
  log(JSON.stringify({ deviceType, name: api.get('name') }))
  const rawParams = api.get('parameters')
  const paramIds: number[] = []
  rawParams.forEach((paramId: string | number, idx: number) => {
    if (paramId === 'id') {
      return
    }
    paramIds.push(paramId as number)
  })
  paramIds.shift() // remove device on/off
  //log('PARAMIDS ' + JSON.stringify(paramIds))

  state.currBank = 1
  state.bankParamArr = getBankParamArr(paramIds, deviceType)
  state.numBanks = state.bankParamArr.length
  //log('STATE CHECK ' + JSON.stringify(state))
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

log('reloaded k4-bluhandBanks')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}

// if we know about this device type, then we want to set up mapping by name
//   foreach parameter
//      build map of parameter name => parameter index (indexOf?)
//
