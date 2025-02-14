import { logFactory } from './utils'
import config from './config'
const log = logFactory(config)

import { BANK_NAME_DICT, DEVICE_DICT } from './deviceParams'

export function deviceParamMapFor(deviceName: string): NameBank[] {
  if (!BANK_NAME_DICT[deviceName]) {
    return null
  }
  if (BANK_NAME_DICT[deviceName].length !== DEVICE_DICT[deviceName].length) {
    log('oopsie len mismatch ' + deviceName)
    return null
  }
  const ret = [] as NameBank[]
  //log('GOT HERE' + deviceName)
  for (let i = 0; i < BANK_NAME_DICT[deviceName].length; i++) {
    if (i % 2 === 0) {
      ret.push({
        name: BANK_NAME_DICT[deviceName][i],
        paramNames: DEVICE_DICT[deviceName][i],
      })
    } else {
      // odd numbered banks are appended to the prior one because knobbler has
      // 16 sliders and banks are in groups of 8
      const prev = ret[ret.length - 1]
      prev.name += ' / ' + BANK_NAME_DICT[deviceName][i]
      for (let j = 0; j < DEVICE_DICT[deviceName][i].length; j++) {
        prev.paramNames[8 + j] = DEVICE_DICT[deviceName][i][j]
      }
    }
  }
  return ret
}
