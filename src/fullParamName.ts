import { truncate, logFactory } from './utils'
import config from './config'
import { nullString } from './consts'

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

  if (+obj.id === 0) {
    // no device selected, how about track?
    obj.path = 'live_set view selected_track'
    if (+obj.id === 0) {
      return nullString
    }
    outlet(OUTLET_PARAM_NAME, obj.get('name').toString())
  }

  while (counter < 20) {
    if (obj.type === 'MixerDevice') {
      nameArr.unshift('Mixer')
    } else {
      nameArr.unshift(truncate(obj.get('name').toString(), 40))
    }
    if (['Song', 'Track'].indexOf(obj.type) > -1) {
      break
    }
    obj.id = obj.get('canonical_parent')[1]
    counter++
  }

  let name = nameArr[0]
  //log(nameArr)
  if (nameArr.length > 1) {
    name += ' > ' + nameArr[nameArr.length - 1]
  }

  //log('PARAM NAME ' + name)

  outlet(OUTLET_PARAM_NAME, name)
}

log('reloaded fullParamName')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
