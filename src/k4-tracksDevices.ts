autowatch = 1
inlets = 1
outlets = 2

import {
  cleanArr,
  colorToString,
  isDeviceSupported,
  logFactory,
  truncate,
} from './utils'
import config from './config'
import {
  FIELD_INDENT,
  INLET_MSGS,
  MAX_NAME_LEN,
  OUTLET_MSGS,
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
setoutletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')
setoutletassist(OUTLET_MSGS, 'Messages')

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
  currTrackNameWatcher: null as LiveAPI,
  currTrackColorWatcher: null as LiveAPI,
  ignoreTrackColorNameChanges: true,
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
    if (!trackId) {
      continue
    }
    const trackIdStr = trackId.toString()
    state.api.id = trackId
    //log('TRACK ID ' + trackId)
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
    // same
    return
  }
  state.currDeviceId = newId

  updateDeviceNav()
}

function updateDeviceNav() {
  //log('DEVICE ID=' + state.currDeviceId + ' TRACKID=' + state.currTrackId)
  if (+state.currDeviceId === 0) {
    // if no device is selected, null out the devices list
    outlet(OUTLET_OSC, ['/nav/currDeviceId', -1])
    //log('/nav/devices=' + JSON.stringify([]))
    outlet(OUTLET_OSC, ['/nav/devices', JSON.stringify([])])
    return
  }

  //log('NEW CURR DEVICE ID=' + state.currDeviceId)
  outlet(OUTLET_OSC, ['/nav/currDeviceId', state.currDeviceId])

  const ret: MaxObjRecord[] = []
  const utilObj = new LiveAPI(noFn, 'live_set')
  const currDeviceObj = new LiveAPI(noFn, 'id ' + state.currDeviceId)
  const currIsSupported = isDeviceSupported(currDeviceObj)

  const parentObj = new LiveAPI(
    noFn,
    currIsSupported
      ? currDeviceObj.get('canonical_parent')
      : 'id ' + state.currTrackId
  )
  // handle cases where the device has an incomplete jsliveapi implementation, e.g. CC Control
  const parentChildIds = cleanArr(parentObj.get('devices'))

  // first, self and siblings (with chain children under self)
  for (const childDeviceId of parentChildIds) {
    utilObj.id = childDeviceId
    const objIsSupported = isDeviceSupported(utilObj)
    ret.push([
      /* TYPE   */ objIsSupported && parseInt(utilObj.get('can_have_chains'))
        ? TYPE_RACK
        : TYPE_DEVICE,
      /* ID     */ childDeviceId,
      /* NAME   */ objIsSupported
        ? truncate(utilObj.get('name').toString(), MAX_NAME_LEN)
        : '? Unsupported',
      /* COLOR  */ colorToString(parentObj.get('color').toString()),
      /* INDENT */ 0, // temporary indent
    ])
    if (childDeviceId === state.currDeviceId) {
      // add child chains below the current item
      if (objIsSupported && parseInt(currDeviceObj.get('can_have_chains'))) {
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
  if (val[0] !== 'id' && val[1].toString() !== 'id') {
    //log('Track change EARLY')
    return
  }
  const newId = cleanArr(val)[0]
  if (state.currTrackId === newId) {
    //log('Track change SAME')
    return
  }
  if (newId === 0) {
    //log('Track change ZERO')
    return
  }
  state.currTrackId = newId
  const currTrackIdStr = state.currTrackId.toString()

  // ignore the burst of name/color changes
  state.ignoreTrackColorNameChanges = true
  const t = new Task(() => {
    state.ignoreTrackColorNameChanges = false
  })
  t.schedule(500)

  // color and name watchers
  if (!state.currTrackColorWatcher) {
    state.currTrackColorWatcher = new LiveAPI(
      onCurrTrackColorChange,
      'id ' + state.currTrackId
    )
    state.currTrackColorWatcher.property = 'color'
  } else {
    state.currTrackColorWatcher.id = +currTrackIdStr
  }
  if (!state.currTrackNameWatcher) {
    state.currTrackNameWatcher = new LiveAPI(
      onCurrTrackNameChange,
      'id ' + state.currTrackId
    )
    state.currTrackNameWatcher.property = 'name'
  } else {
    state.currTrackNameWatcher.id = +currTrackIdStr
  }
  updateTrackNav()
}

function updateTrackNav() {
  const currTrackIdStr = state.currTrackId.toString()
  // Rebuild trees on track nav
  const utilObj = new LiveAPI(noFn, 'live_set')
  state.track.tree = makeTrackTree(
    'track',
    TYPE_TRACK,
    cleanArr(utilObj.get('tracks'))
  )

  state.return.tree = makeTrackTree(
    'return',
    TYPE_RETURN,
    cleanArr(utilObj.get('return_tracks'))
  )

  utilObj.path = 'live_set'
  state.main.tree = makeTrackTree(
    'main',
    TYPE_MAIN,
    cleanArr(utilObj.get('master_track'))
  )

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
        //log('ALREADY FOUND SELF id=' + selfOrSiblingTrackId)
        ret.push(selfOrSiblingObj)
      } else {
        //log('SPLICE unshift=' + unshiftCount + ' id=' + selfOrSiblingTrackId)
        ret.splice(unshiftCount, 0, selfOrSiblingObj)
        unshiftCount++
      }
      if (selfOrSiblingTrackId === state.currTrackId) {
        //log('FOUND SELF id=' + selfOrSiblingTrackId)
        foundSelf = true
      }
    }
    //log('CURRENT STATE 1 ' + JSON.stringify(ret))
    // walk up hierarchy to root
    let lastTrackAncestorId = null
    const currentTrackParentId = parentId
    //log('OUTSIDE parentId=' + parentId)
    while (parentId) {
      const parentNode = trackTree[parentId.toString()]
      //log('INSIDE parentNode=' + JSON.stringify(parentNode))
      if (parentNode.parent === 0) {
        // got to the top level -- we will add all top-level tracks below
        //log('INSIDE BREAK')
        lastTrackAncestorId = parentId
        break
      }
      const parentObj = parentNode.obj
      //log('UNSHIFT HERE ' + JSON.stringify(parentObj))
      ret.unshift(parentObj)
      if (parentObj) {
        //log(' >>> PARENT OBJ ' + JSON.stringify(parentObj))
        lastTrackAncestorId = parentId
        parentId = trackTree[parentId.toString()].parent
      }
    }
    //log('CURRENT STATE 2 ' + JSON.stringify(ret))
    // now get top-level tracks
    if (currentTrackParentId) {
      let foundAncestor = false
      unshiftCount = 0
      for (const topLevelTrackId of trackTree['0'].children) {
        const topLevelObj = trackTree[topLevelTrackId.toString()].obj
        if (foundAncestor) {
          ret.push(topLevelObj)
          //log('INSIDE PUSH ' + JSON.stringify(topLevelObj))
        } else {
          ret.splice(unshiftCount, 0, topLevelObj)
          unshiftCount++
          //log('INSIDE SPLICE ' + JSON.stringify(topLevelObj))
        }
        //log(
        //  'INSIDE TEST FOUND ANCESTOR ' +
        //    JSON.stringify({ topLevelTrackId, lastTrackAncestorId })
        //)
        if (lastTrackAncestorId === topLevelTrackId) {
          //log('INSIDE TEST FOUND ANCESTOR TRUE')
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
  //log('NEW CURR TRACK ID =' + state.currTrackId)
  outlet(OUTLET_OSC, ['/nav/currTrackId', state.currTrackId])

  // ensure a device is selected if one exists
  utilObj.path = 'live_set view selected_track view selected_device'
  //log('HERE ' + utilObj.id)
  if (+utilObj.id === 0) {
    utilObj.path = 'live_set view selected_track'
    //log('TACKNAME ' + utilObj.get('name'))
    const devices = cleanArr(utilObj.get('devices'))
    //log('DEVICES ' + devices)
    if (devices.length > 0) {
      utilObj.path = 'live_set view'
      utilObj.call('select_device', 'id ' + devices[0])
    }
  }
}

function refreshNav() {
  updateTrackNav()
  updateDeviceNav()
}

function onCurrTrackColorChange(args: IArguments) {
  if (state.ignoreTrackColorNameChanges) {
    return
  }
  if (args[0] !== 'color') {
    return
  }
  //log('CURR TRACK COLOR CHANGE ' + args)
  refreshNav()
}
function onCurrTrackNameChange(args: IArguments) {
  if (state.ignoreTrackColorNameChanges) {
    return
  }
  if (args[0] !== 'name') {
    return
  }
  //log('CURR TRACK NAME CHANGE ' + args)
  updateTrackNav()
}

function init() {
  //log('TRACKS DEVICES INIT')
  state.track = { watch: null, tree: {}, last: null }
  state.return = { watch: null, tree: {}, last: null }
  state.main = { watch: null, tree: {}, last: null }
  //state.device = { watch: null, last: null }
  state.currDeviceId = null
  state.currTrackId = null

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

  state.currTrackColorWatcher = null
  state.currTrackNameWatcher = null

  state.currTrackWatcher = new LiveAPI(
    onCurrTrackChange,
    'live_set view selected_track'
  )
  state.currTrackWatcher.mode = 1
  state.currTrackWatcher.property = 'id'

  state.currDeviceWatcher = new LiveAPI(
    onCurrDeviceChange,
    'live_set view selected_track view selected_device'
  )
  state.currDeviceWatcher.mode = 1
  state.currDeviceWatcher.property = 'id'
}

log('reloaded k4-tracksDevices')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
