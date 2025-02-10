import config from './config'
import { logFactory } from './utils'

autowatch = 1
inlets = 1
outlets = 8

const log = logFactory(config)

const INLET_OSC = 0
const OUTLET_KNOBBLER = 0
const OUTLET_BLUHAND = 1
const OUTLET_PRESETS = 2
const OUTLET_LOOP = 3
const OUTLET_REFRESH = 4
const OUTLET_ACK = 5
const OUTLET_MIXER = 6
const OUTLET_UNKNOWN = 7

setinletassist(INLET_OSC, 'OSC messages from a [udpreceive]')
setoutletassist(OUTLET_KNOBBLER, 'Messages for Knobbler4')
setoutletassist(OUTLET_BLUHAND, 'Messages for Bluhand')
setoutletassist(OUTLET_PRESETS, 'Messages for Bluhand Presets')
setoutletassist(OUTLET_LOOP, 'Messages for Loop Checker')
setoutletassist(OUTLET_REFRESH, 'Messages for Refresh')
setoutletassist(OUTLET_ACK, 'Messages for /ack response for /syn')
setoutletassist(OUTLET_MIXER, 'Messages for Mixer')
setoutletassist(OUTLET_UNKNOWN, 'Unknown messages, intact')

type RouterItem = {
  outlet: number
  prefix: string
  handler: HandlerType
  msg: string | [string, ...any]
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
    outlet: OUTLET_BLUHAND,
    prefix: '/bval',
    handler: stdSlotVal,
    msg: 'val',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/bkMap',
    handler: stdSlotVal,
    msg: 'bkMap',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/btnSkipPrev',
    handler: bareMsg,
    msg: 'btnSkipPrev',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/toggleOnOff',
    handler: bareMsg,
    msg: 'toggleOnOff',
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
    prefix: '/btnSessionRecord',
    handler: bareMsg,
    msg: 'btnSessionRecord',
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
    prefix: '/gotoChain',
    handler: stdVal,
    msg: 'gotoChain',
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
    prefix: '/metronome',
    handler: bareMsg,
    msg: 'toggleMetronome',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/tapTempo',
    handler: bareMsg,
    msg: 'tapTempo',
  },
  {
    outlet: OUTLET_BLUHAND,
    prefix: '/tempo',
    handler: stdVal,
    msg: 'setTempo',
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
    prefix: '/initMenu',
    handler: bareMsg,
    msg: 'initMenuOnly',
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
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/volDefault',
    handler: bareMsg,
    msg: 'handleVolDefault',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/panDefault',
    handler: bareMsg,
    msg: 'handlePanDefault',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/crossfaderDefault',
    handler: bareMsg,
    msg: 'handleCrossfaderDefault',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/sendDefault',
    handler: stdSlot,
    msg: 'handleSendDefault',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/send',
    handler: stdSlotVal,
    msg: 'updateSendVal',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/toggleXFadeA',
    handler: bareMsg,
    msg: 'toggleXFadeA',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/toggleXFadeB',
    handler: bareMsg,
    msg: 'toggleXFadeB',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/enableRecord',
    handler: bareMsg,
    msg: 'enableRecord',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/disableRecord',
    handler: bareMsg,
    msg: 'disableRecord',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/toggleSolo',
    handler: bareMsg,
    msg: 'toggleSolo',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/toggleMute',
    handler: bareMsg,
    msg: 'toggleMute',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/pan',
    handler: stdVal,
    msg: 'handlePan',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/vol',
    handler: stdVal,
    msg: 'handleVol',
  },
  {
    outlet: OUTLET_MIXER,
    prefix: '/mixer/crossfader',
    handler: stdVal,
    msg: 'handleCrossfader',
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
