import { logFactory } from './utils'
import config from './config'

autowatch = 1
inlets = 1
outlets = 1

const log = logFactory(config)

setinletassist(0, 'OSC messages to rate-limit')
setoutletassist(0, 'Rate-limited OSC messages to [udpsend]')

let intervalMs = 20

type ThrottleEntry = {
  args: any[]
  lastSentTime: number
  task: MaxTask | null
}

const entries: { [address: string]: ThrottleEntry } = {}

function setThrottleInterval(ms: number) {
  intervalMs = ms
  log('throttle interval set to', ms, 'ms')
}

const BYPASS_SUFFIXES = ['/start', '/end', '/chunk']

function shouldBypass(address: string) {
  for (var i = 0; i < BYPASS_SUFFIXES.length; i++) {
    var suffix = BYPASS_SUFFIXES[i]
    if (
      address.length >= suffix.length &&
      address.indexOf(suffix, address.length - suffix.length) !== -1
    ) {
      return true
    }
  }
  return false
}

function anything() {
  const address = messagename
  const args = arrayfromargs(arguments)

  if (shouldBypass(address)) {
    send(address, args)
    return
  }

  const now = new Date().getTime()
  const entry = entries[address]

  if (!entry) {
    entries[address] = {
      args: args,
      lastSentTime: now,
      task: null,
    }
    send(address, args)
    return
  }

  if (now - entry.lastSentTime >= intervalMs) {
    if (entry.task) {
      entry.task.cancel()
      entry.task.freepeer()
      entry.task = null
    }
    entry.args = args
    entry.lastSentTime = now
    send(address, args)
    return
  }

  // Too soon — store latest value and schedule deferred send
  log('throttled', address, args.join(' '))
  entry.args = args
  if (!entry.task) {
    const delay = entry.lastSentTime + intervalMs - now
    entry.task = new Task(makeDeferred(address)) as MaxTask
    entry.task.schedule(delay)
  }
}

function makeDeferred(address: string) {
  return function () {
    const entry = entries[address]
    if (entry) {
      entry.task = null
      entry.lastSentTime = new Date().getTime()
      send(address, entry.args)
    }
  }
}

function send(address: string, args: any[]) {
  outlet(0, [address].concat(args))
}

log('reloaded k4-oscThrottle')

// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
