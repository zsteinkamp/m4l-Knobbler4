import {
  colorToString,
  debouncedTask,
  dequote,
  detach,
  isValidPath,
  loadSetting,
  logFactory,
  numArrToJson,
  osc,
  saveSetting,
} from './utils'
import {
  DEFAULT_COLOR_FF,
  MAX_SLOTS,
  noFn,
  nullString,
  OUTLET_MSGS,
} from './consts'

import config from './config'
const log = logFactory(config)

// Pre-computed OSC address strings (indexed 1–32)
const ADDR_VAL: string[] = []
const ADDR_VALSTR: string[] = []
const ADDR_VALCOLOR: string[] = []
const ADDR_PARAM: string[] = []
const ADDR_PARAM_AUTO: string[] = []
const ADDR_DEVICE: string[] = []
const ADDR_TRACK: string[] = []
const ADDR_QUANT: string[] = []
const ADDR_QUANT_ITEMS: string[] = []
for (let _i = 1; _i <= MAX_SLOTS; _i++) {
  ADDR_VAL[_i] = '/val' + _i
  ADDR_VALSTR[_i] = '/valStr' + _i
  ADDR_VALCOLOR[_i] = '/val' + _i + 'color'
  ADDR_PARAM[_i] = '/param' + _i
  ADDR_PARAM_AUTO[_i] = '/param' + _i + 'auto'
  ADDR_DEVICE[_i] = '/device' + _i
  ADDR_TRACK[_i] = '/track' + _i
  ADDR_QUANT[_i] = '/quant' + _i
  ADDR_QUANT_ITEMS[_i] = '/quantItems' + _i
}
// Module-level scratchpad for one-off lookups (reuse via .path is fastest)
// Initialized in initAll() to avoid "Live API is not initialized" at load time
let scratchApi: LiveAPI = null
// Set true by initAll() (gated by live.thisdevice). Bpatcher parameters
// can fire setMin/setMax/setPath before the API is ready — skip those.
let apiReady = false

// slot arrays
const paramObj: LiveAPI[] = []
const paramNameObj: LiveAPI[] = []
const automationStateObj: LiveAPI[] = []
const deviceObj: LiveAPI[] = []
const trackObj: LiveAPI[] = []
const parentNameObj: LiveAPI[] = []
const parentColorObj: LiveAPI[] = []
const param: ParamType[] = []
const outMin: number[] = []
const outMax: number[] = []
const deviceCheckerTask: MaxTask[] = []

// other vars
const allowMapping: boolean[] = []
const allowUpdateFromOsc: boolean[] = []

// XY pad pairs - stores left indices of active pairs
let xyPairs: number[] = []
const XY_PAIRS_KEY = 'xyPairs'

function isSlotInPair(slot: number): number | null {
  for (let i = 0; i < xyPairs.length; i++) {
    if (xyPairs[i] === slot || xyPairs[i] + 1 === slot) {
      return xyPairs[i]
    }
  }
  return null
}

function saveXYPairs() {
  saveSetting(XY_PAIRS_KEY, xyPairs)
}

function loadXYPairs() {
  const val = loadSetting(XY_PAIRS_KEY)
  if (val && typeof val === 'object') {
    xyPairs = (val as number[]).filter(function (n) {
      return typeof n === 'number' && !isNaN(n)
    })
  } else {
    xyPairs = []
  }
}

function sendXYPairs() {
  //log('SEND XY PAIRS', JSON.stringify(xyPairs))
  osc('/xyPairs', numArrToJson(xyPairs))
}

function xyJoin(leftIdx: number) {
  //log('xyJOIN', leftIdx)
  if (leftIdx < 1 || leftIdx >= MAX_SLOTS) {
    return
  }
  // check no overlap with existing pairs
  if (isSlotInPair(leftIdx) !== null || isSlotInPair(leftIdx + 1) !== null) {
    return
  }
  xyPairs.push(leftIdx)
  //log('JOIN', leftIdx, leftIdx + 1)
  saveXYPairs()
  sendXYPairs()
}

function xySplit(leftIdx: number) {
  const idx = xyPairs.indexOf(leftIdx)
  if (idx === -1) {
    return
  }
  xyPairs.splice(idx, 1)
  saveXYPairs()
  sendXYPairs()
}


function unmap(slot: number) {
  //log(`UNMAP ${slot}`)
  // if slot is part of a pair, remove that pair
  const pairLeft = isSlotInPair(slot)
  if (pairLeft !== null) {
    xySplit(pairLeft)
  }
  init(slot)
  refreshSlotUI(slot)
}

function sendMsg(slot: number, msg: MessageType) {
  //log(`${slot} - ${msg.join(' ')}`)
  outlet(OUTLET_MSGS, [slot, ...msg])
}

function setPathParam(slot: number, path: string) {
  if (path) {
    sendMsg(slot, ['path', path])
  }
}

function clearPath(slot: number) {
  //log()
  init(slot)
  refreshSlotUI(slot)
}

function bkMap(slot: number, id: number) {
  if (!apiReady) return
  scratchApi.id = id
  setPath(slot, scratchApi.unquotedpath)
}

function initAll() {
  if (!scratchApi) scratchApi = new LiveAPI(noFn, 'live_set')
  apiReady = true
  for (let i = 1; i <= MAX_SLOTS; i++) {
    initSlotIfNecessary(i)
  }
}

function initSlotIfNecessary(slot: number) {
  if (!param[slot]) {
    init(slot)
  }
}

function init(slot: number) {
  if (!apiReady) return
  //log(`INIT ${slot}`)
  if (paramObj[slot]) {
    detach(paramObj[slot])
    osc(ADDR_VALSTR[slot], nullString)
  }
  paramObj[slot] = null
  allowMapping[slot] = true
  allowUpdateFromOsc[slot] = true
  param[slot] = {
    val: 0,
    min: 0,
    max: 100,
    quant: 0,
    quantItems: [],
    allowParamValueUpdates: true,
  }
  if (deviceCheckerTask[slot]) {
    deviceCheckerTask[slot].cancel()
    deviceCheckerTask[slot].freepeer()
    deviceCheckerTask[slot] = null
  }
  detach(paramNameObj[slot])
  detach(automationStateObj[slot])
  detach(deviceObj[slot])
  detach(parentNameObj[slot])
  detach(parentColorObj[slot])
  detach(trackObj[slot])
  sendMsg(slot, ['mapped', false])
  sendMsg(slot, ['path', ''])
}

function setMin(slot: number, val: number) {
  //log(`SETMIN ${slot}: ${val}`)
  initSlotIfNecessary(slot)
  outMin[slot] = val / 100.0
  sendVal(slot)
}

function setMax(slot: number, val: number) {
  //log(`SETMAX ${slot}: ${val}`)
  initSlotIfNecessary(slot)
  outMax[slot] = val / 100.0
  sendVal(slot)
}

function clearCustomName(slot: number) {
  //log()
  param[slot].customName = null
  sendParamName(slot)
}

function setCustomName(slot: number, args: string) {
  //log(args)
  if (!param[slot]) {
    return
  }

  param[slot].customName = args
  sendParamName(slot)
}

function gotoTrackFor(slot: number) {
  if (!trackObj[slot]) {
    return
  }
  scratchApi.path = 'live_set view'
  scratchApi.set('selected_track', ['id', trackObj[slot].id])
}

function setDefault(slot: number) {
  //log('DEFAULT TOP ' + slot)
  if (!paramObj[slot]) {
    return
  }
  if (!allowUpdateFromOsc[slot]) {
    return
  }
  let defaultValue = paramObj[slot].get('default_value')
  if (typeof defaultValue !== 'object') {
    return
  }
  defaultValue = defaultValue[0]

  paramObj[slot].set('value', defaultValue)
}

function paramValueCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  //log(args, 'ALLOW_UPDATES=', param[slot].allowParamValueUpdates)
  if (param[slot].allowParamValueUpdates) {
    if (iargs[0] === 'value') {
      //log("PARAM_VAL", typeof(iargs[1]), iargs[1], "\n");
      param[slot].val = iargs[1]
      sendVal(slot)
    }
  }
}

function paramNameCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  if (iargs[0] === 'name') {
    param[slot].name = iargs[1]
    sendParamName(slot)
  }
}

function automationStateCallback(slot: number, iargs: IArguments) {
  if (iargs[0] === 'automation_state') {
    sendAutomationState(slot)
  }
}

function deviceNameCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  if (iargs[0] === 'name') {
    param[slot].deviceName = iargs[1]
    sendDeviceName(slot)
  }
}

function parentNameCallback(slot: number, iargs: IArguments) {
  if (iargs[0] === 'name') {
    param[slot].parentName = iargs[1]
    sendTrackName(slot)
  }
}

function trackNameCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  if (iargs[0] === 'name') {
    param[slot].trackName = iargs[1]
    sendTrackName(slot)
  }
}

function parentColorCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  if (iargs[0] === 'color') {
    param[slot].trackColor = colorToString(iargs[1]) + 'FF'
    sendColor(slot)
  }
}

function checkDevicePresent(slot: number) {
  //log('CHECK_DEVICE_PRESENT ' + slot)
  if (!param[slot]) return
  if (deviceObj[slot] && !deviceObj[slot].unquotedpath) {
    //log(`slot=${slot} DEVICE DELETED`)
    init(slot)
    return
  }

  // check if path has changed (e.g. inserting a track above this one)
  if (paramObj[slot] && paramObj[slot].unquotedpath !== param[slot].path) {
    //log(
    //  `UPDATE PATH slot=${slot} new=${paramObj[slot].unquotedpath} old=${param[slot].path}`
    //)
    setPath(slot, paramObj[slot].unquotedpath)
  }
}

function setPath(slot: number, paramPath: string) {
  //log(`SETPATH ${slot}: ${paramPath}`)
  if (!apiReady) return
  initSlotIfNecessary(slot)
  //log(paramPath)
  if (!isValidPath(paramPath)) {
    //log(`skipping ${slot}: ${paramPath}`)
    return
  }
  const testParamObj = new LiveAPI(
    (iargs: IArguments) => paramValueCallback(slot, iargs),
    paramPath
  )
  // catch bad paths
  if (testParamObj.id === 0) {
    log(`Invalid path for slot ${slot}: ${paramPath}`)
    return
  }
  testParamObj.property = 'value'
  paramObj[slot] = testParamObj

  paramNameObj[slot] = new LiveAPI(
    (iargs: IArguments) => paramNameCallback(slot, iargs),
    paramPath
  )
  paramNameObj[slot].property = 'name'

  automationStateObj[slot] = new LiveAPI(
    (iargs: IArguments) => automationStateCallback(slot, iargs),
    paramPath
  )
  automationStateObj[slot].property = 'automation_state'

  param[slot].id = paramObj[slot].id
  param[slot].path = paramObj[slot].unquotedpath
  param[slot].val = parseFloat(paramObj[slot].get('value'))
  param[slot].min = parseFloat(paramObj[slot].get('min')) || 0
  param[slot].max = parseFloat(paramObj[slot].get('max')) || 1
  param[slot].name = paramObj[slot].get('name')[0]
  param[slot].quant =
    parseInt(paramObj[slot].get('is_quantized')) > 0
      ? paramObj[slot].get('value_items').length
      : 0
  param[slot].quantItems =
    parseInt(paramObj[slot].get('is_quantized')) > 0
      ? paramObj[slot].get('value_items')
      : ''

  deviceObj[slot] = new LiveAPI(
    (iargs: IArguments) => deviceNameCallback(slot, iargs),
    paramObj[slot] && paramObj[slot].get('canonical_parent')
  )
  const devicePath = deviceObj[slot].unquotedpath

  // poll to see if the mapped device is still present
  if (deviceCheckerTask[slot] && deviceCheckerTask[slot].cancel) {
    deviceCheckerTask[slot].cancel()
    deviceCheckerTask[slot].freepeer()
    deviceCheckerTask[slot] = null
  }
  deviceCheckerTask[slot] = new Task(() => checkDevicePresent(slot)) as MaxTask
  deviceCheckerTask[slot].interval = 1000 // every second
  deviceCheckerTask[slot].repeat(-1)

  // Only get the device name if it has the name property
  if (deviceObj[slot].info.match(/property name str/)) {
    deviceObj[slot].property = 'name'
    param[slot].deviceName = deviceObj[slot].get('name')
  } else if (param[slot].path.match(/mixer_device/)) {
    param[slot].deviceName = 'Mixer'
  }

  const parentId = deviceObj[slot].get('canonical_parent')

  // parent name
  parentNameObj[slot] = new LiveAPI(
    (iargs: IArguments) => parentNameCallback(slot, iargs),
    parentId
  )
  parentNameObj[slot].property = 'name'
  param[slot].parentName = parentNameObj[slot].get('name')

  // parent color
  parentColorObj[slot] = new LiveAPI(
    (iargs: IArguments) => parentColorCallback(slot, iargs),
    parentId
  )
  parentColorObj[slot].property = 'color'
  param[slot].trackColor =
    colorToString(parentColorObj[slot].get('color')) + 'FF'

  // Try to get the track name
  const matches =
    devicePath.match(/^live_set tracks \d+/) ||
    devicePath.match(/^live_set return_tracks \d+/) ||
    devicePath.match(/^live_set master_track/)

  if (matches) {
    //log(matches[0])
    trackObj[slot] = new LiveAPI(
      (iargs: IArguments) => trackNameCallback(slot, iargs),
      matches[0]
    )
  }

  //log("PARAM DATA", JSON.stringify(param), "\n");
  sendMsg(slot, ['mapped', true])
  setPathParam(slot, param[slot].path)

  // Defer outputting the new param val because the controller
  // will not process it since it was just sending other vals
  // that triggered the mapping.
  const sendValTask = new Task(function () {
    sendVal(slot)
  })
  debouncedTask('sendVal', slot, sendValTask, 333)
  sendNames(slot)
}

function refresh() {
  //log('IN REFRESH')
  if (!apiReady) return
  for (let i = 1; i <= MAX_SLOTS; i++) {
    refreshSlotUI(i)
  }
  loadXYPairs()
  sendXYPairs()
}

function refreshSlotUI(slot: number) {
  sendNames(slot)
  sendVal(slot)
}

function sendNames(slot: number) {
  //log(param.name, param.deviceName, param.trackName)
  sendParamName(slot)
  sendAutomationState(slot)
  sendDeviceName(slot)
  sendTrackName(slot)
  sendColor(slot)
  sendQuant(slot)
}

function sendQuant(slot: number) {
  initSlotIfNecessary(slot)
  osc(ADDR_QUANT[slot], param[slot].quant)
  if (param[slot] && param[slot].quant > 2) {
    osc(ADDR_QUANT_ITEMS[slot], JSON.stringify(param[slot].quantItems))
  } else {
    osc(ADDR_QUANT_ITEMS[slot], '[]')
  }
}

function sendParamName(slot: number) {
  //log(`SEND PARAM NAME ${slot}`)
  initSlotIfNecessary(slot)
  const paramName = dequote(
    (
      (param[slot] && (param[slot].customName || param[slot].name)) ||
      nullString
    ).toString()
  )
  sendMsg(slot, ['param', paramName])
  //log('SEND PARAM NAME ' + slot + '=' + paramName)
  osc(ADDR_PARAM[slot], paramName)
}

function sendAutomationState(slot: number) {
  initSlotIfNecessary(slot)
  const automationState = parseInt(
    (paramObj && paramObj[slot] && paramObj[slot].get('automation_state')) || 0
  )
  //log('PAYLOAD ' + ADDR_PARAM_AUTO[slot] + ' ' + automationState)
  osc(ADDR_PARAM_AUTO[slot], automationState)
}

function sendDeviceName(slot: number) {
  //log(`SEND DEVICE NAME ${slot}`)
  initSlotIfNecessary(slot)
  const deviceName = param[slot].deviceName
    ? dequote(param[slot].deviceName.toString())
    : nullString
  sendMsg(slot, ['device', deviceName])
  osc(ADDR_DEVICE[slot], deviceName)
}

function sendTrackName(slot: number) {
  //log(`SEND TRACK NAME ${slot}`)
  initSlotIfNecessary(slot)
  const trackName = param[slot].parentName
    ? dequote(param[slot].parentName.toString())
    : nullString
  sendMsg(slot, ['track', trackName])
  osc(ADDR_TRACK[slot], trackName)
}

function sendColor(slot: number) {
  //log(`SEND COLOR ${slot}`)
  initSlotIfNecessary(slot)
  let trackColor = param[slot].trackColor
    ? dequote(param[slot].trackColor.toString())
    : DEFAULT_COLOR_FF
  osc(ADDR_VALCOLOR[slot], trackColor)

  // for the color highlight in the Max for Live device
  if (trackColor === DEFAULT_COLOR_FF) {
    trackColor = '000000FF'
  }
  const red = parseInt(trackColor.substring(0, 2), 16) / 255.0 || 0
  const grn = parseInt(trackColor.substring(2, 4), 16) / 255.0 || 0
  const blu = parseInt(trackColor.substring(4, 6), 16) / 255.0 || 0
  const alp = parseInt(trackColor.substring(6, 8), 16) / 255.0 || 0
  sendMsg(slot, ['color', red, grn, blu, alp])
}

function sendVal(slot: number) {
  //log(`SEND VAL ${slot}`)
  initSlotIfNecessary(slot)

  if (
    !paramObj[slot] ||
    paramObj[slot].id === 0 ||
    param[slot].val === undefined ||
    param[slot].max === undefined ||
    param[slot].min === undefined ||
    outMax[slot] === outMin[slot]
  ) {
    osc(ADDR_VAL[slot], 0)
    osc(ADDR_VALSTR[slot], nullString)
    return
  }

  // the value, expressed as a proportion between the param min and max
  const valProp =
    (param[slot].val - param[slot].min) / (param[slot].max - param[slot].min)

  //log('VALPROP', valProp, JSON.stringify(param), 'OUTMINMAX', outMin, outMax)

  // scale the param proportion value to the output min/max proportion
  let scaledValProp = (valProp - outMin[slot]) / (outMax[slot] - outMin[slot])
  scaledValProp = Math.min(scaledValProp, 1)
  scaledValProp = Math.max(scaledValProp, 0)

  //log(`SCALEDVALPROP slot=${slot} val=${scaledValProp}`)
  osc(ADDR_VAL[slot], scaledValProp)
  osc(
    ADDR_VALSTR[slot],
    paramObj[slot]
      ? paramObj[slot].call('str_for_value', param[slot].val)
      : nullString
  )
}

// new value received over OSC
function val(slot: number, val: number) {
  //log(slot + ' - VAL: ' + val)
  if (paramObj[slot]) {
    if (allowUpdateFromOsc[slot]) {
      // scale the 0..1 value to the param's min/max range
      const scaledVal = (outMax[slot] - outMin[slot]) * val + outMin[slot]
      param[slot].val =
        (param[slot].max - param[slot].min) * scaledVal + param[slot].min

      // prevent updates from params directly being sent to OSC for 500ms
      if (param[slot].allowParamValueUpdates) {
        param[slot].allowParamValueUpdates = false
        const allowUpdatesTask = new Task(function () {
          param[slot].allowParamValueUpdates = true
        })
        debouncedTask('allowUpdates', slot, allowUpdatesTask, 500)
      }
      //log('VAL ' + paramObj[slot] + ' ' + param[slot].val)
      paramObj[slot].set('value', param[slot].val)
      // get() the value from the param instead of re-using the val we
      // calculated above because buttons and whatnot will report the wrong
      // string value due to what looks like a rounding bug inside of
      // those params (e.g. str_for_value(0.9) yields "on" even though
      // the device shows up as "off"
      osc(
        ADDR_VALSTR[slot],
        paramObj[slot].call('str_for_value', paramObj[slot].get('value'))
      )
    }
  } else {
    //log('GONNA_MAP', 'ALLOWED=', allowMapping)
    // If we get a OSC value but are unassigned, trigger a mapping.
    // This removes a step from typical mapping.
    if (allowMapping[slot]) {
      // debounce mapping, since moving the CC will trigger many message
      allowMapping[slot] = false
      const allowMappingTask = new Task(function () {
        allowMapping[slot] = true
      })
      debouncedTask('allowMapping', slot, allowMappingTask, 1000)

      // wait 500ms before paying attention to values again after mapping
      if (allowUpdateFromOsc[slot]) {
        allowUpdateFromOsc[slot] = false
        const allowUpdateFromOscTask = new Task(function () {
          allowUpdateFromOsc[slot] = true
        })
        debouncedTask('allowUpdateFromOsc', slot, allowUpdateFromOscTask, 500)
      }

      //log("PRE-SELOBJ\n");
      scratchApi.path = 'live_set view selected_parameter'
      if (!scratchApi.unquotedpath) {
        post('No Live param is selected.\n')
      } else {
        //log('SELOBJ', scratchApi.unquotedpath, 'SELOBJINFO', scratchApi.info)
        // Only map things that have a 'value' property
        if (scratchApi.info.match(/property value/)) {
          setPath(slot, scratchApi.unquotedpath)
        }
      }
    }
  }
}

const module = {}

export {
  bkMap,
  clearCustomName,
  clearPath,
  gotoTrackFor,
  initAll,
  refresh,
  setCustomName,
  setDefault,
  setMax,
  setMin,
  setPath,
  unmap,
  val,
  xyJoin,
  xySplit,
}
