// System module — the connection handshake, device-version reply, and the loose
// Max-side passthroughs (loop / refresh / configure) that were the last things
// left in [v8 router]. Folding this into the entry lets [v8 router] be deleted,
// leaving a single [v8 knobbler] + UI + the I/O objects.
//
// Inbound OSC (via the entry dispatcher):
//   /syn        -> /ack <ver> caps, /sendState 1, + deferred full re-push
//   /ping       -> /pong <ver> caps
//   /connect <ip>:<port> -> [s ---CONFIGURE] host/port for the node sender,
//                           then ctx.loopProbe() (knobbler.ts owns /loop)
//   /btnRefresh -> [s ---REFRESH_LOGIC] 'refresh'
//   /initMenu   -> [s ---REFRESH_LOGIC] 'initMenuOnly'
// Inbound Max message (entry top-level fn -> setDeviceVersion):
//   setDeviceVersion <ver> -> /deviceVersion <ver>
//
// clientVersion/clientCapabilities go through utils saveSetting (the shared
// transient named dict) because [k4-oscBatch] — a separate object — reads them
// to decide batching; that cross-object channel is why they aren't in ctx.

import config from './k4-config'
import { logFactory, osc, saveSetting, setOscSink } from './utils'
import { apiId } from './liveApi'
import { noFn, OUTLET_REFRESH, OUTLET_CONFIGURE } from './consts'

const log = logFactory(config)

// Device capabilities advertised back to the app in /ack and /pong replies.
// 'sym' = the /debug/symbolCount poll route (app gates its symbol-graph UI on
// it, so it never polls a build that lacks the route).
// 'scSwap' = the /swapshortcut{N} [m] route (exchange two device-shortcut
// slots). Must be advertised: without it the app's address would fall through
// to the shorter '/swap' prefix and reach the knobbler-slot swap with no slot.
// 'navEd' = the nav panel edit routes: /nav/renameTrack, /nav/colorTrack
// (k4-visibleTracks) and /nav/renameDevice, /nav/colorChain, /nav/moveDevice
// (k4-tracksDevices).
// 'navDel' = /nav/deleteDevice (k4-tracksDevices). Separate from navEd because
// it is destructive: an app build that predates the route must not offer a
// Delete button that silently does nothing.
const REPLY_CAPS =
  ' mxr mkMap swap pos focus b2a prog sym scSwap navEd navDel plugWin'

let deviceVersion = ''
let synRefreshTask: MaxTask = null
let ctx: AppContext = null
// A /connect can arrive before init(ctx) runs (the app handshakes while the
// device is still initializing — "Live API is not initialized"). Defer the
// loop probe to init in that case instead of dereferencing a null ctx.
let pendingLoopProbe = false

// When the app last spoke to us. The app pings every 5s, so an app that has
// been silent for CLIENT_TIMEOUT_MS is gone — background work that only exists
// to serve it (the prefetch sweeps) checks clientAlive() and stops.
const CLIENT_TIMEOUT_MS = 15000
let clientSeenMs = 0

function clientAlive(): boolean {
  return Date.now() - clientSeenMs < CLIENT_TIMEOUT_MS
}

function saveClient(val: string | number) {
  clientSeenMs = Date.now()
  if (!val) {
    return
  }
  const parts = val.toString().split(' ')
  saveSetting('clientVersion', parts[0])
  saveSetting('clientCapabilities', parts.slice(1).join(' '))
}

// Max message from the live.thisdevice version chain ([prepend setDeviceVersion]).
function setDeviceVersion(ver: string) {
  deviceVersion = ver.toString()
  osc('/deviceVersion', deviceVersion)
}

// /syn — the app just connected. Reply, ask it to send its state, then fire a
// deferred full re-push: the modules pushed their state at LOAD (before connect,
// while the OSC-out gate was closed) and it was lost. Deferred so /ack settles.
function synAck(val: string | number) {
  saveClient(val)
  osc('/ack', deviceVersion + REPLY_CAPS)
  // Push /nav/currTrackId immediately after /ack so the app can pre-compute
  // its mixer window and skip rendering the wrong strips. Without this it
  // would arrive at the end of the deferred refresh chain (~seconds later
  // on big sets) while the app sits gated on it. The full re-push fired
  // 150ms later will emit it again via the normal tracksDevices path; that
  // second emit is a no-op for the app (same id).
  const trackId = currTrackId()
  if (trackId !== 0) {
    osc('/nav/currTrackId', trackId)
  }
  osc('/sendState', 1)
  if (!synRefreshTask) {
    // One reusable Task, cancelled + rescheduled — a fresh one per /syn never
    // freed the peer it replaced.
    synRefreshTask = new Task(btnRefresh) as MaxTask
  }
  synRefreshTask.cancel()
  synRefreshTask.schedule(150)
}

// Knobbler's current track id, 0 if it can't be resolved. Goes through
// ctx.focus like every other current-track read (a hardcoded
// 'live_set view selected_track' would report Live's selection even when focus
// is unlocked and pointing elsewhere), and reuses one handle rather than
// building a LiveAPI per /syn.
let trackApi: LiveAPI = null
function currTrackId(): number {
  if (!ctx) {
    return 0
  }
  if (!trackApi) {
    trackApi = new LiveAPI(noFn, 'live_set')
  }
  const tp = ctx.focus.trackPath()
  if (!tp) {
    return 0
  }
  trackApi.path = tp
  return apiId(trackApi)
}

function ping(val: string | number) {
  saveClient(val)
  osc('/pong', deviceVersion + REPLY_CAPS)
}

// /connect <ip>:<port> — configure the node sender's target, then fire the
// feedback-loop probe (knobbler.ts owns the /loop guard).
function connect(val: string | number) {
  const parts = val.toString().split(':')
  if (parts.length === 2) {
    outlet(OUTLET_CONFIGURE, 'host', parts[0])
    outlet(OUTLET_CONFIGURE, 'port', parseInt(parts[1]))
    // ctx may be null if /connect beat init() (device still initializing) —
    // defer the probe to init() rather than crash.
    if (ctx) {
      ctx.loopProbe()
    } else {
      pendingLoopProbe = true
    }
  }
}

function btnRefresh() {
  outlet(OUTLET_REFRESH, 'refresh')
}
function initMenu() {
  outlet(OUTLET_REFRESH, 'initMenuOnly')
}

const routes: Route[] = [
  { prefix: '/syn', parse: 'val', fn: synAck },
  { prefix: '/ping', parse: 'val', fn: ping },
  { prefix: '/connect', parse: 'val', fn: connect },
  { prefix: '/btnRefresh', parse: 'bare', fn: btnRefresh },
  { prefix: '/initMenu', parse: 'bare', fn: initMenu },
]

// Wire this module's own utils instance to the orchestrator's OSC sink so the
// handshake replies (/ack, /pong, /sendState, /deviceVersion) are batched too.
function init(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
  // Run a loop probe that a pre-init /connect had to defer.
  if (pendingLoopProbe) {
    pendingLoopProbe = false
    ctx.loopProbe()
  }
}

log('reloaded k4-system')

export { routes, setDeviceVersion, init, clientAlive }
