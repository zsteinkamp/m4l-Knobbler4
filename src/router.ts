import config from './config'
import { logFactory } from './utils'

autowatch = 1
inlets = 1
outlets = 9

const log = logFactory(config)

const INLET_OSC = 0
const OUTLET_KNOBBLER = 0
const OUTLET_CURRPARAM = 1
const OUTLET_TOGGLEINPUT = 2
const OUTLET_BLUHAND = 3
const OUTLET_PRESETS = 4
const OUTLET_LOOP = 5
const OUTLET_REFRESH = 6
const OUTLET_ACK = 7
const OUTLET_UNKNOWN = 8

setinletassist(INLET_OSC, 'OSC messages from a [udpreceive]')
setoutletassist(OUTLET_KNOBBLER, 'Messages for Knobbler4')
setoutletassist(OUTLET_CURRPARAM, 'Messages for CurrentParamKnob')
setoutletassist(OUTLET_TOGGLEINPUT, 'Messages for ToggleInputEnable')
setoutletassist(OUTLET_BLUHAND, 'Messages for Bluhand')
setoutletassist(OUTLET_PRESETS, 'Messages for Bluhand Presets')
setoutletassist(OUTLET_LOOP, 'Messages for Loop Checker')
setoutletassist(OUTLET_REFRESH, 'Messages for Refresh')
setoutletassist(OUTLET_ACK, 'Messages for /ack response for /syn')
setoutletassist(OUTLET_UNKNOWN, 'Unknown messages, intact')

type RouterItem = {
  outlet: number
  prefix: string
  handler: HandlerType
  msg: string
}

function getSlotNum(router: RouterItem, msg: string): number {
  const matches = msg.substring(router.prefix.length).match(/^\d+/)
  if (matches) {
    return parseInt(matches[0])
  }
  return null
}

// HANDLERS
function bareMsg(router: RouterItem) {
  outlet(router.outlet, router.msg)
}
function bareVal(router: RouterItem, _: string, val: string | number) {
  outlet(router.outlet, val)
}
// emits a message name followed by a value
function stdVal(router: RouterItem, _: string, val: string | number) {
  outlet(router.outlet, router.msg, val)
}
// emits a message followed by a slot number
function stdSlot(router: RouterItem, msg: string) {
  const slot = getSlotNum(router, msg)
  //log(`STDSLOT: outlet=${router.outlet} msg=${[router.msg, slot]}`)
  outlet(router.outlet, router.msg, slot)
}
// emits a message followed by a slot number followed by a value
function stdSlotVal(router: RouterItem, msg: string, val: number | string) {
  const slot = getSlotNum(router, msg)
  //log(`STDSLOTVAL: outlet=${router.outlet} msg=${[router.msg, slot, val]}`)
  outlet(router.outlet, router.msg, slot, val)
}

const ROUTER: RouterItem[] = [
  {
    outlet: OUTLET_ACK,
    prefix: '/syn',
    handler: bareMsg,
    msg: 'ack',
  },
  {
    outlet: OUTLET_LOOP,
    prefix: '/loop',
    handler: bareMsg,
    msg: 'loop',
  },
  {
    outlet: OUTLET_KNOBBLER, // foo bar
    prefix: '/val',
    handler: stdSlotVal,
    msg: 'val',
  },
  {
    outlet: OUTLET_KNOBBLER, // foo bar
    prefix: '/unmap',
    handler: stdSlot,
    msg: 'unmap',
  },
  {
    outlet: OUTLET_KNOBBLER,
    prefix: '/defaultval',
    handler: stdSlot,
    msg: 'setDefault',
  },
  {
    outlet: OUTLET_KNOBBLER,
    prefix: '/default val',
    handler: stdSlot,
    msg: 'setDefault',
  },
  {
    outlet: OUTLET_KNOBBLER,
    prefix: '/track',
    handler: stdSlot,
    msg: 'gotoTrackFor',
  },
  {
    outlet: OUTLET_CURRPARAM,
    prefix: '/currentParam',
    handler: bareVal,
    msg: 'val',
  },
  {
    outlet: OUTLET_TOGGLEINPUT,
    prefix: '/toggleInput',
    handler: stdVal,
    msg: 'toggle',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bval',
    handler: stdSlotVal,
    msg: 'val',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/btnSkipPrev',
    handler: bareMsg,
    msg: 'btnSkipPrev',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/btnSkipNext',
    handler: bareMsg,
    msg: 'btnSkipNext',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/btnArrangementOverdub',
    handler: bareMsg,
    msg: 'btnArrangementOverdub',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/btnLoop',
    handler: bareMsg,
    msg: 'btnLoop',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/btnReEnableAutomation',
    handler: bareMsg,
    msg: 'btnReEnableAutomation',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/btnCaptureMidi',
    handler: bareMsg,
    msg: 'btnCaptureMidi',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bbankPrev',
    handler: bareMsg,
    msg: 'bankPrev',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bbankNext',
    handler: bareMsg,
    msg: 'bankNext',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bCtlRec',
    handler: bareMsg,
    msg: 'ctlRec',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bCtlPlay',
    handler: bareMsg,
    msg: 'ctlPlay',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bCtlStop',
    handler: bareMsg,
    msg: 'ctlStop',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bPrevTrack',
    handler: bareMsg,
    msg: 'trackPrev',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/gotoTrack',
    handler: stdVal,
    msg: 'gotoTrack',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/gotoDevice',
    handler: stdVal,
    msg: 'gotoDevice',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bNextTrack',
    handler: bareMsg,
    msg: 'trackNext',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bPrevDev',
    handler: bareMsg,
    msg: 'devPrev',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bNextDev',
    handler: bareMsg,
    msg: 'devNext',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bBank',
    handler: stdSlot,
    msg: 'gotoBank',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bdefaultbval',
    handler: stdSlot,
    msg: 'default',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bdefault bval',
    handler: stdSlot,
    msg: 'default',
  },
  {
    outlet: OUTLET_REFRESH,
    prefix: '/btnRefresh',
    handler: bareMsg,
    msg: 'refresh',
  },
  {
    outlet: OUTLET_PRESETS,
    prefix: '/mapshortcut',
    handler: stdSlot,
    msg: 'shortcut',
  },
  {
    outlet: OUTLET_PRESETS,
    prefix: '/unmapshortcut',
    handler: stdSlot,
    msg: 'unmap',
  },
]
ROUTER.sort((a, b) => {
  return a.prefix.length > b.prefix.length ? -1 : 1
})

type HandlerType = (router: RouterItem, ...args: any) => void

function anything(val: any) {
  //log(`message: ${messagename} val: ${val}`)
  for (const router of ROUTER) {
    if (messagename.indexOf(router.prefix) === 0) {
      // found the right router, now pass to the handler
      return router.handler(router, messagename, val)
    }
  }
  return outlet(OUTLET_UNKNOWN, [messagename, val])
}

log('reloaded router')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
