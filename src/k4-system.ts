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
import { noFn, OUTLET_REFRESH, OUTLET_CONFIGURE } from './consts'

const log = logFactory(config)

// Device capabilities advertised back to the app in /ack and /pong replies.
const REPLY_CAPS = ' mxr mkMap swap pos focus b2a prog'

let deviceVersion = ''
let synRefreshTask: MaxTask = null
let ctx: AppContext = null
// A /connect can arrive before init(ctx) runs (the app handshakes while the
// device is still initializing — "Live API is not initialized"). Defer the
// loop probe to init in that case instead of dereferencing a null ctx.
let pendingLoopProbe = false

function saveClient(val: string | number) {
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
  const trackApi = new LiveAPI(noFn, 'live_set view selected_track')
  if (+trackApi.id !== 0) {
    osc('/nav/currTrackId', +trackApi.id)
  }
  osc('/sendState', 1)
  if (synRefreshTask) {
    synRefreshTask.cancel()
  }
  synRefreshTask = new Task(function () {
    outlet(OUTLET_REFRESH, 'refresh')
  }) as MaxTask
  synRefreshTask.schedule(150)
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

export { routes, setDeviceVersion, init }
