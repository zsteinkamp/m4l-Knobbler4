var __spreadArray =
  (this && this.__spreadArray) ||
  function (to, from, pack) {
    if (pack || arguments.length === 2)
      for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i)
          ar[i] = from[i]
        }
      }
    return to.concat(ar || Array.prototype.slice.call(from))
  }
autowatch = 1
inlets = 1
outlets = 2
const INLET_MSGS = 0
const OUTLET_OSC = 0
const OUTLET_MSGS = 1
const MAX_SLOTS = 32
setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setinletassist(OUTLET_OSC, 'Output OSC messages')
setinletassist(
  OUTLET_MSGS,
  'Output messages for other devices or bpatchers. Example: 5-SLOT mapped 1'
)
var debugLog = true
function kDebug(_) {
  if (debugLog) {
    post(
      //'[' + kDebug.caller ? kDebug.caller.name : 'ROOT' + ']',
      Array.prototype.slice.call(arguments).join(' '),
      '\n'
    )
  }
}
kDebug('reloaded')
// slot arrays
var paramObj = []
var paramNameObj = []
var deviceObj = []
var trackObj = []
var trackColorObj = []
var param = []
var outMin = []
var outMax = []
var deviceCheckerTask = []
// other vars
var nullString = '- - -'
var allowMapping = true
var allowParamValueUpdates = true
var allowUpdateFromOsc = true
var allowParamValueUpdatesTask = null
kDebug('reloaded')
function isValidPath(path) {
  return typeof path === 'string' && path.match(/^live_set /)
}
function dequote(str) {
  //kDebug(str, typeof str)
  return str.toString().replace(/^"|"$/g, '')
}
function unmap(slot) {
  //kDebug(`UNMAP ${slot}`)
  init(slot)
  refreshSlotUI(slot)
}
function sendMsg(slot, msg) {
  //kDebug(`${slot} - ${msg.join(' ')}`)
  outlet(OUTLET_MSGS, __spreadArray([slot], msg, true))
}
function setPathParam(slot, path) {
  if (path) {
    sendMsg(slot, ['path', path])
  }
}
function clearPath(slot) {
  //kDebug()
  init(slot)
  refreshSlotUI(slot)
}
function initAll() {
  for (var i = 0; i < MAX_SLOTS; i++) {
    initSlotIfNecessary(i)
  }
}
function initSlotIfNecessary(slot) {
  if (!param[slot]) {
    init(slot)
  }
}
function init(slot) {
  //kDebug('INIT')
  if (paramObj[slot]) {
    // clean up callbacks when unmapping
    paramObj[slot].id = 0
    outlet(OUTLET_OSC, ['/valStr' + slot, nullString])
  }
  paramObj[slot] = null
  param[slot] = {
    val: 0,
    min: 0,
    max: 100,
  }
  if (deviceCheckerTask[slot]) {
    deviceCheckerTask[slot].cancel()
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
  if (trackColorObj[slot]) {
    trackColorObj[slot].id = 0
  }
  sendMsg(slot, ['mapped', false])
  sendMsg(slot, ['path', ''])
}
function setMin(slot, val) {
  initSlotIfNecessary(slot)
  //kDebug(val)
  outMin[slot] = val / 100.0
  sendVal(slot)
}
function setMax(slot, val) {
  initSlotIfNecessary(slot)
  //kDebug(val)
  outMax[slot] = val / 100.0
  sendVal(slot)
}
function clearCustomName(slot) {
  //kDebug()
  param[slot].customName = null
  sendParamName(slot)
}
function setCustomName(slot, args) {
  //kDebug(args)
  if (!param[slot]) {
    return
  }
  param[slot].customName = args
  sendParamName(slot)
}
function paramValueCallback(slot, iargs) {
  // This function is called whenever the parameter value changes,
  // either via OSC control or by changing the device directly.
  // We need to distinguish between the two and not do anything if the
  // value was changed due to OSC input. Otherwise, since we would create a feedback
  // loop since this the purpose of this function is to update the displayed
  // value on the OSC controller to show automation or direct manipulation.
  // We accomplish this by keeping a timestamp of the last time OSC data was
  // received, and only taking action here if more than 500ms has passed.
  //kDebug(args, 'ALLOW_UPDATES=', allowParamValueUpdates)
  if (allowParamValueUpdates) {
    var args = arrayfromargs(iargs)
    if (args[0] === 'value') {
      //post("PARAM_VAL", typeof(args[1]), args[1], "\n");
      param[slot].val = args[1]
      sendVal(slot)
    } else {
      //kDebug('SUMPIN ELSE', args[0], args[1])
    }
  }
}
function paramNameCallback(slot, iargs) {
  //kDebug(iargs)
  //kDebug('PARAM NAME CALLBACK')
  var args = arrayfromargs(iargs)
  if (args[0] === 'name') {
    param[slot].name = args[1]
    sendParamName(slot)
  }
}
function deviceNameCallback(slot, iargs) {
  //kDebug(args)
  //kDebug('DEVICE NAME CALLBACK')
  var args = arrayfromargs(iargs)
  if (args[0] === 'name') {
    param[slot].deviceName = args[1]
    sendDeviceName(slot)
  }
}
function trackNameCallback(slot, iargs) {
  //kDebug('TRACK NAME CALLBACK')
  //kDebug(args)
  var args = arrayfromargs(iargs)
  if (args[0] === 'name') {
    param[slot].trackName = args[1]
    sendTrackName(slot)
  }
}
function colorToString(colorVal) {
  var retString = parseInt(colorVal).toString(16).toUpperCase()
  var strlen = retString.length
  for (var i = 0; i < 6 - strlen; i++) {
    retString = '0' + retString
  }
  return retString + 'FF'
}
function trackColorCallback(slot, iargs) {
  //kDebug('TRACK COLOR CALLBACK')
  var args = arrayfromargs(iargs)
  //kDebug('TRACKCOLOR', args)
  if (args[0] === 'color') {
    param[slot].trackColor = colorToString(args[1])
    sendColor(slot)
  }
}
function checkDevicePresent(slot) {
  //kDebug('PO=', paramObj.unquotedpath, 'PP=', param.path, 'PL=', pathListener.getvalue());
  if (deviceObj[slot] && !deviceObj[slot].unquotedpath) {
    //kDebug('DEVICE DELETED')
    init(slot)
    return
  }
  // check if path has changed (e.g. inserting a track above this one)
  if (paramObj[slot] && paramObj[slot].unquotedpath !== param[slot].path) {
    //kDebug(
    //  'path is different  NEW=',
    //  paramObj.unquotedpath,
    //  '  OLD=',
    //  param.path
    //)
    param[slot].path = paramObj[slot].unquotedpath
    sendMsg(slot, ['path', paramObj[slot].unquotedpath])
  }
}
function setPath(slot, paramPath) {
  initSlotIfNecessary(slot)
  //kDebug(`SETPATH ${slot}: ${paramPath}`)
  //kDebug(paramPath)
  if (!isValidPath(paramPath)) {
    //kDebug('skipping', paramPath)
    return
  }
  paramObj[slot] = new LiveAPI(function (iargs) {
    return paramValueCallback(slot, iargs)
  }, paramPath)
  paramObj[slot].property = 'value'
  paramNameObj[slot] = new LiveAPI(function (iargs) {
    return paramNameCallback(slot, iargs)
  }, paramPath)
  paramNameObj[slot].property = 'name'
  param[slot].id = paramObj[slot].id
  param[slot].path = paramObj[slot].unquotedpath
  param[slot].val = parseFloat(paramObj[slot].get('value'))
  param[slot].min = parseFloat(paramObj[slot].get('min')) || 0
  param[slot].max = parseFloat(paramObj[slot].get('max')) || 1
  param[slot].name = paramObj[slot].get('name')[0]
  //kDebug('SET PARAM ' + JSON.stringify(param[slot]))
  deviceObj[slot] = new LiveAPI(function (iargs) {
    return deviceNameCallback(slot, iargs)
  }, paramObj[slot].get('canonical_parent'))
  var devicePath = deviceObj[slot].unquotedpath
  //kDebug(
  //  'PARAMPATH=',
  //  paramObj.unquotedpath,
  //  'DEVICEPATH=',
  //  deviceObj.unquotedpath
  //)
  // poll to see if the mapped device is still present
  if (deviceCheckerTask[slot] && deviceCheckerTask[slot].cancel) {
    deviceCheckerTask[slot].cancel()
    deviceCheckerTask = null
  }
  deviceCheckerTask[slot] = new Task(checkDevicePresent)
  deviceCheckerTask[slot].repeat(-1)
  // Only get the device name if it has the name property
  if (deviceObj[slot].info.match(/property name str/)) {
    deviceObj[slot].property = 'name'
    param[slot].deviceName = deviceObj[slot].get('name')
  } else if (param[slot].path.match(/mixer_device/)) {
    param[slot].deviceName = 'Mixer'
  }
  // Try to get the track name
  var matches =
    devicePath.match(/^live_set tracks \d+/) ||
    devicePath.match(/^live_set return_tracks \d+/) ||
    devicePath.match(/^live_set master_track/)
  if (matches) {
    //kDebug(matches[0])
    trackObj[slot] = new LiveAPI(function (iargs) {
      return trackNameCallback(slot, iargs)
    }, matches[0])
    if (trackObj[slot].info.match(/property name str/)) {
      trackObj[slot].property = 'name'
      param[slot].trackName = trackObj[slot].get('name')
    } else if (param[slot].path.match(/mixer_device/)) {
      param[slot].trackName = 'Mixer'
    }
    trackColorObj[slot] = new LiveAPI(function (iargs) {
      return trackColorCallback(slot, iargs)
    }, matches[0])
    trackColorObj[slot].property = 'color'
    param[slot].trackColor = colorToString(trackColorObj[slot].get('color'))
  }
  //post("PARAM DATA", JSON.stringify(param), "\n");
  sendMsg(slot, ['mapped', true])
  setPathParam(slot, param[slot].path)
  // Defer outputting the new param val because the controller
  // will not process it since it was just sending other vals
  // that triggered the mapping.
  new Task(function () {
    sendVal(slot)
  }).schedule(333)
  sendNames(slot)
}
function refresh() {
  for (var i = 0; i < MAX_SLOTS; i++) {
    refreshSlotUI(i)
  }
}
function refreshSlotUI(slot) {
  sendNames(slot)
  sendVal(slot)
}
function sendNames(slot) {
  //kDebug(param.name, param.deviceName, param.trackName)
  sendParamName(slot)
  sendDeviceName(slot)
  sendTrackName(slot)
  sendColor(slot)
}
function sendParamName(slot) {
  initSlotIfNecessary(slot)
  var paramName = dequote(
    (
      (param[slot] && (param[slot].customName || param[slot].name)) ||
      nullString
    ).toString()
  )
  sendMsg(slot, ['param', paramName])
  outlet(OUTLET_OSC, ['/param' + slot, paramName])
}
function sendDeviceName(slot) {
  initSlotIfNecessary(slot)
  var deviceName = param[slot].deviceName
    ? dequote(param[slot].deviceName.toString())
    : nullString
  sendMsg(slot, ['device', deviceName])
  outlet(OUTLET_OSC, ['/device' + slot, deviceName])
}
function sendTrackName(slot) {
  initSlotIfNecessary(slot)
  var trackName = param[slot].trackName
    ? dequote(param[slot].trackName.toString())
    : nullString
  sendMsg(slot, ['track', trackName])
  outlet(OUTLET_OSC, ['/track' + slot, trackName])
}
var DEFAULT_RED = 'FF0000FF'
function sendColor(slot) {
  initSlotIfNecessary(slot)
  var trackColor = param[slot].trackColor
    ? dequote(param[slot].trackColor.toString())
    : DEFAULT_RED
  outlet(OUTLET_OSC, ['/val' + slot + 'color', trackColor])
  if (trackColor === DEFAULT_RED) {
    trackColor = '000000FF'
  }
  var red = parseInt(trackColor.substring(0, 2), 16) / 255.0 || 0
  var grn = parseInt(trackColor.substring(2, 4), 16) / 255.0 || 0
  var blu = parseInt(trackColor.substring(4, 6), 16) / 255.0 || 0
  var alp = parseInt(trackColor.substring(6, 8), 16) / 255.0 || 0
  sendMsg(slot, ['color', red, grn, blu, alp])
}
function sendVal(slot) {
  initSlotIfNecessary(slot)
  // protect against divide-by-zero errors
  if (outMax[slot] === outMin[slot]) {
    if (outMax[slot] === 1) {
      outMin[slot] = 0.99
    } else if (outMax[slot] === 0) {
      outMax[slot] = 0.01
    }
  }
  if (
    param[slot].val === undefined ||
    param[slot].max === undefined ||
    param[slot].min === undefined
  ) {
    outlet(OUTLET_OSC, ['/val' + slot, 0])
    outlet(OUTLET_OSC, ['/valStr' + slot, nullString])
    return
  }
  // the value, expressed as a proportion between the param min and max
  var valProp =
    (param[slot].val - param[slot].min) / (param[slot].max - param[slot].min)
  //kDebug('VALPROP', valProp, JSON.stringify(param), 'OUTMINMAX', outMin, outMax)
  // scale the param proportion value to the output min/max proportion
  var scaledValProp = (valProp - outMin[slot]) / (outMax[slot] - outMin[slot])
  scaledValProp = Math.min(scaledValProp, 1)
  scaledValProp = Math.max(scaledValProp, 0)
  //kDebug('SCALEDVALPROP', '/val' + instanceId, scaledValProp)
  outlet(OUTLET_OSC, ['/val' + slot, scaledValProp])
  outlet(OUTLET_OSC, [
    '/valStr' + slot,
    paramObj[slot]
      ? paramObj[slot].call('str_for_value', param[slot].val)
      : nullString,
  ])
}
function val(slot, val) {
  //kDebug(slot + ' - VAL: ' + val)
  if (paramObj[slot]) {
    if (allowUpdateFromOsc) {
      var scaledVal = (outMax[slot] - outMin[slot]) * val + outMin[slot]
      param[slot].val =
        (param[slot].max - param[slot].min) * scaledVal + param[slot].min
      //kDebug('VALS', JSON.stringify({ param_max: param.max, param_min: param.min, scaledVal: scaledVal, val: val }));
      // prevent updates from params directly being sent to OSC for 500ms
      if (allowParamValueUpdates) {
        allowParamValueUpdates = false
        if (allowParamValueUpdatesTask !== null) {
          allowParamValueUpdatesTask.cancel()
        }
        allowParamValueUpdatesTask = new Task(function () {
          allowParamValueUpdates = true
        })
        allowParamValueUpdatesTask.schedule(500)
      }
      //post('PARAMVAL', param.val, "\n");
      paramObj[slot].set('value', param[slot].val)
      outlet(OUTLET_OSC, [
        '/valStr' + slot,
        paramObj[slot].call('str_for_value', param[slot].val),
      ])
    }
  } else {
    //kDebug('GONNA_MAP', 'ALLOWED=', allowMapping)
    // If we get a OSC value but are unassigned, trigger a mapping.
    // This removes a step from typical mapping.
    if (allowMapping) {
      // debounce mapping, since moving the CC will trigger many message
      allowMapping = false
      new Task(function () {
        allowMapping = true
      }).schedule(1000)
      // wait 500ms before paying attention to values again after mapping
      if (allowUpdateFromOsc) {
        allowUpdateFromOsc = false
        new Task(function () {
          allowUpdateFromOsc = true
        }).schedule(500)
      }
      //post("PRE-SELOBJ\n");
      var selObj = new LiveAPI(
        function () {},
        'live_set view selected_parameter'
      )
      if (!selObj.unquotedpath) {
        post('No Live param is selected.\n')
      } else {
        //kDebug('SELOBJ', selObj.unquotedpath, 'SELOBJINFO', selObj.info)
        // Only map things that have a 'value' property
        if (selObj.info.match(/property value/)) {
          setPath(slot, selObj.unquotedpath)
        }
      }
    }
  }
}
