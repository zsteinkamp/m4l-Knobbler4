import {
  colorToString,
  debouncedTask,
  dequote,
  isValidPath,
  logFactory,
} from './utils'
import {
  DEFAULT_COLOR_FF,
  MAX_SLOTS,
  noFn,
  nullString,
  OUTLET_MSGS,
  OUTLET_OSC,
} from './consts'

import config from './config'
const log = logFactory(config)

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

function unmap(slot: number) {
  //log(`UNMAP ${slot}`)
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
  const api = new LiveAPI(noFn, 'id ' + id)
  setPath(slot, api.unquotedpath)
}

function initAll() {
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
  //log(`INIT ${slot}`)
  if (paramObj[slot]) {
    // clean up callbacks when unmapping
    paramObj[slot].id = 0
    outlet(OUTLET_OSC, ['/valStr' + slot, nullString])
  }
  paramObj[slot] = null
  allowMapping[slot] = true
  allowUpdateFromOsc[slot] = true
  param[slot] = {
    val: 0,
    min: 0,
    max: 100,
    allowParamValueUpdates: true,
  }
  if (deviceCheckerTask[slot]) {
    deviceCheckerTask[slot].cancel()
    deviceCheckerTask[slot].freepeer()
    deviceCheckerTask[slot] = null
  }
  if (paramNameObj[slot]) {
    paramNameObj[slot].id = 0
  }
  if (deviceObj[slot]) {
    deviceObj[slot].id = 0
  }
  if (trackObj[slot]) {
    trackObj[slot].id = 0
  }
  if (parentColorObj[slot]) {
    parentColorObj[slot].id = 0
  }
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
  const viewObj = new LiveAPI(() => {}, 'live_set view')
  viewObj.set('selected_track', ['id', trackObj[slot].id])
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
  // This function is called whenever the parameter value changes,
  // either via OSC control or by changing the device directly.
  // We need to distinguish between the two and not do anything if the
  // value was changed due to OSC input. Otherwise, we would create a feedback
  // loop since this the purpose of this function is to update the displayed
  // value on the OSC controller to show automation or direct manipulation.
  // We accomplish this by keeping a timestamp of the last time OSC data was
  // received, and only taking action here if more than 500ms has passed.

  //log(args, 'ALLOW_UPDATES=', param[slot].allowParamValueUpdates)
  if (param[slot].allowParamValueUpdates) {
    const args = arrayfromargs(iargs)
    if (args[0] === 'value') {
      //log("PARAM_VAL", typeof(args[1]), args[1], "\n");
      param[slot].val = args[1]
      sendVal(slot)
    } else {
      //log('SUMPIN ELSE', args[0], args[1])
    }
  }
}

function paramNameCallback(slot: number, iargs: IArguments) {
  //log(iargs)
  const args = arrayfromargs(iargs)
  //log('PARAM NAME CALLBACK ' + args.join(','))
  if (args[0] === 'name') {
    param[slot].name = args[1]
    sendParamName(slot)
  }
}

function automationStateCallback(slot: number, iargs: IArguments) {
  //log(iargs)
  const args = arrayfromargs(iargs)
  //log('PARAM NAME CALLBACK ' + args.join(','))
  if (args[0] === 'automation_state') {
    sendAutomationState(slot)
  }
}

function deviceNameCallback(slot: number, iargs: IArguments) {
  //log(args)
  //log('DEVICE NAME CALLBACK')
  const args: any[] = arrayfromargs(iargs)
  if (args[0] === 'name') {
    param[slot].deviceName = args[1]
    sendDeviceName(slot)
  }
}

function parentNameCallback(slot: number, iargs: IArguments) {
  //log('PARENT NAME CALLBACK')
  //log(args)
  const args = arrayfromargs(iargs)
  if (args[0] === 'name') {
    param[slot].parentName = args[1]
    sendTrackName(slot)
  }
}

function trackNameCallback(slot: number, iargs: IArguments) {
  //log('TRACK NAME CALLBACK')
  //log(args)
  const args = arrayfromargs(iargs)
  if (args[0] === 'name') {
    param[slot].trackName = args[1]
    sendTrackName(slot)
  }
}

function parentColorCallback(slot: number, iargs: IArguments) {
  //log('PARENT COLOR CALLBACK')
  const args = arrayfromargs(iargs)
  //log('PARENTCOLOR', args)
  if (args[0] === 'color') {
    param[slot].trackColor = colorToString(args[1]) + 'FF'
    sendColor(slot)
  }
}

function checkDevicePresent(slot: number) {
  //log('CHECK_DEVICE_PRESENT ' + slot)
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
  for (let i = 1; i <= MAX_SLOTS; i++) {
    refreshSlotUI(i)
  }
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
  outlet(OUTLET_OSC, ['/param' + slot, paramName])
}

function sendAutomationState(slot: number) {
  initSlotIfNecessary(slot)
  const automationState = parseInt(
    (paramObj && paramObj[slot] && paramObj[slot].get('automation_state')) || 0
  )
  const payload = ['/param' + slot + 'auto', automationState]
  //log('PAYLOAD ' + JSON.stringify(payload))
  outlet(OUTLET_OSC, payload)
}

function sendDeviceName(slot: number) {
  //log(`SEND DEVICE NAME ${slot}`)
  initSlotIfNecessary(slot)
  const deviceName = param[slot].deviceName
    ? dequote(param[slot].deviceName.toString())
    : nullString
  sendMsg(slot, ['device', deviceName])
  outlet(OUTLET_OSC, ['/device' + slot, deviceName])
}

function sendTrackName(slot: number) {
  //log(`SEND TRACK NAME ${slot}`)
  initSlotIfNecessary(slot)
  const trackName = param[slot].parentName
    ? dequote(param[slot].parentName.toString())
    : nullString
  sendMsg(slot, ['track', trackName])
  outlet(OUTLET_OSC, ['/track' + slot, trackName])
}

function sendColor(slot: number) {
  //log(`SEND COLOR ${slot}`)
  initSlotIfNecessary(slot)
  let trackColor = param[slot].trackColor
    ? dequote(param[slot].trackColor.toString())
    : DEFAULT_COLOR_FF
  outlet(OUTLET_OSC, ['/val' + slot + 'color', trackColor])

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
    outlet(OUTLET_OSC, ['/val' + slot, 0])
    outlet(OUTLET_OSC, ['/valStr' + slot, nullString])
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
  outlet(OUTLET_OSC, ['/val' + slot, scaledValProp])
  outlet(OUTLET_OSC, [
    '/valStr' + slot,
    paramObj[slot]
      ? paramObj[slot].call('str_for_value', param[slot].val)
      : nullString,
  ])
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
      outlet(OUTLET_OSC, [
        '/valStr' + slot,
        // get() the value from the param instead of re-using the val we
        // calculated above because buttons and whatnot will report the wrong
        // string value due to what looks like a rounding bug inside of
        // those params (e.g. str_for_value(0.9) yields "on" even though
        // the device shows up as "off"
        paramObj[slot].call('str_for_value', paramObj[slot].get('value')),
      ])
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
      const selObj = new LiveAPI(() => {}, 'live_set view selected_parameter')
      if (!selObj.unquotedpath) {
        post('No Live param is selected.\n')
      } else {
        //log('SELOBJ', selObj.unquotedpath, 'SELOBJINFO', selObj.info)
        // Only map things that have a 'value' property
        if (selObj.info.match(/property value/)) {
          setPath(slot, selObj.unquotedpath)
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
}
