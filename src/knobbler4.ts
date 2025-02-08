import { logFactory } from './utils'
import config from './config'
import { INLET_MSGS, OUTLET_OSC, OUTLET_MSGS } from './consts'
import * as KnobblerCore from './knobblerCore'

autowatch = 1
inlets = 1
outlets = 2

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setinletassist(OUTLET_OSC, 'Output OSC messages')
setinletassist(
  OUTLET_MSGS,
  'Output messages for other devices or bpatchers. Example: 5-SLOT mapped 1'
)

function initAll() {
  KnobblerCore.initAll()
}
function bkMap(slot: number, id: number) {
  KnobblerCore.bkMap(slot, id)
}
function clearCustomName(slot: number) {
  KnobblerCore.clearCustomName(slot)
}
function setCustomName(slot: number, args: string) {
  KnobblerCore.setCustomName(slot, args)
}
function clearPath(slot: number) {
  KnobblerCore.clearPath(slot)
}
function setMin(slot: number, val: number) {
  KnobblerCore.setMin(slot, val)
}
function setMax(slot: number, val: number) {
  KnobblerCore.setMax(slot, val)
}
function setPath(slot: number, paramPath: string) {
  KnobblerCore.setPath(slot, paramPath)
}
function refresh() {
  KnobblerCore.refresh()
}
function val(slot: number, val: number) {
  KnobblerCore.val(slot, val)
}
function unmap(slot: number) {
  KnobblerCore.unmap(slot)
}
function setDefault(slot: number) {
  KnobblerCore.setDefault(slot)
}
function gotoTrackFor(slot: number) {
  KnobblerCore.gotoTrackFor(slot)
}

log('reloaded knobbler4')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
