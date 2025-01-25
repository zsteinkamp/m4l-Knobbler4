autowatch = 1
inlets = 1
outlets = 1

import { colorToString, logFactory, truncate } from './utils'
import config from './config'
import { noFn, INLET_MSGS, OUTLET_OSC } from './consts'

const MAX_LEN = 32

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setinletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')

//            id,     name    color
type Track = [number, string, string]

//            id,     name     type
type Device = [number, string, string]

type IdObserverArg = (number | string)[]
type IdArr = number[]
type ListClass = 'track' | 'return' | 'device'

type ClassObj = {
  watch: LiveAPI
  ids: IdArr
  objs: (Track | Device)[]
  last: string
}

const state = {
  api: null as LiveAPI,

  periodicTask: null as Task,

  track: {
    watch: null as LiveAPI,
    ids: [] as IdArr,
    objs: [] as Track[],
    last: null as string,
  } as ClassObj,
  return: {
    watch: null as LiveAPI,
    ids: [] as IdArr,
    objs: [] as Track[],
    last: null as string,
  } as ClassObj,
  device: {
    watch: null as LiveAPI,
    ids: [] as IdArr,
    objs: [] as Device[],
    last: null as string,
  } as ClassObj,
}

function cleanArr(arr: IdObserverArg) {
  return arr.filter((e: any) => {
    return parseInt(e).toString() === e.toString()
  })
}

function getTracksFor(trackIds: IdArr) {
  //log('HERE: ' + JSON.stringify(val))
  const ret = [] as Track[]
  for (const trackId of trackIds) {
    state.api.id = trackId
    const trackObj = [
      trackId,
      truncate(state.api.get('name').toString(), MAX_LEN),
      colorToString(state.api.get('color').toString()),
    ] as Track
    ret.push(trackObj)
  }
  return ret
}

function getDevicesFor(deviceIds: IdArr) {
  const ret = [] as Device[]
  for (const deviceId of deviceIds) {
    state.api.id = deviceId
    const deviceObj = [
      deviceId,
      truncate(state.api.get('name').toString(), MAX_LEN),
      state.api.get('class_display_name').toString(),
    ] as Device
    ret.push(deviceObj)
  }
  return ret
}

function updateTypePeriodic(type: ListClass) {
  const stateObj = state[type]
  const objFn = type === 'device' ? getDevicesFor : getTracksFor
  stateObj.objs = objFn(stateObj.ids.slice(0, 200)) // limit 200 returns
  const strVal = JSON.stringify(stateObj.objs)

  // no change, return
  if (strVal == stateObj.last) {
    return
  }

  //log(type.toUpperCase() + ': ' + strVal)
  outlet(OUTLET_OSC, '/' + type + 'List', strVal)
  stateObj.last = strVal
}

function updateGeneric(type: ListClass, val: IdObserverArg) {
  const stateObj = state[type]
  stateObj.ids = cleanArr(val) as IdArr
  updateTypePeriodic(type)
}

function updateTracks(val: IdObserverArg) {
  //log('HERE TRACKS ' + JSON.stringify(val))
  if (val[0] !== 'visible_tracks') {
    //log('TRACKS EARLY')
    return
  }
  updateGeneric('track', val)
}

function updateReturns(val: IdObserverArg) {
  //log('HERE RETURNS')
  if (val[0] !== 'return_tracks') {
    //log('RETURNS EARLY')
    return
  }
  updateGeneric('return', val)
}

function updateDevices(val: IdObserverArg) {
  //log('HERE DEVICES')
  if (val[0] !== 'devices') {
    //log('DEVICES EARLY')
    return
  }
  updateGeneric('device', val)
}

function init() {
  //log('INIT')

  state.track = { watch: null, ids: [], objs: [], last: null }
  state.return = { watch: null, ids: [], objs: [], last: null }
  state.device = { watch: null, ids: [], objs: [], last: null }

  // general purpose API obj to do lookups, etc
  state.api = new LiveAPI(noFn, 'live_set')
  // set up track watcher, calls function to assemble and send tracks when changes

  state.track.watch = new LiveAPI(updateTracks, 'live_set')
  state.track.watch.property = 'visible_tracks'

  state.return.watch = new LiveAPI(updateReturns, 'live_set')
  state.return.watch.property = 'return_tracks'

  state.device.watch = new LiveAPI(
    updateDevices,
    'live_set view selected_track'
  )
  state.device.watch.mode = 1 // follow path, not object
  state.device.watch.property = 'devices'

  if (state.periodicTask) {
    state.periodicTask.cancel()
  }

  // just poll for name/color changes rather than attaching potentially many
  // hundreds of property listeners
  state.periodicTask = new Task(() => {
    //log('TOP TASK')
    for (const type of ['track', 'return', 'device'] as ListClass[]) {
      updateTypePeriodic(type)
    }
  })
  state.periodicTask.interval = 1000
  state.periodicTask.repeat(-1)
}

log('reloaded k4-tracksDevices')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
