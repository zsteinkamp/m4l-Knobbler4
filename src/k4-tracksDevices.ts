import {
  cleanArr,
  colorToString,
  isDeviceSupported,
  logFactory,
  parseIdValue,
  setOscSink,
  osc,
  saveSetting,
  truncate,
} from './utils'
import { apiId, apiValid, repointPath } from './liveApi'
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
  currDeviceId: 0 as number,
  currDeviceWatcher: null as LiveAPI,
  currTrackId: 0 as number,
  currTrackWatcher: null as LiveAPI,
  // Non-observing handles reused by every nav rebuild. They used to be
  // `new LiveAPI(noFn, 'id ' + id)` per call — a fresh object AND a permanent
  // interned symbol per distinct device, on every device change.
  currDeviceApi: null as LiveAPI,
  parentApi: null as LiveAPI,
}

// One reusable Task per debounce, cancelled and rescheduled. Allocating a Task
// per event (the old shape) never freepeer()s the one it replaces.
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

  if (!deviceChangeDebounce) {
    deviceChangeDebounce = new Task(updateDeviceNav) as MaxTask
  }
  deviceChangeDebounce.cancel()
  deviceChangeDebounce.schedule(40)
}

// Only Track/Chain objects have a `devices` list — Song/Device do not. Observer
// timing on device add can transiently resolve a focus path to the Song (e.g.
// `live_set view selected_track` before Live finishes wiring up `view`, which
// collapses to its valid prefix `live_set`), so guard every devices read by the
// resolved object's type rather than trusting the path. The next watcher fire
// rebuilds with the correct target. Prevents "'Song' object has no attribute
// 'devices'" on initial load.
const HAS_DEVICES: Record<string, 1> = { Track: 1, Chain: 1, DrumChain: 1 }
function devicesOf(api: LiveAPI): any[] {
  return HAS_DEVICES[api.type as string] ? cleanArr(api.get('devices')) : []
}

function updateDeviceNav() {
  //log('DEVICE ID=' + state.currDeviceId + ' TRACKID=' + state.currTrackId)
  if (+state.currDeviceId === 0) {
    // if no device is selected, null out the devices list
    osc('/nav/currDeviceId', -1)
    //log('/nav/devices=' + JSON.stringify([]))
    osc('/nav/devices', [])
    return
  }

  //log('NEW CURR DEVICE ID=' + state.currDeviceId)
  osc('/nav/currDeviceId', state.currDeviceId)

  const ret: MaxObjRecord[] = []
  const utilObj = state.api
  utilObj.path = 'live_set'
  const currDeviceObj = state.currDeviceApi
  currDeviceObj.id = state.currDeviceId
  // Guard: the track/device watchers are independently debounced, so state can
  // be transiently inconsistent during a focus retarget. If the id resolved to
  // a Track/Song instead of a device, skip this pass — the next watcher fire
  // builds the correct tree. Prevents walking parents up to the Song.
  const currType = currDeviceObj.type as string
  if (!apiValid(currDeviceObj) || currType === 'Track' || currType === 'Song') {
    osc('/nav/currDeviceId', -1)
    osc('/nav/devices', [])
    return
  }
  const currIsSupported = isDeviceSupported(currDeviceObj)

  const parentObj = state.parentApi
  parentObj.id = currIsSupported
    ? cleanArr(currDeviceObj.get('canonical_parent'))[0] || 0
    : state.currTrackId
  // handle cases where the device has an incomplete jsliveapi implementation, e.g. CC Control
  const parentChildIds = devicesOf(parentObj)
  const parentId = apiId(parentObj)
  // Device rows are drawn in this parent's color; rebuild when it changes.
  watchParentColor(parentId)

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
      /* PARENT */ parentId,
      // Live's Device.type: 1 instrument, 2 audio effect, 4 MIDI effect (0 when
      // unknown). The app keeps a dragged device among its own kind.
      /* DEVICE TYPE */ objIsSupported ? parseInt(utilObj.get('type')) : 0,
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
            /* PARENT */ parentId,
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
              /* PARENT */ parentId,
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
    if (!apiValid(parentObj)) break
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
      /* ID     */ apiId(parentObj),
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
  osc('/nav/devices', ret)
}

let trackChangeDebounce: MaxTask = null

function onCurrTrackChange(val: IdObserverArg) {
  // Property name is at args[0]. The old `&& val[1].toString() !== 'id'` half
  // was a leftover from [js], which used to deliver observer args REVERSED —
  // see the same fix in k4-sidebarMixer.onTrackChange.
  if (val[0] !== 'id') {
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

  if (!trackChangeDebounce) {
    trackChangeDebounce = new Task(pushCurrTrack) as MaxTask
  }
  trackChangeDebounce.cancel()
  trackChangeDebounce.schedule(40)
}

function pushCurrTrack() {
  osc('/nav/currTrackId', state.currTrackId)

  // Ensure the current (focus) device exists; if the focus track has none yet,
  // adopt its first device. Routed through focus, so it writes Live's
  // selection only when locked — unlocked it just retargets Knobbler.
  const dp = ctx.focus.devicePath()
  state.api.path = dp || 'live_set'
  if (!dp || !apiValid(state.api)) {
    state.api.id = state.currTrackId
    const devices = devicesOf(state.api)
    if (devices.length > 0) {
      ctx.focus.selectDevice(parseInt(devices[0] as any))
    }
  }
}

// Focus changed: re-point the nav-tree watchers at Knobbler's current
// track/device so the navigation panel shows the right devices/chains. Dormant
// in locked mode (focus doesn't emit) — the watchers path-follow Live there.
function rebindNavHandles() {
  repointPath(state.currTrackWatcher, ctx.focus.trackPath(), 'id')
  repointPath(state.currDeviceWatcher, ctx.focus.devicePath(), 'id')
}

// ---------------------------------------------------------------------------
// Nav panel edits
// ---------------------------------------------------------------------------
// None of these changes the selected device's id, the only thing the nav
// watchers observe, so each rebuilds the nav tree itself once Live settles.

let navRefreshTask: MaxTask = null

function scheduleNavRefresh() {
  if (!navRefreshTask) {
    navRefreshTask = new Task(updateDeviceNav) as MaxTask
  }
  navRefreshTask.cancel()
  navRefreshTask.schedule(40)
}

// Device rows are drawn in their parent's color (the track, or the chain they
// sit in), and nothing else rebuilds the tree when that color changes, whether
// from /nav/colorTrack or in Live. One pooled observer follows the current
// parent: re-pointed by id on each rebuild, never recreated (observer churn
// leaks; see CLAUDE.md). Re-arming fires the callback with the current value,
// which is not a change, so that callback is ignored.
let parentColorApi: LiveAPI = null
let parentColorId = 0
let parentColorRearming = false

function onParentColor(args: any[]) {
  if (parentColorRearming || args[0] !== 'color') return
  scheduleNavRefresh()
}

function watchParentColor(id: number) {
  if (!id || id === parentColorId) return
  parentColorId = id
  parentColorRearming = true
  if (!parentColorApi) {
    parentColorApi = new LiveAPI(onParentColor, 'live_set')
  }
  parentColorApi.property = ''
  parentColorApi.id = id
  parentColorApi.property = 'color'
  parentColorRearming = false
}

const CHAIN_TYPES: Record<string, 1> = { Chain: 1, DrumChain: 1 }

// Point state.api at a LOM id; false if the object no longer exists.
function pointAt(id: number): boolean {
  state.api.id = id
  return apiValid(state.api)
}

// /nav/renameDevice '[id, name]' — a device or a chain; both have a settable name.
function renameDevice(jsonStr: string) {
  const edit = parseIdValue(jsonStr)
  if (!edit || !pointAt(edit.id)) return
  const type = state.api.type as string
  if (
    !CHAIN_TYPES[type] &&
    (HAS_DEVICES[type] || !isDeviceSupported(state.api))
  ) {
    return
  }
  state.api.set('name', edit.value.toString())
  scheduleNavRefresh()
}

// /nav/colorChain '[chainId, "RRGGBB"]' — Live snaps to its nearest chooser color.
function colorChain(jsonStr: string) {
  const edit = parseIdValue(jsonStr)
  if (!edit || !pointAt(edit.id) || !CHAIN_TYPES[state.api.type as string]) {
    return
  }
  state.api.set('color', parseInt(edit.value.toString(), 16))
  scheduleNavRefresh()
}

// Where `deviceId` sits in its parent's device list, or -1. Both moveDevice and
// deleteDevice address a device by its index within the owning chain, not by id.
function indexInParent(siblingIds: any[], deviceId: number): number {
  for (let i = 0; i < siblingIds.length; i++) {
    if (parseInt(siblingIds[i] as any) === deviceId) {
      return i
    }
  }
  return -1
}

// The Knobbler instance this code is running inside. Deleting it would tear the
// [v8] object down mid-call and take the app's connection with it, so
// deleteDevice refuses it. Note this is only THIS instance: another Knobbler on
// the set is an ordinary device here, and deleting it is the user's call (it
// drops that instance's own connection, not ours).
let thisDeviceApi: LiveAPI = null
function isSelf(deviceId: number): boolean {
  if (!thisDeviceApi) {
    thisDeviceApi = new LiveAPI(noFn, 'this_device')
  }
  const selfId = apiId(thisDeviceApi)
  return selfId !== 0 && selfId === deviceId
}

// /nav/deleteDevice <id> — a BARE numeric LOM id, unlike the '[id, value]' JSON
// the rename/color/move routes take (there is no second value to carry).
// Devices and racks only.
//
// Live deletes by index within the owning chain, so this resolves the device's
// canonical_parent (a Track or a Chain) and its position there, exactly as
// moveDevice does. If the deleted device was the focused one, Live moves the
// selection itself and the focus observers re-push /nav/currDeviceId.
function deleteDevice(val: any) {
  const id = parseInt(String(val))
  if (isNaN(id) || id === 0) {
    return
  }
  if (isSelf(id)) {
    log('refusing to delete Knobbler itself')
    return
  }
  if (!pointAt(id)) {
    return
  }
  // Tracks and chains answer isDeviceSupported too (they have properties), so
  // exclude the container types explicitly rather than relying on that check.
  const type = state.api.type as string
  if (HAS_DEVICES[type] || !isDeviceSupported(state.api)) {
    return
  }
  const parentId = cleanArr(state.api.get('canonical_parent'))[0]
  if (!parentId) {
    return
  }
  state.api.id = parentId
  const index = indexInParent(devicesOf(state.api), id)
  if (index < 0) {
    return
  }
  state.api.call('delete_device', index)
  scheduleNavRefresh()
}

// /nav/moveDevice '[deviceId, index]' — reorder within the device's own chain
// (the nav panel only offers siblings). `index` is where the device should END
// UP. Song.move_device counts its position in the chain as it is BEFORE the
// device is removed, so a move down has to ask for one slot further: in
// 0 1 2 3 4, putting 2 after 4 (final index 4) takes position 5 — asking for 4
// lands it before 4. Moves up are the same either way. Live also takes the
// nearest legal position when the requested one isn't allowed, e.g. a MIDI
// effect after an instrument; the refresh shows where it really landed.
function moveDevice(jsonStr: string) {
  const edit = parseIdValue(jsonStr)
  if (!edit || !pointAt(edit.id) || !isDeviceSupported(state.api)) return
  const parentId = cleanArr(state.api.get('canonical_parent'))[0]
  const index = parseInt(edit.value.toString())
  if (!parentId || isNaN(index) || index < 0) return

  state.api.id = parentId
  const current = indexInParent(devicesOf(state.api), edit.id)
  const position = current > -1 && index > current ? index + 1 : index

  state.api.path = 'live_set'
  ;(state.api as any).call('move_device', [
    'id',
    edit.id,
    'id',
    parentId,
    position,
  ])
  scheduleNavRefresh()
}

function init(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
  if (!state.api) {
    // One-time setup: reset client info and create the focus-driven observers.
    saveSetting('clientVersion', '')
    saveSetting('clientCapabilities', '')
    state.api = new LiveAPI(noFn, 'live_set')
    state.currDeviceApi = new LiveAPI(noFn, 'live_set')
    state.parentApi = new LiveAPI(noFn, 'live_set')
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

const routes: Route[] = [
  { prefix: '/nav/renameDevice', parse: 'val', fn: renameDevice },
  { prefix: '/nav/colorChain', parse: 'val', fn: colorChain },
  { prefix: '/nav/moveDevice', parse: 'val', fn: moveDevice },
  { prefix: '/nav/deleteDevice', parse: 'val', fn: deleteDevice },
]

export { routes, init }
