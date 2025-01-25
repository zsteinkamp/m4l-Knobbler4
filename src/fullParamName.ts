import { truncate, logFactory } from './utils'
import config from './config'

inlets = 1
outlets = 1

const log = logFactory(config)

const OUTLET_PARAM_NAME = 0
const INLET_INPUT = 0

setinletassist(INLET_INPUT, 'Input (object ID)')
setoutletassist(OUTLET_PARAM_NAME, 'Param Name (string)')

function updateParamName(objId: string) {
  //log(objId)
  const nameArr = []
  let counter = 0
  const obj = new LiveAPI(() => {}, 'id ' + objId)

  if (obj.id == 0) {
    return
  }

  while (counter < 10) {
    if (obj.type === 'Song') {
      break
    }
    if (obj.type === 'MixerDevice') {
      nameArr.unshift('Mixer')
    } else {
      nameArr.unshift(truncate(obj.get('name').toString(), 40))
    }
    obj.id = obj.get('canonical_parent')
    counter++
  }

  let name = nameArr[0]
  if (nameArr.length == 2) {
    name = [nameArr[0], nameArr[1]].join(' > ')
  } else if (nameArr.length > 2) {
    name = [nameArr[0], nameArr[1], nameArr[nameArr.length - 1]].join(' > ')
  }

  outlet(OUTLET_PARAM_NAME, name)
}

log('reloaded fullParamName')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
