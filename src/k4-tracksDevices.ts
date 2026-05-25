import {
  cleanArr,
  colorToString,
  isDeviceSupported,
  logFactory,
  setOscSink,
  osc,
  saveSetting,
  sendChunkedData,
  truncate,
} from './utils'
import config from './k4-config'
import {
  FIELD_INDENT,
  MAX_NAME_LEN,
  TYPE_CHAIN,
  TYPE_CHILD_CHAIN,
  TYPE_DEVICE,
  TYPE_RACK,
  noFn,
} from './consts'

const log = logFactory(config)

let ctx: AppContext = null

const state = {
  api: null as LiveAPI,
  currDeviceId: null as number,
  currDeviceWatcher: null as LiveAPI,
  currTrackId: null as number,
  currTrackWatcher: null as LiveAPI,
}

let deviceChangeDebounce: MaxTask = null

function onCurrDeviceChange(val: IdObserverArg) {
  if (val[0] !== 'id') {
    return
  }
  const newId = cleanArr(val)[0]
  if (state.currDeviceId === newId) {
    return
  }
  state.currDeviceId = newId

  if (deviceChangeDebounce) {
    deviceChangeDebounce.cancel()
  }
  deviceChangeDebounce = new Task(function () {
    updateDeviceNav()
  }) as MaxTask
  deviceChangeDebounce.schedule(40)
}

function updateDeviceNav() {
  //log('DEVICE ID=' + state.currDeviceId + ' TRACKID=' + state.currTrackId)
  if (+state.currDeviceId === 0) {
    // if no device is selected, null out the devices list
    osc('/nav/currDeviceId', -1)
    //log('/nav/devices=' + JSON.stringify([]))
    sendChunkedData('/nav/devices', [])
    return
  }

  //log('NEW CURR DEVICE ID=' + state.currDeviceId)
  osc('/nav/currDeviceId', state.currDeviceId)

  const ret: MaxObjRecord[] = []
  const utilObj = state.api
  utilObj.path = 'live_set'
  const currDeviceObj = new LiveAPI(noFn, 'id ' + state.currDeviceId)
  // Guard: the track/device watchers are independently debounced, so state can
  // be transiently inconsistent during a focus retarget. If the id resolved to
  // a Track/Song instead of a device, skip this pass — the next watcher fire
  // builds the correct tree. Prevents walking parents up to the Song.
  const currType = currDeviceObj.type as string
  if (+currDeviceObj.id === 0 || currType === 'Track' || currType === 'Song') {
    osc('/nav/currDeviceId', -1)
    sendChunkedData('/nav/devices', [])
    return
  }
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
      /* USE INDENT */ 0, // temporary indent
      /* PARENT */ parentObj.id,
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
            /* USE INDENT */ 1, // temporary indent
            /* PARENT */ parentObj.id,
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
              /* USE INDENT */ 1, // temporary indent
              /* PARENT */ parentObj.id,
            ])
          }
        }
      }
    }
  }
  // now add hierarchy, up to when the parent is a track
  let indent = 0
  let watchdog = 0

  while (parentObj.type !== 'Track' && watchdog < 20) {
    // Stop if the chain ran off the end (invalid object / no canonical_parent)
    // rather than dereferencing undefined and crashing.
    if (+parentObj.id === 0) break
    const parentObjParentRaw = cleanArr(parentObj.get('canonical_parent'))[0]
    if (parentObjParentRaw === undefined) break
    const isChain = parentObj.type === 'Chain' || parentObj.type === 'DrumChain'
    let color = null
    if (isChain) {
      color = colorToString(parentObj.get('color').toString())
    } else {
      const grandparentId = cleanArr(parentObj.get('canonical_parent'))[0]
      utilObj.id = grandparentId
      color = colorToString(utilObj.get('color').toString())
    }

    const parentObjParentId = parentObjParentRaw

    ret.unshift([
      /* TYPE   */ isChain ? TYPE_CHAIN : TYPE_RACK,
      /* ID     */ parentObj.id,
      /* NAME   */ truncate(parentObj.get('name').toString(), MAX_NAME_LEN),
      /* COLOR  */ color,
      /* INDENT */ --indent, // temporary indent
      /* USEINDENT */ --indent, // temporary indent
      /* PARENT */ parseInt(parentObjParentId.toString()),
    ])
    // needs to be after
    parentObj.id = parentObjParentId
    //log('CP=' + parentObjParentId)
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
  sendChunkedData('/nav/devices', ret)
}

let trackChangeDebounce: MaxTask = null

function onCurrTrackChange(val: IdObserverArg) {
  if (val[0] !== 'id' && val[1].toString() !== 'id') {
    return
  }
  const newId = cleanArr(val)[0]
  if (state.currTrackId === newId) {
    return
  }
  if (newId === 0) {
    return
  }
  state.currTrackId = newId

  if (trackChangeDebounce) {
    trackChangeDebounce.cancel()
  }
  trackChangeDebounce = new Task(function () {
    osc('/nav/currTrackId', state.currTrackId)

    // Ensure the current (focus) device exists; if the focus track has none yet,
    // adopt its first device. Routed through focus, so it writes Live's
    // selection only when locked — unlocked it just retargets Knobbler.
    const dp = ctx.focus.devicePath()
    state.api.path = dp || 'live_set'
    if (!dp || +state.api.id === 0) {
      state.api.id = state.currTrackId
      const devices = cleanArr(state.api.get('devices'))
      if (devices.length > 0) {
        ctx.focus.selectDevice(parseInt(devices[0] as any))
      }
    }
  }) as MaxTask
  trackChangeDebounce.schedule(40)
}

// Re-point a mode-1 'id' observer at a new canonical path; an empty target
// (focus track with no device) detaches it. Re-setting property re-fires the
// callback, pushing fresh nav state.
function repoint(api: LiveAPI, target: string) {
  if (!api) return
  api.property = ''
  if (target) {
    api.path = target
    api.mode = 1
    api.property = 'id'
  } else {
    api.id = 0
  }
}

// Focus changed: re-point the nav-tree watchers at Knobbler's current
// track/device so the navigation panel shows the right devices/chains. Dormant
// in locked mode (focus doesn't emit) — the watchers path-follow Live there.
function rebindNavHandles() {
  repoint(state.currTrackWatcher, ctx.focus.trackPath())
  repoint(state.currDeviceWatcher, ctx.focus.devicePath())
}

function init(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
  if (!state.api) {
    // One-time setup: reset client info and create the focus-driven observers.
    saveSetting('clientVersion', '')
    saveSetting('clientCapabilities', '')
    state.api = new LiveAPI(noFn, 'live_set')
    state.currTrackWatcher = new LiveAPI(onCurrTrackChange, 'live_set')
    state.currDeviceWatcher = new LiveAPI(onCurrDeviceChange, 'live_set')

    // Point them at the current focus target (fires the callbacks → initial nav
    // push) and re-point on every focus change.
    c.focus.onChange(rebindNavHandles)
    rebindNavHandles()
    return
  }

  // Refresh (e.g. app reconnect): re-push current nav without recreating
  // observers or clobbering the connected client's version/capabilities.
  if (state.currTrackId) {
    osc('/nav/currTrackId', state.currTrackId)
  }
  updateDeviceNav()
}

log('reloaded k4-tracksDevices')

// Observer-driven (no inbound routes); the entry just needs init().
export { init }
