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

import { buildOscPacket, loadSetting, logFactory, simpleHash, RAWBYTES_OK, MAX_VERSION_RAW } from './utils'
import config from './k4-config'
import { OUTLET_OSC } from './consts'

const log = logFactory(config)
log('reloaded k4-oscBatch: max.version=' + MAX_VERSION_RAW + ' rawbytes=' + RAWBYTES_OK)

const BATCH_FLUSH_MS = 10
const BATCH_MAX_BYTES = 1024
const CHUNK_MAX_BYTES = 1024
const THROTTLE_MS = 15

const BYPASS_SUFFIXES = ['/start', '/end', '/chunk', '/meters']

// Addresses an OLD (cNav-only) app reassembles into oscDataRef[prefix] directly
// (no per-address merge logic). The pipeline may chunk these for such apps.
// `chunkAny` apps can reassemble+dispatch ANY address, so they aren't limited
// to this list. See checkClientCapabilities / shouldChunk.
const LEGACY_CHUNK_ADDRS = [
  '/nav/devices',
  '/clips/scenes',
  '/visibleTracks',
  '/browser/items',
]

let batchEnabled = false
let cNavEnabled = false
let chunkAnyEnabled = false
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
  const s = typeof caps === 'string' ? caps : ''
  // Only batch when the client supports it AND we can ship the /batch JSON as
  // rawbytes — on older Max the envelope would intern a fresh string per flush.
  batchEnabled = RAWBYTES_OK && s.indexOf('batch') !== -1
  cNavEnabled = s.indexOf('cNav') !== -1
  chunkAnyEnabled = s.indexOf('chunkAny') !== -1
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

// Debug-output logging — driven by the patcher's debug checkbox (`debug 1`/`0`
// -> entry -> setDebug). When on, each outgoing OSC message is logged from the
// send path BEFORE encoding, so we log the original address+value directly (no
// need to decode the rawbytes packet) tagged with the transport that was used.
let debugOut = false
export function setDebug(v: boolean) {
  debugOut = !!v
}

// Set true while sendChunked emits its /start//chunk//end pieces, so they don't
// each log an OSC OUT line — chunked sends get one summary line instead.
let suppressOutLog = false

// transport: 'rawbytes' or 'native'. byteLen < 0 = unknown (native, unencoded).
function logOut(transport: string, address: string, value: any, byteLen: number) {
  let vs: any = value
  if (typeof vs === 'object' && vs !== null) vs = JSON.stringify(vs)
  if (typeof vs === 'string' && vs.length > 120) {
    vs = vs.slice(0, 120) + '…(' + vs.length + ' chars)'
  }
  const sz = byteLen >= 0 ? '  [' + byteLen + ' bytes]' : ''
  log('OSC OUT [' + transport + '] ' + address + ' ' + vs + sz)
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
    const bytes = buildOscPacket(address, val)
    if (debugOut && !suppressOutLog) logOut('rawbytes', address, val, bytes.length)
    emitRawbytes(bytes)
  } else {
    if (debugOut && !suppressOutLog) logOut('native', address, val, -1)
    sendNative(address, val)
  }
}

// --- Chunking (transport stage; callers never split payloads themselves) ---

function shouldChunk(address: string, arr: any[]): boolean {
  // Small arrays fit one packet — no need to chunk.
  if (JSON.stringify(arr).length <= CHUNK_MAX_BYTES) return false
  if (chunkAnyEnabled) return true
  return cNavEnabled && LEGACY_CHUNK_ADDRS.indexOf(address) !== -1
}

// Split a large array into the /start//chunk//end protocol the app reassembles.
// Pieces go via sendDirect (so they bypass batching and don't re-enter chunking).
// The /end checksum is simpleHash(JSON.stringify(items)) — '[' + per-item JSON
// joined + ']' is identical to JSON.stringify(array) — which the app re-derives
// from the reassembled items to verify integrity.
function sendChunked(address: string, items: any[]) {
  // Suppress per-piece OSC OUT logs; a chunked send gets one summary after /end.
  suppressOutLog = true
  sendDirect(address + '/start', items.length)
  let chunkItems: any[] = []
  let chunkSize = 2
  let chunkCount = 0
  const allParts: string[] = []
  for (let i = 0; i < items.length; i++) {
    const itemJson = JSON.stringify(items[i])
    allParts.push(itemJson)
    const added = (chunkItems.length > 0 ? 1 : 0) + itemJson.length
    if (chunkItems.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
      sendDirect(address + '/chunk', chunkItems)
      chunkCount++
      chunkItems = []
      chunkSize = 2
    }
    chunkItems.push(items[i])
    chunkSize += added
  }
  if (chunkItems.length > 0) {
    sendDirect(address + '/chunk', chunkItems)
    chunkCount++
  }
  const totalBytes = allParts.join(',').length + 2 // ~JSON.stringify(items) length
  sendDirect(address + '/end', simpleHash('[' + allParts.join(',') + ']'))
  suppressOutLog = false

  if (debugOut) {
    log(
      'OSC OUT [chunked] ' +
        address +
        ': ' +
        items.length +
        ' items, ' +
        totalBytes +
        ' bytes, ' +
        chunkCount +
        ' chunks'
    )
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
    const bytes = buildOscPacket('/batch', oscBuffer)
    if (debugOut) logOut('rawbytes', '/batch', oscBuffer, bytes.length)
    emitRawbytes(bytes)
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
  // Chunk-protocol pieces (/start//chunk//end) and meters go straight out; this
  // guard also stops the /chunk arrays emitted below from re-entering chunking.
  if (shouldBypass(address)) {
    sendDirect(address, val)
    return
  }

  // Transport-level chunking: a large array is split into /start//chunk//end so
  // feature code never deals with packet size. Capability-gated (see shouldChunk).
  if (Array.isArray(val) && shouldChunk(address, val)) {
    sendChunked(address, val)
    return
  }

  if (typeof val !== 'number') {
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
