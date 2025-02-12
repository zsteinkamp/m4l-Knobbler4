autowatch = 1
inlets = 1
outlets = 1

import { cleanArr, colorToString, logFactory, truncate } from './utils'
import config from './config'
import {
  DEFAULT_COLOR,
  FIELD_ID,
  FIELD_INDENT,
  INLET_MSGS,
  MAX_NAME_LEN,
  OUTLET_OSC,
  TYPE_CHAIN,
  TYPE_DEVICE,
  TYPE_GROUP,
  TYPE_MAIN,
  TYPE_RACK,
  TYPE_RETURN,
  TYPE_TRACK,
  noFn,
} from './consts'

const log = logFactory(config)

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setinletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')

const state = {
  api: null as LiveAPI,

  deviceDepth: {} as Record<number, number>,
  deviceType: {} as Record<number, number>,

  track: {
    watch: null as LiveAPI,
    last: null as string,
    tree: {} as Tree,
  } as ClassObj,
  return: {
    watch: null as LiveAPI,
    last: null as string,
    tree: {} as Tree,
  } as ClassObj,
  main: {
    watch: null as LiveAPI,
    last: null as string,
    tree: {} as Tree,
  } as ClassObj,
  device: {
    watch: null as LiveAPI,
    last: null as string,
  } as ClassObj,
  currDeviceId: null as number,
  currDeviceWatcher: null as LiveAPI,
  currTrackId: null as number,
  currTrackWatcher: null as LiveAPI,
}

// make a tree so we can get depth
const getEmptyTreeNode: () => TreeNode = () => {
  return {
    children: [],
    obj: null,
    parent: null,
  }
}

const makeTrackTree = (type: ObjType, typeNum: number, trackIds: IdArr) => {
  // bootstrap tretrae
  const tree: Tree = {}
  tree['0'] = getEmptyTreeNode()

  // iterate over given IDs, already sorted in the right order
  for (const trackId of trackIds) {
    const trackIdStr = trackId.toString()
    state.api.id = trackId
    //log(trackId + ' PARENT_ID ' + parentId)
    if (!tree[trackIdStr]) {
      tree[trackIdStr] = getEmptyTreeNode()
    }

    const trackInfo = state.api.info.toString()
    const isTrack = trackInfo.indexOf('type Track') > -1
    const isFoldable = isTrack && parseInt(state.api.get('is_foldable'))

    tree[trackIdStr].obj = [
      /* TYPE   */ isFoldable ? TYPE_GROUP : typeNum,
      /* ID     */ trackId,
      /* NAME   */ truncate(state.api.get('name').toString(), MAX_NAME_LEN),
      /* COLOR  */ colorToString(state.api.get('color').toString()),
      /* INDENT */ 0, // temporary indent
    ] as MaxObjRecord

    const parentId = cleanArr(state.api.get('group_track'))[0]
    const parentIdStr = parentId.toString()
    //log('PARENT ID ' + parentId)
    tree[trackIdStr].parent = parentId
    //log('THREE ' + trackId + ' ' + JSON.stringify(tree[trackIdStr]))
    if (!tree[parentIdStr]) {
      tree[parentIdStr] = getEmptyTreeNode()
    }
    tree[parentIdStr].children.push(trackId)
  }
  // now fixup indents
  const fixupIndent = (currId: number, indent: number) => {
    const currIdStr = currId.toString()
    const treeNode = tree[currIdStr]
    //log('fixupIndent TREENODE ' + currIdStr + ' ' + JSON.stringify(treeNode))
    treeNode.obj && (treeNode.obj[FIELD_INDENT] = indent)
    //log('fixupIndent after ' + currIdStr + ' ' + JSON.stringify(treeNode))
    for (const childId of treeNode.children) {
      fixupIndent(childId, indent + 1)
    }
  }

  // start with indent==-1 so that the actual output starts at zero (root node
  // is not actual output)
  fixupIndent(0, -1)
  //log('TREE ' + JSON.stringify(tree))

  return tree
}

//function getDepthForId(trackId: number, tree: Tree) {
//  let parentId = tree[trackId].parent
//  let depth = 0
//  while (parentId > 0) {
//    depth++
//    parentId = tree[parentId].parent
//  }
//  return depth
//}
//
//function getDevicesFor(deviceIds: IdArr) {
//  //log('GET DEVICES FOR ' + deviceIds.join(','))
//  const ret = [] as MaxObjRecord[]
//  const parentColors: Record<number, string> = {}
//  for (const deviceId of deviceIds) {
//    state.api.id = deviceId
//    //log('GET DEVICES FOR type=' + state.api.type)
//    if (state.api.type === 'Song') {
//      // stale/invalid id
//      continue
//    }
//    let color = null
//    if (state.deviceType[deviceId] === TYPE_CHAIN) {
//      color = colorToString(state.api.get('color').toString()) || DEFAULT_COLOR
//    } else {
//      const parentId = cleanArr(state.api.get('canonical_parent'))[0]
//      if (!parentColors[parentId]) {
//        state.api.id = parentId
//        parentColors[parentId] =
//          colorToString(state.api.get('color').toString()) || DEFAULT_COLOR
//        state.api.id = deviceId
//      }
//      color = parentColors[parentId]
//    }
//    const deviceObj = [
//      state.deviceType[deviceId] || TYPE_DEVICE,
//      deviceId,
//      truncate(state.api.get('name').toString(), MAX_NAME_LEN),
//      color,
//      state.deviceDepth[deviceId] || 0,
//    ] as MaxObjRecord
//    ret.push(deviceObj)
//  }
//  //log('END DEVICES FOR ' + deviceIds.join(','))
//  return ret
//}
//
//function checkAndDescend(stateObj: ClassObj, objId: number, depth: number) {
//  if (objId === 0) {
//    //log('Zero ObjId')
//    return
//  }
//  stateObj.ids.push(objId)
//  state.deviceDepth[objId] = depth
//  state.api.id = objId
//  const className = state.api.get('class_display_name').toString()
//  //log('CLASS_NAME: ' + className)
//  let rawReturnChains = []
//  if (className === 'Drum Rack') {
//    rawReturnChains = state.api.get('return_chains')
//    //log(
//    //  '>> RAW RETURN_CHAINS ' +
//    //    className +
//    //    ' ' +
//    //    JSON.stringify(rawReturnChains)
//    //)
//  }
//
//  if (parseInt(state.api.get('can_have_chains'))) {
//    state.deviceType[objId] = TYPE_RACK
//    //log('DESCENDING FROM ' + objId)
//    const chains = cleanArr(state.api.get('chains'))
//    //log('>> GOT CHAINS ' + JSON.stringify(chains))
//    for (const chainId of chains) {
//      stateObj.ids.push(chainId)
//      state.deviceType[chainId] = TYPE_CHAIN
//      state.deviceDepth[chainId] = depth + 1
//
//      state.api.id = chainId
//      const devices = cleanArr(state.api.get('devices'))
//      for (const deviceId of devices) {
//        checkAndDescend(stateObj, deviceId, depth + 2)
//      }
//    }
//
//    const returnChains = cleanArr(rawReturnChains || ([] as IdArr))
//    //log('>> GOT RETURN_CHAINS ' + JSON.stringify(returnChains))
//    for (const returnChainId of returnChains) {
//      stateObj.ids.push(returnChainId)
//      state.deviceType[returnChainId] = TYPE_CHAIN
//      state.deviceDepth[returnChainId] = depth + 1
//
//      state.api.id = returnChainId
//      const devices = cleanArr(state.api.get('devices'))
//      for (const deviceId of devices) {
//        checkAndDescend(stateObj, deviceId, depth + 2)
//      }
//    }
//  }
//}

function updateGenericTrack(type: ObjType, val: IdObserverArg) {
  const stateObj = state[type]
  if (!stateObj) {
    return
  }

  const idArr = cleanArr(val) as IdArr
  let typeNum = TYPE_TRACK
  if (type === 'return') {
    typeNum = TYPE_RETURN
  } else {
    typeNum = TYPE_MAIN
  }
  stateObj.tree = makeTrackTree(type, typeNum, idArr)
}

function updateTracks(val: IdObserverArg) {
  if (val[0] !== 'tracks') {
    //log('TRACKS EARLY')
    return
  }
  //log('HERE TRACKSz ' + JSON.stringify(val))
  updateGenericTrack('track', val)
}

function updateReturns(val: IdObserverArg) {
  //log('HERE RETURNS')
  if (val[0] !== 'return_tracks') {
    //log('RETURNS EARLY')
    return
  }
  updateGenericTrack('return', val)
}

function updateMain(val: IdObserverArg) {
  //log('HERE MAIN ' + val.toString())
  if (val[0] !== 'id') {
    //log('MAIN EARLY')
    return
  }
  updateGenericTrack('main', val)
}

//function updateDevices(val: IdObserverArg) {
//  if (val[0] !== 'devices') {
//    //log('DEVICES EARLY')
//    return
//  }
//  //log('HERE DEVICES ' + JSON.stringify(val))
//  updateGeneric('device', val)
//}

function onCurrDeviceChange(val: IdObserverArg) {
  if (val[0] !== 'id') {
    //log('DEVICE_ID EARLY')
    return
  }
  const newId = cleanArr(val)[0]
  if (state.currDeviceId === newId) {
    return
  }
  state.currDeviceId = newId
  log('NEW CURR DEVICE ID =' + state.currDeviceId)
}

function onCurrTrackChange(val: IdObserverArg) {
  if (val[0] !== 'id') {
    //log('Track_ID EARLY')
    return
  }
  const newId = cleanArr(val)[0]
  if (state.currTrackId === newId) {
    return
  }
  state.currTrackId = newId
  const currTrackIdStr = state.currTrackId.toString()
  log('NEW CURR TRACK ID =' + state.currTrackId)

  const trackTree = state.track.tree
  const returnTree = state.return.tree
  const mainTree = state.main.tree

  const ret = []
  // is the given currTrackId a (return|main) or track?
  if (returnTree[currTrackIdStr] || mainTree[currTrackIdStr]) {
    // return or main
    for (const topLevelTrackId of trackTree['0'].children) {
      // top-level tracks
      ret.push(trackTree[topLevelTrackId.toString()].obj)
    }
  } else if (trackTree[state.currTrackId.toString()]) {
    // currTrackId is a track
    //log('IS TRACK ' + state.currTrackId)

    // child tracks
    for (const childTrackId of trackTree[state.currTrackId.toString()]
      .children) {
      log(' >>> PUSH CHILD ' + childTrackId)
      ret.push(trackTree[childTrackId.toString()].obj)
    }
    // self and siblings
    let parentId = trackTree[state.currTrackId.toString()].parent
    let foundSelf = false
    let unshiftCount = 0
    for (const selfOrSiblingTrackId of trackTree[parentId.toString()]
      .children) {
      const selfOrSiblingObj = trackTree[selfOrSiblingTrackId.toString()].obj
      //log(' >>> SIB OBJ ' + JSON.stringify(selfOrSiblingObj))
      if (foundSelf) {
        ret.push(selfOrSiblingObj)
      } else {
        ret.splice(unshiftCount, 0, selfOrSiblingObj)
        unshiftCount++
      }
      if (selfOrSiblingTrackId === state.currTrackId) {
        foundSelf = true
      }
    }
    // walk up hierarchy to root
    let lastTrackAncestorId = null
    const currentTrackParentId = parentId
    while (parentId) {
      const parentNode = trackTree[parentId.toString()]
      if (parentNode.parent === 0) {
        // got to the top level -- we will add all top-level tracks below
        break
      }
      const parentObj = parentNode.obj
      ret.unshift(parentObj)
      if (parentObj) {
        //log(' >>> PARENT OBJ ' + JSON.stringify(parentObj))
        lastTrackAncestorId = parentId
        parentId = trackTree[parentId.toString()].parent
      }
    }
    // now get top-level tracks
    if (currentTrackParentId) {
      let foundAncestor = false
      unshiftCount = 0
      for (const topLevelTrackId of trackTree['0'].children) {
        const topLevelObj = trackTree[topLevelTrackId.toString()].obj
        if (foundAncestor) {
          ret.push(topLevelObj)
        } else {
          ret.splice(unshiftCount, 0, topLevelObj)
          unshiftCount++
        }
        if (lastTrackAncestorId === topLevelTrackId) {
          foundAncestor = true
        }
      }
    }
  } else {
    log('DERP')
    return
  }
  // returns
  for (const returnTrackId of returnTree[0].children) {
    ret.push(returnTree[returnTrackId.toString()].obj)
  }
  // main
  const mainId = mainTree['0'].children[0]
  ret.push(mainTree[mainId.toString()].obj)

  log('/NAV/TRACKS=' + JSON.stringify(ret))
  outlet(OUTLET_OSC, ['/nav/tracks', JSON.stringify(ret)])
}

function init() {
  //log('TRACKS DEVICES INIT')
  state.deviceDepth = {}
  state.track = { watch: null, tree: {}, last: null }
  state.return = { watch: null, tree: {}, last: null }
  state.main = { watch: null, tree: {}, last: null }
  //state.device = { watch: null, last: null }
  state.deviceType = {}
  state.api = null

  // general purpose API obj to do lookups, etc
  state.api = new LiveAPI(noFn, 'live_set')

  // set up watchers for each type, calls function to assemble and send OSC
  // messages with the type lists when changes
  state.track.watch = new LiveAPI(updateTracks, 'live_set')
  state.track.watch.property = 'tracks'

  state.return.watch = new LiveAPI(updateReturns, 'live_set')
  state.return.watch.property = 'return_tracks'

  state.main.watch = new LiveAPI(updateMain, 'live_set master_track')
  state.main.watch.property = 'id'

  //state.device.watch = new LiveAPI(
  //  updateDevices,
  //  'live_set view selected_track'
  //)
  //state.device.watch.mode = 1 // follow path, not object
  //state.device.watch.property = 'devices'

  state.currTrackWatcher = new LiveAPI(
    onCurrTrackChange,
    'live_set view selected_track'
  )
  state.currTrackWatcher.mode = 1
  state.currTrackWatcher.property = 'id'

  state.currDeviceWatcher = new LiveAPI(
    onCurrDeviceChange,
    'live_set appointed_device'
  )
  state.currDeviceWatcher.mode = 1
  state.currDeviceWatcher.property = 'id'
}

log('reloaded k4-tracksDevices')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
