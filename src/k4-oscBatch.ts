// Outbound OSC coalescing — folded into the entry [v8 knobbler]. utils.osc()
// feeds send() in-process (registered via setOscSink); send() batches numeric
// values into a /batch JSON envelope (batch-capable clients) or rate-limits
// per-address (others). Output goes to [udpsend] via OUTLET_OSC, version-gated:
//   Max 9.1.0+ (Live 12.4+): build the OSC packet in JS and ship it as
//     `rawbytes <byte…>` — no string interning, /batch JSON rides as bytes.
//   Max < 9.1.0 (Live 12.3.x): `rawbytes` would crash the app's parser, so send
//     native `addr value` for [udpsend] to format. Numerics don't intern; only
//     low-churn strings (names/colors) do, and batching is disabled (its /batch
//     JSON would be the big interning source).
// See RAWBYTES_OK in utils.

import { buildOscPacket, loadSetting, logFactory, RAWBYTES_OK, MAX_VERSION_RAW } from './utils'
import config from './k4-config'
import { OUTLET_OSC } from './consts'

const log = logFactory(config)
log('reloaded k4-oscBatch: max.version=' + MAX_VERSION_RAW + ' rawbytes=' + RAWBYTES_OK)

const BATCH_FLUSH_MS = 10
const BATCH_MAX_BYTES = 1024
const THROTTLE_MS = 15

const BYPASS_SUFFIXES = ['/start', '/end', '/chunk', '/meters']

let batchEnabled = false
let oscBuffer: Record<string, any> = {}
let oscBufferSize = 0
let oscBufferBytes = 2 // opening/closing braces: {}
let batchFlushTask: MaxTask | null = null
let batchFlushPending = false

// --- Shared helpers ---

function oscValBytes(val: any): number {
  if (val === null) return 4 // "null"
  if (typeof val === 'string') return val.length + 2
  return val.toString().length
}

function shouldBypass(address: string) {
  for (let i = 0; i < BYPASS_SUFFIXES.length; i++) {
    const suffix = BYPASS_SUFFIXES[i]
    if (
      address.length >= suffix.length &&
      address.indexOf(suffix, address.length - suffix.length) !== -1
    ) {
      return true
    }
  }
  return false
}

function checkClientCapabilities() {
  const caps = loadSetting('clientCapabilities')
  // Only batch when the client supports it AND we can ship the /batch JSON as
  // rawbytes — on older Max the envelope would intern a fresh string per flush.
  batchEnabled =
    RAWBYTES_OK && typeof caps === 'string' && caps.indexOf('batch') !== -1
}

// rawbytes path: a complete OSC packet (built in JS) shipped to [udpsend] as
// `rawbytes <byte…>`. 'rawbytes' is a fixed selector (gensym'd once); the rest
// are byte ints — no symbol-table interaction. Max 9.1.0+ only.
const rawOut: any[] = ['rawbytes']

// Feedback-loop guard: when the configured output host:port equals our own
// [udpreceive], every packet echoes straight back and storms. knobbler.ts pings
// /loop on connect and, on hearing the echo, blocks output here. The probe ping
// is sent while unblocked (the entry clears this first), so it always goes out;
// a fresh /connect re-probes. See the /loop guard in knobbler.ts.
let outputBlocked = false
export function setOutputBlocked(v: boolean) {
  outputBlocked = v
}

function emitRawbytes(bytes: number[]) {
  if (outputBlocked) {
    return
  }
  rawOut.length = 1
  for (let i = 0; i < bytes.length; i++) {
    rawOut.push(bytes[i])
  }
  outlet(OUTLET_OSC, rawOut)
}

// Native path (Max < 9.1.0): emit `addr value` for [udpsend] to OSC-format.
// Objects/arrays are stringified; undefined sends a bare (no-arg) address.
function sendNative(address: string, val: any) {
  if (outputBlocked) {
    return
  }
  if (val === undefined) {
    outlet(OUTLET_OSC, address)
  } else if (typeof val === 'object' && val !== null) {
    outlet(OUTLET_OSC, address, JSON.stringify(val))
  } else {
    outlet(OUTLET_OSC, address, val)
  }
}

function sendDirect(address: string, val: any) {
  if (RAWBYTES_OK) {
    emitRawbytes(buildOscPacket(address, val))
  } else {
    sendNative(address, val)
  }
}

// --- Batch path (coalesce into JSON, flush on timer or size) ---

function flushBatchBuffer() {
  if (oscBufferSize === 0) {
    batchFlushPending = false
    return
  }
  if (oscBufferSize === 1) {
    for (const address in oscBuffer) {
      sendDirect(address, oscBuffer[address])
    }
  } else {
    // /batch envelope always has a JSON-string arg — ship as rawbytes so the
    // JSON never becomes a Max atom. (Only reached when batchEnabled, which
    // requires RAWBYTES_OK.)
    emitRawbytes(buildOscPacket('/batch', oscBuffer))
  }
  oscBuffer = {}
  oscBufferSize = 0
  oscBufferBytes = 2
  if (batchFlushPending && batchFlushTask) {
    batchFlushTask.cancel()
  }
  batchFlushPending = false
}

function addToBatch(address: string, val: any) {
  if (val === undefined) {
    val = null
  }

  if (!(address in oscBuffer)) {
    // "addr":val, — key quotes(2) + colon(1) + valBytes + comma(1)
    const entryBytes = address.length + 4 + oscValBytes(val)
    if (oscBufferSize > 0 && oscBufferBytes + entryBytes > BATCH_MAX_BYTES) {
      flushBatchBuffer()
    }
    oscBufferSize++
    oscBufferBytes += entryBytes
  }
  oscBuffer[address] = val

  if (!batchFlushPending) {
    if (!batchFlushTask) {
      batchFlushTask = new Task(flushBatchBuffer) as MaxTask
    }
    batchFlushTask.schedule(BATCH_FLUSH_MS)
    batchFlushPending = true
  }
}

// --- Throttle path (leading-edge per-address rate limiting for non-batch clients) ---

type ThrottleEntry = {
  address: string
  val: any
  lastSentTime: number
  task: MaxTask | null
  deferredFn: () => void
}

const throttleEntries: Record<string, ThrottleEntry> = {}

function makeThrottleDeferred(entry: ThrottleEntry) {
  return function () {
    entry.task = null
    entry.lastSentTime = Date.now()
    sendDirect(entry.address, entry.val)
  }
}

function throttleSend(address: string, val: any) {
  const now = Date.now()
  const entry = throttleEntries[address]

  if (!entry) {
    const e: ThrottleEntry = {
      address: address,
      val: val,
      lastSentTime: now,
      task: null,
      deferredFn: null,
    }
    e.deferredFn = makeThrottleDeferred(e)
    throttleEntries[address] = e
    sendDirect(address, val)
    return
  }

  if (now - entry.lastSentTime >= THROTTLE_MS) {
    if (entry.task) {
      entry.task.cancel()
      entry.task.freepeer()
      entry.task = null
    }
    entry.val = val
    entry.lastSentTime = now
    sendDirect(address, val)
    return
  }

  // Too soon — store latest value and schedule trailing dispatch
  entry.val = val
  if (!entry.task) {
    const delay = entry.lastSentTime + THROTTLE_MS - now
    entry.task = new Task(entry.deferredFn) as MaxTask
    entry.task.schedule(delay)
  }
}

// --- Entry point ---

// Registered as utils' osc() sink. Every module's osc(addr, val) lands here.
function send(address: string, val: any) {
  // Capabilities may arrive in the handshake or a ping; both pass through here
  // (k4-system sends /sendState and /pong via osc()), so re-check on either.
  if (address === '/sendState' || address === '/pong') {
    checkClientCapabilities()
  }

  // Only NUMERIC values ever go in the /batch envelope. Non-numeric payloads
  // (strings, JSON-encoded arrays/objects) are emitted immediately as their own
  // OSC packet — the app's /batch parser expects numeric values only, and
  // pre-fold osc() never batched non-numerics either.
  if (typeof val !== 'number' || shouldBypass(address)) {
    sendDirect(address, val)
    return
  }

  if (batchEnabled) {
    addToBatch(address, val)
  } else {
    throttleSend(address, val)
  }
}

export { send }
