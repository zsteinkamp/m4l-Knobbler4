// Pure bank-layout computation for bluhand. Given a device's parameter ids,
// its class name, and a LiveAPI handle to the device, produces the rows of
// parameter indices that each bluhand "bank" page displays. Imported by
// k4-bluhand (the [v8] entry); owns no Max I/O or observers.

import { noFn } from './consts'
import { deviceParamMapFor } from './k4-deviceParamMaps'
import { MAX_DEVICES } from './deviceParams'

type RecordNameToIdx = Record<string, number>

const nameLookupCache: Record<number, RecordNameToIdx> = {}

let lookupApi: LiveAPI = null
function getLookupApi(): LiveAPI {
  if (!lookupApi) {
    lookupApi = new LiveAPI(noFn, 'live_set')
  }
  return lookupApi
}

function getMaxBanksParamArr(bankCount: number, deviceObj: LiveAPI) {
  const rawBanks: BluhandBank[] = []

  for (let i = 0; i < bankCount; i++) {
    const bankName = deviceObj.call('get_bank_name', i) as unknown as string
    const bankParams = deviceObj.call(
      'get_bank_parameters',
      i
    ) as unknown as number[]
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
  } else {
    ret.push(blankRow())
  }

  return ret
}

export function getBankParamArr(
  paramIds: number[],
  deviceType: string,
  deviceObj: LiveAPI
) {
  if (MAX_DEVICES.indexOf(deviceType) > -1) {
    // Max device, look for live.banks
    const bankCount =
      (deviceObj.call('get_bank_count') as unknown as number) || 0

    if (bankCount > 0) {
      return getMaxBanksParamArr(bankCount, deviceObj)
    }
  }

  // deviceParamMap is custom or crafted parameter organization
  const deviceParamMap = deviceParamMapFor(deviceType)

  if (!deviceParamMap) {
    // nothing to customize, return the basic array
    return getBasicParamArr(paramIds)
  }

  // cache id to name mapping because it is super slow with giant devices like
  // Operator and honestly it should just be a compile-time step of the data
  // files that need this information.
  const lookupCacheKey = deviceObj.id
  let paramNameToIdx = nameLookupCache[lookupCacheKey]
  if (!paramNameToIdx) {
    paramNameToIdx = {} as RecordNameToIdx
    const param = getLookupApi()
    paramIds.forEach((paramId: number, idx: number) => {
      if (paramId <= 0) {
        return
      }
      param.id = paramId
      paramNameToIdx[param.get('name').toString()] = idx
    })
    nameLookupCache[lookupCacheKey] = paramNameToIdx
  }

  const ret: BluhandBank[] = []
  deviceParamMap.forEach((nameBank) => {
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
        if (pIdx !== undefined) {
          found = true
          break
        }
      }
      if (!found) {
        // the world of parameters is a complicated one
        return
      }
      row.paramIdxArr.push(pIdx + 1)
    })

    ret.push(row)
  })

  return ret
}
