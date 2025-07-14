import { logFactory } from './utils'
import config from './config'
import { INLET_MSGS } from './consts'
const OUTLET_MSGS = 0

autowatch = 1
inlets = 1
outlets = 1

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setoutletassist(OUTLET_MSGS, 'Output messages to umenu')

log('reloaded k4-discovery')

function filter() {
  const ret = []
  for (const elem of arguments as unknown as string[]) {
    if (!elem.match(/Knobbler4 Device/i)) {
      ret.push(elem)
    }
  }
  if (ret.length === 0) {
    ret.unshift('* No Knobbler Apps found')
  } else {
    ret.unshift('* Select a Knobbler App')
  }
  outlet(OUTLET_MSGS, ret)
}

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
