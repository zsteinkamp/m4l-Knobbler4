autowatch = 1
inlets = 1
outlets = 1

import { cleanArr, colorToString, logFactory, truncate } from './utils'
import config from './config'
import {
  noFn,
  INLET_MSGS,
  OUTLET_OSC,
  TYPE_CHAIN,
  DEFAULT_COLOR,
  TYPE_RETURN,
  TYPE_MAIN,
  TYPE_DEVICE,
  TYPE_TRACK,
  TYPE_GROUP,
  TYPE_RACK,
} from './consts'

const MAX_LEN = 32

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setinletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')

const state = {
  api: null as LiveAPI,

  periodicTask: null as Task,
  deviceDepth: {} as Record<number, number>,
  deviceType: {} as Record<number, number>,
  trackType: {} as Record<number, number>,

  track: {
    watch: null as LiveAPI,
    ids: [] as IdArr,
    objs: [] as MaxObjRecord[],
    last: null as string,
  } as ClassObj,
  return: {
    watch: null as LiveAPI,
    ids: [] as IdArr,
    objs: [] as MaxObjRecord[],
    last: null as string,
  } as ClassObj,
  main: {
    watch: null as LiveAPI,
    ids: [] as IdArr,
    objs: [] as MaxObjRecord[],
    last: null as string,
  } as ClassObj,
  device: {
    watch: null as LiveAPI,
    ids: [] as IdArr,
    objs: [] as MaxObjRecord[],
    last: null as string,
  } as ClassObj,
}

type TreeNode = {
  children: IdArr
  parent: number
}
type Tree = Record<number, TreeNode>

// make a tree so we can get depth
const getEmptyTreeNode: () => TreeNode = () => ({
  children: [],
  parent: null,
})
function makeTrackTree(trackIds: IdArr) {
  const tree: Tree = {
    0: getEmptyTreeNode(),
  }
  for (const trackId of trackIds) {
    state.api.id = trackId
    const parentId = cleanArr(state.api.get('group_track'))[0]
    //log(trackId + ' PARENT_ID ' + parentId)
    if (!tree[trackId]) {
      tree[trackId] = getEmptyTreeNode()
    }
    tree[trackId].parent = parentId
    if (!tree[parentId]) {
      tree[parentId] = getEmptyTreeNode()
    }
    tree[parentId].children.push(trackId)
  }
  return tree
}

function getDepthForId(trackId: number, tree: Tree) {
  let parentId = tree[trackId].parent
  let depth = 0
  while (parentId > 0) {
    depth++
    parentId = tree[parentId].parent
  }
  return depth
}

function getTracksFor(trackIds: IdArr) {
  const ret = [] as MaxObjRecord[]

  const tree = makeTrackTree(trackIds)
  //log(JSON.stringify(tree))

  for (const trackId of trackIds) {
    state.api.id = trackId
    //const info = state.api.info
    const isTrack = state.api.info.toString().indexOf('type Track') > -1
    //if (isTrack) {
    //  log('INFO FOR TRACK' + info)
    //}
    const isFoldable = isTrack && parseInt(state.api.get('is_foldable'))

    const trackObj = [
      /* TYPE   */ state.trackType[trackId] ||
        (isFoldable ? TYPE_GROUP : TYPE_TRACK),
      /* ID     */ trackId,
      /* NAME   */ truncate(state.api.get('name').toString(), MAX_LEN),
      /* COLOR  */ colorToString(state.api.get('color').toString()),
      /* INDENT */ getDepthForId(trackId, tree),
    ] as MaxObjRecord
    ret.push(trackObj)
  }
  return ret
}

function getDevicesFor(deviceIds: IdArr) {
  //log('GET DEVICES FOR ' + deviceIds.join(','))
  const ret = [] as MaxObjRecord[]
  const parentColors: Record<number, string> = {}
  for (const deviceId of deviceIds) {
    state.api.id = deviceId
    let color = null
    if (state.deviceType[deviceId] === TYPE_CHAIN) {
      color = colorToString(state.api.get('color').toString()) || DEFAULT_COLOR
    } else {
      const parentId = cleanArr(state.api.get('canonical_parent'))[0]
      if (!parentColors[parentId]) {
        state.api.id = parentId
        parentColors[parentId] =
          colorToString(state.api.get('color').toString()) || DEFAULT_COLOR
        state.api.id = deviceId
      }
      color = parentColors[parentId]
    }
    const deviceObj = [
      state.deviceType[deviceId] || TYPE_DEVICE,
      deviceId,
      truncate(state.api.get('name').toString(), MAX_LEN),
      color,
      state.deviceDepth[deviceId] || 0,
    ] as MaxObjRecord
    ret.push(deviceObj)
  }
  //log('END DEVICES FOR ' + deviceIds.join(','))
  return ret
}

function updateTypePeriodic(type: ObjType) {
  const stateObj = state[type]
  if (!stateObj) {
    //log('EARLY UPDATE PERIODIC ' + type)
    return
  }
  const objFn = type === 'device' ? getDevicesFor : getTracksFor
  stateObj.objs = objFn((stateObj.ids || []).slice(0, 128)) // limit
  const strVal = JSON.stringify(stateObj.objs)

  // no change, return
  if (strVal == stateObj.last) {
    //log('NOCHG UPDATE PERIODIC ' + type)
    return
  }

  //log(
  //  type.toUpperCase() +
  //    ': ' +
  //    stateObj.objs.length +
  //    ' : ' +
  //    strVal.length +
  //    ' => ' +
  //    strVal
  //)
  outlet(OUTLET_OSC, '/' + type + 'List', strVal)
  stateObj.last = strVal
}

function checkAndDescend(stateObj: ClassObj, objId: number, depth: number) {
  if (objId === 0) {
    log('Zero ObjId')
    return
  }
  stateObj.ids.push(objId)
  state.deviceDepth[objId] = depth
  state.api.id = objId
  const className = state.api.get('class_display_name').toString()
  //log('CLASS_NAME: ' + className)
  let rawReturnChains = []
  if (className === 'Drum Rack') {
    rawReturnChains = state.api.get('return_chains')
    //log(
    //  '>> RAW RETURN_CHAINS ' +
    //    className +
    //    ' ' +
    //    JSON.stringify(rawReturnChains)
    //)
  }

  if (parseInt(state.api.get('can_have_chains'))) {
    state.deviceType[objId] = TYPE_RACK
    //log('DESCENDING FROM ' + objId)
    const chains = cleanArr(state.api.get('chains'))
    //log('>> GOT CHAINS ' + JSON.stringify(chains))
    for (const chainId of chains) {
      stateObj.ids.push(chainId)
      state.deviceType[chainId] = TYPE_CHAIN
      state.deviceDepth[chainId] = depth + 1

      state.api.id = chainId
      const devices = cleanArr(state.api.get('devices'))
      for (const deviceId of devices) {
        checkAndDescend(stateObj, deviceId, depth + 2)
      }
    }

    const returnChains = cleanArr(rawReturnChains || ([] as IdArr))
    //log('>> GOT RETURN_CHAINS ' + JSON.stringify(returnChains))
    for (const returnChainId of returnChains) {
      stateObj.ids.push(returnChainId)
      state.deviceType[returnChainId] = TYPE_CHAIN
      state.deviceDepth[returnChainId] = depth + 1

      state.api.id = returnChainId
      const devices = cleanArr(state.api.get('devices'))
      for (const deviceId of devices) {
        checkAndDescend(stateObj, deviceId, depth + 2)
      }
    }
  }
}

function getObjs(type: ObjType, val: IdObserverArg) {
  const stateObj = state[type]
  stateObj.ids = []

  const idArr = cleanArr(val) as IdArr
  if (type === 'device') {
    for (const objId of idArr) {
      //log('>>> OBJID ' + objId)
      checkAndDescend(stateObj, objId, 0)
    }
  } else {
    for (const objId of idArr) {
      if (type === 'return') {
        state.trackType[objId] = TYPE_RETURN
      } else if (type === 'main') {
        state.trackType[objId] = TYPE_MAIN
      }
    }
    stateObj.ids = [...idArr]
  }
}

function updateGeneric(type: ObjType, val: IdObserverArg) {
  getObjs(type, val)
  updateTypePeriodic(type)
}

function updateTracks(val: IdObserverArg) {
  //log('HERE TRACKS ' + JSON.stringify(val))
  if (val[0] !== 'tracks') {
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

function updateMain(val: IdObserverArg) {
  //log('HERE MAIN ' + val.toString())
  if (val[0] !== 'id') {
    //log('MAIN EARLY')
    return
  }
  updateGeneric('main', val)
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

  state.deviceDepth = {}
  state.track = { watch: null, ids: [], objs: [], last: null }
  state.return = { watch: null, ids: [], objs: [], last: null }
  state.main = { watch: null, ids: [], objs: [], last: null }
  state.device = { watch: null, ids: [], objs: [], last: null }
  state.deviceType = {}
  state.trackType = {}

  // general purpose API obj to do lookups, etc
  state.api = new LiveAPI(noFn, 'live_set')
  // set up track watcher, calls function to assemble and send tracks when changes

  state.track.watch = new LiveAPI(updateTracks, 'live_set')
  state.track.watch.property = 'tracks'

  state.return.watch = new LiveAPI(updateReturns, 'live_set')
  state.return.watch.property = 'return_tracks'

  state.main.watch = new LiveAPI(updateMain, 'live_set master_track')
  state.main.watch.property = 'id'

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
    for (const type of ['track', 'return', 'main', 'device'] as ObjType[]) {
      updateTypePeriodic(type)
    }
  })
  state.periodicTask.interval = 2000
  state.periodicTask.repeat(-1)
}

log('reloaded k4-tracksDevices')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
