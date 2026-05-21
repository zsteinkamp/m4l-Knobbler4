// [v8 knobbler] — the consolidated entry node. Receives OSC from [udpreceive]
// and dispatches by prefix to feature-module handlers via direct function calls
// (replacing the old [v8 router]'s outlet fan-out). Feature modules each export
// a `routes` table (the well-defined interface) and an optional `init`.
//
// Migration is incremental: this object and the old [v8 router] both sit on
// [udpreceive]. Routes that live here are removed from the router; unmatched
// addresses fall through (the router still handles them) until every module is
// folded in and the router is deleted.

import config from './config'
import { logFactory } from './utils'
import * as bluhand from './k4-bluhand'
import * as currentParam from './k4-currentParam'

autowatch = 1
inlets = 1
// outlet 0 = OSC out (utils.osc), outlet 1 = bkMap -> [s ---KNOBBLER].
// Grows as more modules fold in.
outlets = 2

const log = logFactory(config)

// --- Route table (merged from every migrated module) -----------------------

const ROUTES: Route[] = [].concat(
  bluhand.routes as any,
  currentParam.routes as any
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
  // Unmatched: ignore. During the dual-run migration the old [v8 router]
  // still handles addresses that haven't been folded in here yet.
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
  bluhand.init()
  currentParam.init()
}

log('reloaded knobbler')

// NOTE: required boilerplate so tsc emits valid CommonJS for the [v8] object.
const module = {}
export = {}
