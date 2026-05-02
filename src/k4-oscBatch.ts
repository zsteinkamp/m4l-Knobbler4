import { loadSetting, logFactory } from './utils'
import config from './config'

autowatch = 1
inlets = 1
outlets = 1

const log = logFactory(config)

setinletassist(0, 'OSC messages to coalesce and batch')
setoutletassist(0, 'Coalesced/batched OSC messages to [udpsend]')

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
const batchOut: any[] = ['/batch', null]

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

// Reusable 2-element output array to avoid allocations in send()
const outMsg: any[] = ['', '']

function sendDirect(address: string, val: any) {
  outMsg[0] = address
  outMsg[1] = val
  outlet(0, outMsg)
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
    batchOut[1] = JSON.stringify(oscBuffer)
    outlet(0, batchOut)
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

function anything(val: any) {
  const address = messagename

  // Re-check capabilities after handshake or ping (capabilities may arrive in either)
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

// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
