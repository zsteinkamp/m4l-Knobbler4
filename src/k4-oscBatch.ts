// Outbound OSC coalescing — folded into the entry [v8 knobbler]. utils.osc()
// feeds send() in-process (registered via setOscSink); send() batches numeric
// values into a /batch JSON envelope (batch-capable clients) or rate-limits
// per-address (others), then emits to OUTLET_OSC -> [s ---UDPSEND] -> the
// OSC-out gate -> [udpsend]. Non-numeric payloads (strings, JSON, chunks) are
// built into raw OSC packets here and sent via udpsend's `rawbytes` message so
// the variable content never interns into Max's symbol table.

import { buildOscPacket, loadSetting, logFactory } from './utils'
import config from './config'
import { OUTLET_OSC } from './consts'

const log = logFactory(config)

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
  batchEnabled = typeof caps === 'string' && caps.indexOf('batch') !== -1
}

// Reusable 2-element output array for numeric fast-path sends.
const outMsg: any[] = ['', '']

// Reusable rawbytes output array for non-numeric sends. The first atom is
// the fixed 'rawbytes' selector (gensym'd once and reused); the rest are
// byte values (numeric atoms — no symbol-table interaction).
const rawOut: any[] = ['rawbytes']

function sendRawBytes(bytes: number[]) {
  rawOut.length = 1
  for (let i = 0; i < bytes.length; i++) rawOut.push(bytes[i])
  outlet(OUTLET_OSC, rawOut)
}

// For numeric args we keep the existing path — [udpsend]'s default OSC
// formatter handles them cleanly and they don't intern. For anything else
// (strings, JSON-encoded objects), we build the wire packet ourselves and
// hand [udpsend] the bytes via its rawbytes message, bypassing its OSC
// formatter entirely so the variable-content payload never becomes a Max
// atom.
function sendDirect(address: string, val: any) {
  if (typeof val === 'number') {
    outMsg[0] = address
    outMsg[1] = val
    outlet(OUTLET_OSC, outMsg)
  } else {
    sendRawBytes(buildOscPacket(address, val))
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
    // /batch envelope always has a JSON-string arg — build the wire packet
    // here so the JSON never becomes a Max atom.
    sendRawBytes(buildOscPacket('/batch', oscBuffer))
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

  if (shouldBypass(address)) {
    sendDirect(address, val)
    return
  }

  if (batchEnabled) {
    addToBatch(address, val)
  } else {
    throttleSend(address, val)
  }
}

log('reloaded k4-oscBatch')

export { send }
