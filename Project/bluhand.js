////////////////////////////////////////////////
// M4L Config
////////////////////////////////////////////////

autowatch = 1
outlets = 1

var OUTLET_OSC = 0
var PAGE_SIZE = 16 // "Device On" is always the first

setoutletassist(OUTLET_OSC, 'OSC Messages')

////////////////////////////////////////////////
// VARIABLES
////////////////////////////////////////////////

var debugLog = true

var data = {
  currBank: 0,
  paramIdArr: [],
  trackName: null,
  deviceName: null,
  params: [],
  debouncers: {
    deviceName: null,
    params: null,
  },
  observers: {
    trackName: null,
    deviceName: null,
    params: null,
  },
  objIdToParamIdx: {},
}
var lomParamsArr = []
var nullString = '- - -'

debug('reloaded')

////////////////////////////////////////////////
// EXTERNAL METHODS
////////////////////////////////////////////////

function bang() {
  setupListener()
}

////////////////////////////////////////////////
// INTERNAL METHODS
////////////////////////////////////////////////

function debounce(id, future) {
  if (data.debouncers[id]) {
    data.debouncers[id].cancel()
  }
  data.debouncers[id] = new Task(future)
  data.debouncers[id].schedule(300)
}

function setupListener() {
  //debug('SETUP LISTENERS')

  // TRACK NAME
  data.observers.trackName = new LiveAPI(
    trackNameCallback,
    'live_set view selected_track'
  )
  data.observers.trackName.mode = 1
  data.observers.trackName.property = 'name'

  // DEVICE NAME
  data.observers.deviceName = new LiveAPI(
    deviceNameCallback,
    'live_set appointed_device'
  )
  data.observers.deviceName.mode = 1
  data.observers.deviceName.property = 'name'

  // DEVICE PARAMETERS
  data.observers.params = new LiveAPI(
    parametersCallback,
    'live_set appointed_device'
  )
  data.observers.params.mode = 1
  data.observers.params.property = 'parameters'
}

function colorToString(colorVal) {
  var retString = parseInt(colorVal).toString(16).toUpperCase()
  var strlen = retString.length
  for (var i = 0; i < 6 - strlen; i++) {
    retString = '0' + retString
  }
  return retString + 'FF'
}

function trackNameCallback(args) {
  //debug('TRACK ID', parseInt(this.id))
  //debug(args)
  if (parseInt(this.id) === 0) {
    data.trackName = 'none'
  } else {
    data.trackName = this.get('name')
  }
  data.trackColor = colorToString(this.get('color'))
  //debug('TRACKCOLOR', data.trackColor)
  updateDeviceName()
}

function deviceNameCallback(args) {
  //debug('DEVICE ID', parseInt(this.id))
  if (parseInt(this.id) === 0) {
    data.deviceName = 'none'
  } else {
    data.deviceName = this.get('name')
  }
  updateDeviceName()
}

function updateDeviceName() {
  debounce('deviceName', function () {
    var message = ['/bcurrDeviceName', data.trackName + ' > ' + data.deviceName]
    if (!(data.trackName && data.deviceName)) {
      message = ['/bcurrDeviceName', 'No device selected']
    }
    sendOsc(message)
  })
}

function paramKey(paramObj) {
  var key = paramObj.id.toString()
  //debug(key)
  return key
}

function parametersCallback(args) {
  //debug(JSON.stringify(args))
  if (parseInt(this.id) === 0) {
    return
  }
  data.paramIdArr = this.get('parameters').filter(function (p) {
    return p !== 'id'
  })
  data.currBank = 0

  //debugLog = true
  //debug(data.paramIdArr.join(','))
  //debugLog = false

  debounce('params', refreshParams)
}

function refreshParams() {
  data.params = []
  data.objIdToParamIdx = {}

  var message
  var paramIdArrElem
  var currParam
  var paramIdx

  var paramIdxVec = [data.paramIdArr[0]]
  for (
    var i = data.currBank * PAGE_SIZE + 1;
    i < data.paramIdArr.length && paramIdxVec.length <= PAGE_SIZE + 1;
    i++
  ) {
    paramIdxVec.push(data.paramIdArr[i])
  }

  for (var i = 0; i < paramIdxVec.length; i++) {
    paramIdArrElem = paramIdxVec[i]

    paramIdx = data.params.length

    currParam = {
      paramObj: new LiveAPI(valueCallback, 'id ' + paramIdArrElem),
    }
    data.objIdToParamIdx[paramKey(currParam.paramObj)] = paramIdx
    currParam.name = currParam.paramObj.get('name').toString()
    currParam.val = parseFloat(currParam.paramObj.get('value'))
    //debug('CURRPARAMVAL=[' + currParam.val + '] name=' + currParam.name)
    currParam.min = parseFloat(currParam.paramObj.get('min')) || 0
    currParam.max = parseFloat(currParam.paramObj.get('max')) || 1

    message = ['/bparam' + paramIdx, currParam.name]
    sendOsc(message)

    data.params.push(currParam)
    data.params[paramIdx].paramObj.property = 'value'

    sendVal(paramIdx)
  }

  // zero-out the rest of the param sliders
  for (paramIdx = data.params.length; paramIdx < PAGE_SIZE + 1; paramIdx++) {
    sendOsc(['/bparam' + paramIdx, nullString])
    sendOsc(['/bval' + paramIdx, 0])
    sendOsc(['/bvalStr' + paramIdx, '- - -'])
    sendOsc(['/bval' + paramIdx + 'color', 'FF000099'])
  }

  // update the current bank string
  message = ['/bTxtCurrBank', 'Bank ' + (data.currBank + 1)]
  sendOsc(message)
}

function sendVal(paramIdx) {
  if (
    typeof paramIdx !== 'number' ||
    paramIdx < 0 ||
    paramIdx >= PAGE_SIZE + 1
  ) {
    return
  }

  var param = data.params[paramIdx]

  // the value, expressed as a proportion between the param min and max
  var outVal = (param.val - param.min) / (param.max - param.min)

  var message = ['/bval' + paramIdx, outVal]
  sendOsc(message)
  sendOsc(['/bval' + paramIdx + 'color', data.trackColor])
  sendOsc([
    '/bvalStr' + paramIdx,
    param.paramObj.call('str_for_value', param.val),
  ])
}

function valueCallback(args) {
  //debug('VALUE CALLBACK')
  var argsArr = arrayfromargs(args)
  if (argsArr[0] !== 'value') {
    return
  }

  //debug('TOPARGS', argsArr)
  var paramIdx = data.objIdToParamIdx[paramKey(this)]
  if (paramIdx === undefined) {
    //debug(
    //  'no data.objIdToParamIdx for',
    //  paramIdx,
    //  JSON.stringify(data.objIdToParamIdx)
    //)
    return
  }
  if (!data.params[paramIdx]) {
    //debug('no data.params for', paramIdx, JSON.stringify(data.params))
    return
  }

  // ensure the value is indeed changed (vs a feedback loop)
  if (argsArr[1] === data.params[paramIdx].val) {
    //debug(paramIdx, paramIdx.val, 'NO CHANGE')
    return
  }
  data.params[paramIdx].val = argsArr[1]
  sendVal(paramIdx)
}

function receiveVal(matches) {
  var paramIdx = parseInt(matches[1])
  var param = data.params[paramIdx]
  if (param) {
    var value = param.min + parseFloat(matches[2]) * (param.max - param.min)
    param.paramObj.set('value', value)
    sendOsc([
      '/bvalStr' + paramIdx,
      param.paramObj.call('str_for_value', value),
    ])
  }
}

function receiveBank(matches) {
  //debugLog = true
  //debug(matches)
  if (data.paramIdArr.length === 0) {
    return
  }
  var maxBank = Math.floor(data.paramIdArr.length / PAGE_SIZE)
  //debug(data.paramIdArr.length, PAGE_SIZE, maxBank)
  if (matches[1] === 'Next') {
    //debug('NextBank')
    if (data.currBank < maxBank) {
      data.currBank += 1
      refreshParams()
    }
  } else {
    //debug('PrevBank')
    if (data.currBank > 0) {
      data.currBank -= 1
      refreshParams()
    }
  }
  //debugLog = false
}

function oscReceive(args) {
  debug(args)
  var matchers = [
    { regex: /^\/bval(\d+) ([0-9.-]+)$/, fn: receiveVal },
    { regex: /^\/bbank(Prev|Next)$/, fn: receiveBank },
  ]
  for (var i = 0; i < matchers.length; i++) {
    var matches = args.match(matchers[i].regex)
    //debug(JSON.stringify(matches))
    if (matches) {
      return matchers[i].fn(matches)
    }
  }
}

////////////////////////////////////////////////
// UTILITIES
////////////////////////////////////////////////

function debug() {
  if (debugLog) {
    post(
      debug.caller ? debug.caller.name : 'ROOT',
      Array.prototype.slice.call(arguments).join(' '),
      '\n'
    )
  }
}

function sendOsc(message) {
  //debug(message)
  outlet(OUTLET_OSC, message)
}

function dequote(str) {
  return str.replace(/^"|"$/g, '')
}
