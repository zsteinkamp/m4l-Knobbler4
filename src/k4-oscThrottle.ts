import { logFactory } from './utils'
import config from './k4-config'

// Coalescing and throttling now handled by k4-oscBatch.
// This module is a passthrough to avoid .amxd patching.

autowatch = 1
inlets = 1
outlets = 1

const log = logFactory(config)

setinletassist(0, 'OSC passthrough')
setoutletassist(0, 'OSC passthrough')

function anything(val: any) {
  outlet(0, messagename, val)
}

log('reloaded k4-oscThrottle (passthrough)')

// NOTE: This section must appear in any .ts file that is directly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
