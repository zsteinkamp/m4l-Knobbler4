// [v8 knobbler] — the consolidated entry node. Receives OSC from [udpreceive]
// and dispatches by prefix to feature-module handlers via direct function calls
// (replacing the old [v8 router]'s outlet fan-out). Feature modules each export
// a `routes` table (the well-defined interface) and an optional `init`.
//
// This is now the only [v8] object: every feature module + the connection
// handshake (k4-system) is folded in, and [v8 router] has been deleted. The
// only siblings left are the UI and the I/O objects ([udpsend]/[udpreceive]/
// [k4-oscBatch]/[k4-discovery]).

import config from './config'
import {
  logFactory,
  setDictPrefix as utilsSetDictPrefix,
  setOscSink,
} from './utils'
import { OUTLET_PAGE } from './consts'
import * as bluhand from './k4-bluhand'
import * as currentParam from './k4-currentParam'
import * as multiMixer from './k4-multiMixer'
import * as sidebarMixer from './k4-sidebarMixer'
import * as clipView from './k4-clipView'
import * as visibleTracks from './k4-visibleTracks'
import * as tracksDevices from './k4-tracksDevices'
import * as KnobblerCore from './knobblerCore'
import * as settings from './k4-settings'
import * as shortcuts from './k4-shortcuts'
import * as system from './k4-system'
import * as oscBatch from './k4-oscBatch'

// Route every module's utils.osc() through the in-process batch buffer (folded
// in from the former [v8 k4-oscBatch]). One registration covers all modules —
// they share this [v8]'s single utils instance. Set before any osc() fires.
setOscSink(oscBatch.send)

autowatch = 1
inlets = 1
// Entry outlet map (see consts): 0 = OSC out, 1 = knobblerCore knob-slot
// bpatcher messages, 2 = shortcut name -> UI, 3 = ---LOOP, 4 = ---REFRESH_LOGIC,
// 5 = ---PAGE, 6 = ---CONFIGURE (udpsend).
outlets = 7

const log = logFactory(config)

// Orchestrator context handed to each module's init(ctx). The entry owns the
// live singletons; modules reach siblings through ctx (not direct imports —
// require() doesn't share module state across files in [v8]).
const ctx: AppContext = {
  knobbler: { bkMap: KnobblerCore.bkMap },
  sidebar: { sidebarMeters: sidebarMixer.sidebarMeters },
  gotoDevice: bluhand.gotoDevice,
  notifyVisibleTracks: function () {
    clipView.visibleTracks()
    multiMixer.visibleTracks()
  },
  settings: { get: settings.get, set: settings.set },
}

// Patcher sends [settingsDictName ---settingsDict( on load (before init) — the
// resolved per-instance dict name. Open it once.
function settingsDictName(name: string) {
  settings.open(name.toString())
}

// Forward the device's dict prefix to the shared utils instance. One call
// serves every folded-in module — require() caches utils within one [v8], so
// the per-module setDictPrefix forwarding hack is gone.
function setDictPrefix(prefix: any) {
  utilsSetDictPrefix(prefix)
}

// The Max UI "Meters" checkbox (chkMeters -> [sidebarMeters $1]) sends this
// Max message to the entry; forward it to the sidebar mixer.
function sidebarMeters(val: number) {
  sidebarMixer.sidebarMeters(val)
}

// Page changes drive meter flushing in both mixer modules AND switch the
// device's page UI (---PAGE), the latter formerly the router's pageHandler.
function pageDispatch(address: string) {
  const pageName = address.split('/')[2]
  multiMixer.page(pageName)
  sidebarMixer.page(pageName)
  outlet(OUTLET_PAGE, 'page', pageName)
}

// Max message from the live.thisdevice version chain ([prepend setDeviceVersion]
// -> entry inlet). Selector matches this top-level fn, so Max calls it directly.
function setDeviceVersion(ver: string) {
  system.setDeviceVersion(ver)
}

// Routes owned by the entry itself (fan-outs that touch multiple modules).
const entryRoutes: Route[] = [
  { prefix: '/page/', parse: 'custom', fn: pageDispatch },
]

// knobblerCore (the former [v8 knobbler4]) — OSC routes.
const knobblerRoutes: Route[] = [
  { prefix: '/val', parse: 'slotVal', fn: KnobblerCore.val, coalesce: true },
  { prefix: '/unmap', parse: 'slot', fn: KnobblerCore.unmap },
  { prefix: '/xyJoin', parse: 'val', fn: KnobblerCore.xyJoin },
  { prefix: '/xySplit', parse: 'val', fn: KnobblerCore.xySplit },
  { prefix: '/defaultval', parse: 'slot', fn: KnobblerCore.setDefault },
  { prefix: '/default val', parse: 'slot', fn: KnobblerCore.setDefault },
  { prefix: '/track', parse: 'slot', fn: KnobblerCore.gotoTrackFor },
  { prefix: '/mkMap', parse: 'slotVal', fn: KnobblerCore.mkMap },
]

// Max-message handlers from the knob-slot bpatchers (UI / persistence params).
// These arrive as selectors on the entry inlet, not OSC.
function setMin(slot: number, val: number) {
  KnobblerCore.setMin(slot, val)
}
function setMax(slot: number, val: number) {
  KnobblerCore.setMax(slot, val)
}
function setPath(slot: number, paramPath: string) {
  KnobblerCore.setPath(slot, paramPath)
}
function setCustomName(slot: number, args: string) {
  KnobblerCore.setCustomName(slot, args)
}
function clearCustomName(slot: number) {
  KnobblerCore.clearCustomName(slot)
}
function clearPath(slot: number) {
  KnobblerCore.clearPath(slot)
}
// Load-chain trigger (was [v8 knobbler4]'s initAll).
function initAll() {
  KnobblerCore.initAll(ctx)
  KnobblerCore.refresh()
}

// --- Route table (merged from every migrated module) -----------------------

const ROUTES: Route[] = [].concat(
  bluhand.routes as any,
  currentParam.routes as any,
  multiMixer.routes as any,
  sidebarMixer.routes as any,
  clipView.routes as any,
  visibleTracks.routes as any,
  shortcuts.routes as any,
  system.routes as any,
  knobblerRoutes as any,
  entryRoutes as any
) as Route[]
ROUTES.sort((a, b) => (a.prefix.length > b.prefix.length ? -1 : 1))

function getSlotNum(prefix: string, address: string): number {
  const matches = address.substring(prefix.length).match(/^\d+/)
  return matches ? parseInt(matches[0]) : null
}

function callRoute(route: Route, address: string, value: any) {
  switch (route.parse) {
    case 'bare':
      return route.fn()
    case 'val':
      return route.fn(value)
    case 'slot':
      return route.fn(getSlotNum(route.prefix, address))
    case 'slotVal':
      return route.fn(getSlotNum(route.prefix, address), value)
    case 'custom':
      return route.fn(address, value)
  }
}

// --- Inbound coalescing (leading-edge, ported from router) -----------------

const COALESCE_MS = 15

type CoalesceEntry = {
  route: Route
  address: string
  val: any
  lastSentTime: number
  task: MaxTask | null
  deferredFn: () => void
}

const coalesceEntries: Record<string, CoalesceEntry> = {}

function makeCoalesceDeferred(entry: CoalesceEntry) {
  return function () {
    entry.task = null
    entry.lastSentTime = Date.now()
    callRoute(entry.route, entry.address, entry.val)
  }
}

function dispatchCoalesced(route: Route, address: string, val: any) {
  const now = Date.now()
  const entry = coalesceEntries[address]

  if (!entry) {
    const e: CoalesceEntry = {
      route: route,
      address: address,
      val: val,
      lastSentTime: now,
      task: null,
      deferredFn: null,
    }
    e.deferredFn = makeCoalesceDeferred(e)
    coalesceEntries[address] = e
    callRoute(route, address, val)
    return
  }

  if (now - entry.lastSentTime >= COALESCE_MS) {
    if (entry.task) {
      entry.task.cancel()
      entry.task.freepeer()
      entry.task = null
    }
    entry.val = val
    entry.lastSentTime = now
    callRoute(route, address, val)
    return
  }

  entry.val = val
  if (!entry.task) {
    const delay = entry.lastSentTime + COALESCE_MS - now
    entry.task = new Task(entry.deferredFn) as MaxTask
    entry.task.schedule(delay)
  }
}

// --- Dispatch core ---------------------------------------------------------

function dispatch(address: string, value: any) {
  for (const route of ROUTES) {
    if (address.indexOf(route.prefix) === 0) {
      if (route.coalesce) {
        return dispatchCoalesced(route, address, value)
      }
      return callRoute(route, address, value)
    }
  }
  // Unmatched: ignore (no router fallback remains — every address the app
  // sends is covered by a route above).
}

function anything(value: any) {
  const address = messagename

  if (address === '/batch') {
    try {
      const batch = JSON.parse(value)
      const keys = Object.keys(batch)
      for (let i = 0; i < keys.length; i++) {
        dispatch(keys[i], batch[keys[i]])
      }
    } catch (e) {
      log('bad inbound /batch: ' + e)
    }
    return
  }

  dispatch(address, value)
}

// --- Lifecycle -------------------------------------------------------------

// Called from live.thisdevice on load and from the ---REFRESH chain. Each
// migrated module's init() is idempotent and re-pushes its state.
function init() {
  bluhand.init(ctx)
  currentParam.init()
  multiMixer.init(ctx)
  sidebarMixer.init(ctx)
  clipView.init()
  visibleTracks.init(ctx)
  tracksDevices.init()
  shortcuts.init(ctx)
  KnobblerCore.initAll(ctx) // idempotent slot setup
  KnobblerCore.refresh() // re-push slot names/values/xy state
}

log('reloaded knobbler')

// NOTE: required boilerplate so tsc emits valid CommonJS for the [v8] object.
const module = {}
export = {}
