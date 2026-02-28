import { logFactory } from './utils'
import config from './config'

autowatch = 1
inlets = 1
outlets = 1

const log = logFactory(config)

setinletassist(0, 'OSC messages to rate-limit')
setoutletassist(0, 'Rate-limited OSC messages to [udpsend]')

let intervalMs = 30

type ThrottleEntry = {
  address: string
  arg: any
  lastSentTime: number
  task: MaxTask | null
  deferredFn: Function
}

const entries: { [address: string]: ThrottleEntry } = {}

// Reusable 2-element output array to avoid allocations in send()
const outMsg: any[] = ['', '']

function setThrottleInterval(ms: number) {
  intervalMs = ms
  log('throttle interval set to', ms, 'ms')
}

const BYPASS_SUFFIXES = ['/start', '/end', '/chunk', '/batch']

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

function anything(val: any) {
  const address = messagename

  if (shouldBypass(address)) {
    outMsg[0] = address
    outMsg[1] = val
    outlet(0, outMsg)
    return
  }

  const now = Date.now()
  const entry = entries[address]

  if (!entry) {
    const e: ThrottleEntry = {
      address: address,
      arg: val,
      lastSentTime: now,
      task: null,
      deferredFn: null,
    }
    e.deferredFn = makeDeferred(e)
    entries[address] = e
    outMsg[0] = address
    outMsg[1] = val
    outlet(0, outMsg)
    return
  }

  if (now - entry.lastSentTime >= intervalMs) {
    if (entry.task) {
      entry.task.cancel()
      entry.task.freepeer()
      entry.task = null
    }
    entry.arg = val
    entry.lastSentTime = now
    outMsg[0] = address
    outMsg[1] = val
    outlet(0, outMsg)
    return
  }

  // Too soon — store latest value and schedule deferred send
  entry.arg = val
  if (!entry.task) {
    const delay = entry.lastSentTime + intervalMs - now
    entry.task = new Task(entry.deferredFn) as MaxTask
    entry.task.schedule(delay)
  }
}

function makeDeferred(entry: ThrottleEntry) {
  return function () {
    entry.task = null
    entry.lastSentTime = Date.now()
    outMsg[0] = entry.address
    outMsg[1] = entry.arg
    outlet(0, outMsg)
  }
}

log('reloaded k4-oscThrottle')

// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
