'use strict'
var config_1 = require('./config')
var utils_1 = require('./utils')
autowatch = 1
inlets = 1
outlets = 9
var log = (0, utils_1.logFactory)(config_1.default)
var INLET_OSC = 0
var OUTLET_KNOBBLER = 0
var OUTLET_CURRPARAM = 1
var OUTLET_TOGGLEINPUT = 2
var OUTLET_BLUHAND = 3
var OUTLET_PRESETS = 4
var OUTLET_LOOP = 5
var OUTLET_REFRESH = 6
var OUTLET_ACK = 7
var OUTLET_UNKNOWN = 8
setinletassist(INLET_OSC, 'OSC messages from a [udpreceive]')
setoutletassist(OUTLET_KNOBBLER, 'Messages for Knobbler4')
setoutletassist(OUTLET_CURRPARAM, 'Messages for CurrentParamKnob')
setoutletassist(OUTLET_TOGGLEINPUT, 'Messages for ToggleInputEnable')
setoutletassist(OUTLET_BLUHAND, 'Messages for Bluhand')
setoutletassist(OUTLET_PRESETS, 'Messages for Bluhand Presets')
setoutletassist(OUTLET_LOOP, 'Messages for Loop Checker')
setoutletassist(OUTLET_REFRESH, 'Messages for Refresh')
setoutletassist(OUTLET_ACK, 'Messages for ACK')
setoutletassist(OUTLET_UNKNOWN, 'Unknown messages, intact')
function getSlotNum(router, msg) {
  var matches = msg.substring(router.prefix.length).match(/^\d+/)
  if (matches) {
    return parseInt(matches[0])
  }
  return null
}
// HANDLERS
function bareMsg(router) {
  outlet(router.outlet, router.msg)
}
function bareVal(router, _, val) {
  outlet(router.outlet, val)
}
// emits a message name followed by a value
function stdVal(router, _, val) {
  outlet(router.outlet, router.msg, val)
}
// emits a message followed by a slot number
function stdSlot(router, msg) {
  var slot = getSlotNum(router, msg)
  //log(`STDSLOT: outlet=${router.outlet} msg=${[router.msg, slot]}`)
  outlet(router.outlet, router.msg, slot)
}
// emits a message followed by a slot number followed by a value
function stdSlotVal(router, msg, val) {
  var slot = getSlotNum(router, msg)
  //log(`STDSLOTVAL: outlet=${router.outlet} msg=${[router.msg, slot, val]}`)
  outlet(router.outlet, router.msg, slot, val)
}
var ROUTER = [
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
    outlet: OUTLET_KNOBBLER,
    prefix: '/val',
    handler: stdSlotVal,
    msg: 'val',
  },
  {
    outlet: OUTLET_KNOBBLER,
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
ROUTER.sort(function (a, b) {
  return a.prefix.length > b.prefix.length ? -1 : 1
})
function anything(val) {
  //log(`message: ${messagename} val: ${val}`)
  for (var _i = 0, ROUTER_1 = ROUTER; _i < ROUTER_1.length; _i++) {
    var router = ROUTER_1[_i]
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
var module = {}
module.exports = {}
