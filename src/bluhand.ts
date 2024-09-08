////////////////////////////////////////////////
// M4L Config
////////////////////////////////////////////////

autowatch = 1
outlets = 1

const BH_OUTLET_OSC = 0
const PAGE_SIZE = 16 // "Device On" is always the first

setoutletassist(BH_OUTLET_OSC, 'OSC Messages')

////////////////////////////////////////////////
// VARIABLES
////////////////////////////////////////////////

const bhDebugLog = true

type DataType = {
  currBank: number
  paramIdArr: number[]
  trackName: string
  trackColor: string
  deviceName: string
  params: any[]
  debouncers: Record<string, Task>
  observers: {
    trackName: LiveAPI
    deviceName: LiveAPI
    params: LiveAPI
  }
  objIdToParamIdx: any
}

const data: DataType = {
  currBank: 0,
  paramIdArr: [],
  trackName: null,
  trackColor: null,
  deviceName: null,
  params: [],
  debouncers: {},
  observers: {
    trackName: null,
    deviceName: null,
    params: null,
  },
  objIdToParamIdx: {},
}
const lomParamsArr = []
const bhNullString = '- - -'

bhDebug('reloaded')

////////////////////////////////////////////////
// EXTERNAL METHODS
////////////////////////////////////////////////

function bang() {
  setupListener()
}

////////////////////////////////////////////////
// INTERNAL METHODS
////////////////////////////////////////////////

function debounce(id: string, future: () => void) {
  if (data.debouncers[id]) {
    data.debouncers[id].cancel()
  }
  data.debouncers[id] = new Task(future)
  data.debouncers[id].schedule(300)
}

function setupListener() {
  //bhDebug('SETUP LISTENERS')

  // TRACK NAME
  data.observers.trackName = new LiveAPI(
    bh_trackNameCallback,
    'live_set view selected_track'
  )
  data.observers.trackName.mode = 1
  data.observers.trackName.property = 'name'

  // DEVICE NAME
  data.observers.deviceName = new LiveAPI(
    bh_deviceNameCallback,
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

function bhColorToString(colorVal: string) {
  let retString = parseInt(colorVal).toString(16).toUpperCase()
  const strlen = retString.length
  for (let i = 0; i < 6 - strlen; i++) {
    retString = '0' + retString
  }
  return retString + 'FF'
}

function bh_trackNameCallback(iargs: IArguments) {
  //bhDebug('TRACK ID', parseInt(this.id))
  //bhDebug(args)
  const args = arrayfromargs(iargs)
  if (args.shift() !== 'name') {
    return
  }
  data.trackName = args[0]
  data.trackColor = bhColorToString(this.get('color').toString())
  //bhDebug('TRACKCOLOR', data.trackColor)
  updateDeviceName()
}

function bh_deviceNameCallback(iargs: IArguments) {
  const args = arrayfromargs(iargs)
  if (args.shift() !== 'name') {
    return
  }
  if (parseInt(this.id) === 0) {
    data.deviceName = 'none'
  } else {
    data.deviceName = args.shift()
  }
  updateDeviceName()
}

function updateDeviceName() {
  debounce('deviceName', function () {
    let message = ['/bcurrDeviceName', data.trackName + ' > ' + data.deviceName]
    if (!(data.trackName && data.deviceName)) {
      message = ['/bcurrDeviceName', 'No device selected']
    }
    sendOsc(message)
  })
}

function paramKey(paramObj: LiveAPI) {
  const key = paramObj.id.toString()
  //bhDebug(key)
  return key
}

function parametersCallback(iargs: IArguments) {
  const args = arrayfromargs(iargs)
  if (args.shift() !== 'parameters') {
    return
  }
  data.paramIdArr = args.filter(function (p: string) {
    return p !== 'id'
  })
  data.currBank = 0

  //bhDebugLog = true
  //bhDebug(data.paramIdArr.join(','))
  //bhDebugLog = false

  debounce('params', refreshParams)
}

function refreshParams() {
  data.params = []
  data.objIdToParamIdx = {}

  let message
  let paramIdArrElem
  let currParam
  let paramIdx

  const paramIdxVec = [data.paramIdArr[0]]
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
      name: null,
      val: null,
      min: null,
      max: null,
    }
    data.objIdToParamIdx[paramKey(currParam.paramObj)] = paramIdx
    currParam.name = currParam.paramObj.get('name').toString()
    currParam.val = parseFloat(currParam.paramObj.get('value'))
    //bhDebug('CURRPARAMVAL=[' + currParam.val + '] name=' + currParam.name)
    currParam.min = parseFloat(currParam.paramObj.get('min')) || 0
    currParam.max = parseFloat(currParam.paramObj.get('max')) || 1

    message = ['/bparam' + paramIdx, currParam.name]
    sendOsc(message)

    data.params.push(currParam)
    data.params[paramIdx].paramObj.property = 'value'

    bhSendVal(paramIdx)
  }

  // zero-out the rest of the param sliders
  for (paramIdx = data.params.length; paramIdx < PAGE_SIZE + 1; paramIdx++) {
    sendOsc(['/bparam' + paramIdx, bhNullString])
    sendOsc(['/bval' + paramIdx, 0])
    sendOsc(['/bvalStr' + paramIdx, bhNullString])
    sendOsc(['/bval' + paramIdx + 'color', 'FF000099'])
  }

  // update the current bank string
  message = ['/bTxtCurrBank', 'Bank ' + (data.currBank + 1)]
  sendOsc(message)
}

function bhSendVal(paramIdx: number) {
  if (
    typeof paramIdx !== 'number' ||
    paramIdx < 0 ||
    paramIdx >= PAGE_SIZE + 1
  ) {
    return
  }

  const param = data.params[paramIdx]

  // the value, expressed as a proportion between the param min and max
  const outVal = (param.val - param.min) / (param.max - param.min)

  const message = ['/bval' + paramIdx, outVal]
  sendOsc(message)
  sendOsc(['/bval' + paramIdx + 'color', data.trackColor])
  sendOsc([
    '/bvalStr' + paramIdx,
    param.paramObj.call('str_for_value', param.val),
  ])
}

function valueCallback(iargs: IArguments) {
  //bhDebug('VALUE CALLBACK')
  const args = arrayfromargs(iargs)
  if (args.shift() !== 'value') {
    return
  }

  //bhDebug('TOPARGS', args)
  const paramIdx = data.objIdToParamIdx[paramKey(this)]
  if (paramIdx === undefined) {
    //bhDebug(
    //  'no data.objIdToParamIdx for',
    //  paramIdx,
    //  JSON.stringify(data.objIdToParamIdx)
    //)
    return
  }
  if (!data.params[paramIdx]) {
    //bhDebug('no data.params for', paramIdx, JSON.stringify(data.params))
    return
  }
  const argsVal = args.shift()

  // ensure the value is indeed changed (vs a feedback loop)
  if (argsVal === data.params[paramIdx].val) {
    //bhDebug(paramIdx, paramIdx.val, 'NO CHANGE')
    return
  }
  data.params[paramIdx].val = argsVal
  bhSendVal(paramIdx)
}

function receiveVal(matches: RegExpMatchArray) {
  const paramIdx = parseInt(matches[1])
  const param = data.params[paramIdx]
  if (param) {
    const value = param.min + parseFloat(matches[2]) * (param.max - param.min)
    param.paramObj.set('value', value)
    sendOsc([
      '/bvalStr' + paramIdx,
      param.paramObj.call('str_for_value', value),
    ])
  }
}

function receiveBank(matches: RegExpMatchArray) {
  //bhDebugLog = true
  //bhDebug(matches)
  if (data.paramIdArr.length === 0) {
    return
  }
  const maxBank = Math.floor(data.paramIdArr.length / PAGE_SIZE)
  //bhDebug(data.paramIdArr.length, PAGE_SIZE, maxBank)
  if (matches[1] === 'Next') {
    //bhDebug('NextBank')
    if (data.currBank < maxBank) {
      data.currBank += 1
      refreshParams()
    }
  } else {
    //bhDebug('PrevBank')
    if (data.currBank > 0) {
      data.currBank -= 1
      refreshParams()
    }
  }
  //bhDebugLog = false
}

function oscReceive(args: string) {
  bhDebug(args)
  const matchers = [
    { regex: /^\/bval(\d+) ([0-9.-]+)$/, fn: receiveVal },
    { regex: /^\/bbank(Prev|Next)$/, fn: receiveBank },
  ]
  for (let i = 0; i < matchers.length; i++) {
    const matches = args.match(matchers[i].regex)
    //bhDebug(JSON.stringify(matches))
    if (matches) {
      return matchers[i].fn(matches)
    }
  }
}

////////////////////////////////////////////////
// UTILITIES
////////////////////////////////////////////////

function bhDebug(_: any) {
  if (bhDebugLog) {
    post(
      bhDebug.caller ? bhDebug.caller.name : 'ROOT',
      Array.prototype.slice.call(arguments).join(' '),
      '\n'
    )
  }
}

function sendOsc(message: string | (string | number)[]) {
  //bhDebug(message)
  outlet(BH_OUTLET_OSC, message)
}
