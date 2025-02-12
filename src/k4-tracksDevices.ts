autowatch = 1
inlets = 1
outlets = 1

import { cleanArr, colorToString, logFactory, truncate } from './utils'
import config from './config'
import {
  FIELD_INDENT,
  INLET_MSGS,
  MAX_NAME_LEN,
  OUTLET_OSC,
  TYPE_CHAIN,
  TYPE_CHILD_CHAIN,
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
  // is not included in output)
  fixupIndent(0, -1)
  //log('TREE ' + JSON.stringify(tree))
  return tree
}

function updateGenericTrack(type: ObjType, val: IdObserverArg) {
  const stateObj = state[type]
  if (!stateObj) {
    return
  }

  const idArr = cleanArr(val) as IdArr
  let typeNum = TYPE_TRACK
  if (type === 'return') {
    typeNum = TYPE_RETURN
  } else if (type === 'main') {
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
  if (newId === 0) {
    return
  }
  state.currDeviceId = newId

  //log('NEW CURR DEVICE ID=' + state.currDeviceId)
  outlet(OUTLET_OSC, ['/nav/currDeviceId', state.currDeviceId])

  const ret: MaxObjRecord[] = []
  const utilObj = new LiveAPI(noFn, 'live_set')
  const currDeviceObj = new LiveAPI(noFn, 'id ' + state.currDeviceId)
  const parentObj = new LiveAPI(noFn, currDeviceObj.get('canonical_parent'))
  const parentChildIds = cleanArr(parentObj.get('devices'))

  // first, self and siblings (with chain children under self)
  for (const childDeviceId of parentChildIds) {
    utilObj.id = childDeviceId
    ret.push([
      /* TYPE   */ parseInt(utilObj.get('can_have_chains'))
        ? TYPE_RACK
        : TYPE_DEVICE,
      /* ID     */ childDeviceId,
      /* NAME   */ truncate(utilObj.get('name').toString(), MAX_NAME_LEN),
      /* COLOR  */ colorToString(parentObj.get('color').toString()),
      /* INDENT */ 0, // temporary indent
    ])
    if (childDeviceId === state.currDeviceId) {
      // add child chains below the current item
      if (parseInt(currDeviceObj.get('can_have_chains'))) {
        const chainIds = cleanArr(utilObj.get('chains'))
        for (const chainId of chainIds) {
          utilObj.id = chainId
          ret.push([
            /* TYPE   */ TYPE_CHILD_CHAIN,
            /* ID     */ chainId,
            /* NAME   */ truncate(utilObj.get('name').toString(), MAX_NAME_LEN),
            /* COLOR  */ colorToString(utilObj.get('color').toString()),
            /* INDENT */ 1, // temporary indent
          ])
        }

        if (currDeviceObj.info.toString().match('return_chains')) {
          // drum racks have return chains
          const returnChainIds = cleanArr(currDeviceObj.get('return_chains'))
          for (const chainId of returnChainIds) {
            utilObj.id = chainId
            ret.push([
              /* TYPE   */ TYPE_CHILD_CHAIN,
              /* ID     */ chainId,
              /* NAME   */ truncate(
                utilObj.get('name').toString(),
                MAX_NAME_LEN
              ),
              /* COLOR  */ colorToString(utilObj.get('color').toString()),
              /* INDENT */ 1, // temporary indent
            ])
          }
        }
      }
    }
  }
  // now add hierarchy, up to when the parent is a track
  let indent = 0
  let watchdog = 0
  const grandparentObj = new LiveAPI(noFn, 'live_set')

  while (parentObj.type !== 'Track' && watchdog < 20) {
    const isChain = parentObj.type === 'Chain' || parentObj.type === 'DrumChain'
    let color = null
    if (isChain) {
      color = colorToString(parentObj.get('color').toString())
    } else {
      const grandparentId = cleanArr(parentObj.get('canonical_parent'))[0]
      grandparentObj.id = grandparentId
      color = colorToString(grandparentObj.get('color').toString())
    }
    ret.unshift([
      /* TYPE   */ isChain ? TYPE_CHAIN : TYPE_RACK,
      /* ID     */ parentObj.id,
      /* NAME   */ truncate(parentObj.get('name').toString(), MAX_NAME_LEN),
      /* COLOR  */ color,
      /* INDENT */ --indent, // temporary indent
    ])
    const parentObjParentId = cleanArr(parentObj.get('canonical_parent'))[0]
    //log('CP=' + parentObjParentId)
    parentObj.id = parentObjParentId
    //log('NEWTYPE=' + parentObj.type)
    watchdog++
  }

  // now normalize device indentation ... the first item in the ret[] list needs
  // to become zero, but may be negative
  if (ret.length > 0) {
    const baseIndent = ret[0][FIELD_INDENT]
    for (const maxObj of ret) {
      maxObj[FIELD_INDENT] -= baseIndent
    }
  }

  //log('/nav/devices=' + JSON.stringify(ret))
  outlet(OUTLET_OSC, ['/nav/devices', JSON.stringify(ret)])
}

function onCurrTrackChange(val: IdObserverArg) {
  //log('TRACK CHANGE ' + val)
  if (val[0] !== 'id') {
    //log('Track change EARLY')
    return
  }
  const newId = cleanArr(val)[0]
  //if (state.currTrackId === newId) {
  //  //log('Track change SAME')
  //  return
  //}
  if (newId === 0) {
    log('Track change ZERO')
    return
  }
  state.currTrackId = newId
  const currTrackIdStr = state.currTrackId.toString()

  //log('NEW CURR TRACK ID =' + state.currTrackId)
  outlet(OUTLET_OSC, ['/nav/currTrackId', state.currTrackId])

  const trackTree = state.track.tree
  const returnTree = state.return.tree
  const mainTree = state.main.tree

  const ret: MaxObjRecord[] = []
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
      //log(' >>> PUSH CHILD ' + childTrackId)
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

  //log('/nav/tracks=' + JSON.stringify(ret))
  outlet(OUTLET_OSC, ['/nav/tracks', JSON.stringify(ret)])
}

function init() {
  //log('TRACKS DEVICES INIT')
  state.track = { watch: null, tree: {}, last: null }
  state.return = { watch: null, tree: {}, last: null }
  state.main = { watch: null, tree: {}, last: null }
  //state.device = { watch: null, last: null }
  state.api = null
  state.currDeviceId = null
  state.currDeviceWatcher = null
  state.currTrackId = null
  state.currTrackWatcher = null

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
