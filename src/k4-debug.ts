// Debug / instrumentation routes for the integration-test harness.
//
// These let the app emulator poll runtime diagnostics OVER OSC, turning the
// manual k4-symbolTest investigation into an automated gate. Two routes:
//
//   /debug/symbolCount  -> replies /debug/symbolCount <n>   (absolute count)
//   /debug/bench        -> replies /debug/bench <medianMs>  (relative leak signal)
//
// --- /debug/symbolCount: why the file round-trip -----------------------------
// Max's global symbol-table count is NOT reachable programmatically: the
// `; max size` report only PRINTS to the Max Console; the [console] object has
// no outlets; and no `max` message replies to a [receive]. (Confirmed against
// the Cycling '74 "Messages to Max" + [console] reference, June 2026.) The one
// capture path is via a file:
//   1. create a [console] and clear it  (clear acts on the GLOBAL console)
//   2. messnamed('max','size')          -> posts "<n> symbols ..." to the console
//   3. [console] write <file>           -> dumps the console text to disk
//   4. read the file here, regex the integer, OSC it back, then remove the [console]
// Steps 2->3 and 3->4 need a scheduler tick so the post lands / the write flushes.
//
// NO resident patcher object: the [console] is created on demand via the
// scripting API (patcher.newdefault) only while a measurement runs, then removed
// (patcher.remove). A device that never receives this route therefore carries
// ZERO debug footprint. clear/write act on the GLOBAL Max console (not a buffer
// the object owns), so a freshly created [console] works immediately. `; max
// size` hits the global `max` object via messnamed('max','size').
//
// --- /debug/bench: relative leak tripwire ------------------------------------
// Re-looks-up a one-time-seeded cohort of shared-prefix symbols and times it; a
// bloated table makes the gensym lookups slower, so a rising median across a
// session signals symbol growth even without the absolute count. NOTE: seeding
// the cohort itself interns BENCH_COUNT symbols ONCE (a constant offset). Don't
// interleave /debug/bench with /debug/symbolCount in a run where you want clean
// absolute numbers — seed pollutes the very table symbolCount measures.

import { logFactory, osc, setOscSink } from './utils'
import config from './k4-config'

const log = logFactory(config)

const SYMCOUNT_FILE = '/tmp/k4_symcount.txt'
const WRITE_DELAY_MS = 80 // let `; max size`'s post reach the console buffer
const READ_DELAY_MS = 80 // let [console] finish flushing the file to disk

// Reusable Tasks (created once, rescheduled) — never per-call new Task (leak).
let writeTask: Task = null
let readTask: Task = null
// Transient [console], created per measurement and removed after the read so the
// device keeps zero debug footprint when the route is never called.
let consoleObj: Maxobj = null

function now(): number {
  return new Date().getTime()
}

// --- /debug/symbolCount ------------------------------------------------------

function readSymCountFile(): number {
  try {
    const f = new File(SYMCOUNT_FILE, 'read')
    if (!f.isopen) {
      log('symbolCount: cannot open ' + SYMCOUNT_FILE + ' (console wiring set up?)')
      return -1
    }
    const text = f.readstring(f.eof)
    f.close()
    // Tolerant of Max's exact wording / thousands separators:
    // "There are 48213 symbols in memory." / "48,213 symbols defined."
    const m = text.match(/([\d,]+)\s+symbols?\b/i)
    if (!m) {
      log('symbolCount: no "<n> symbols" line in console dump')
      return -1
    }
    return parseInt(m[1].replace(/,/g, ''), 10)
  } catch (e) {
    log('symbolCount read error: ' + e)
    return -1
  }
}

function removeConsole() {
  if (consoleObj) {
    patcher.remove(consoleObj)
    consoleObj = null
  }
}

function onWriteTick() {
  if (consoleObj) consoleObj.message('write', SYMCOUNT_FILE)
  if (!readTask) {
    readTask = new Task(function () {
      osc('/debug/symbolCount', readSymCountFile())
      removeConsole() // tear down the transient [console]
    })
  }
  readTask.schedule(READ_DELAY_MS)
}

function symbolCount() {
  removeConsole() // drop any leftover from an aborted prior measurement
  // Create a [console] on demand; it controls the GLOBAL console, so a fresh one
  // works immediately. (newdefault places it in the patching layer, not
  // presentation, so it's invisible in the Live device view.)
  consoleObj = patcher.newdefault(0, 0, 'console')
  consoleObj.message('clear') // start from an empty console
  messnamed('max', 'size') // post "<n> symbols ..." to the console
  if (!writeTask) {
    writeTask = new Task(onWriteTick)
  }
  writeTask.schedule(WRITE_DELAY_MS)
}

// --- /debug/bench ------------------------------------------------------------

const BENCH_PREFIX = 'k4dbg_'
const BENCH_REPS = 5
const BENCH_COUNT_DEFAULT = 50000

let benchDict: any = null
let benchCount = 0 // 0 until seeded

// Seed the cohort once via Dict-key sets (key writes intern ~1:1). Re-setting an
// EXISTING key later is a pure gensym lookup (no new symbol) — that's the bench.
function ensureBenchSeed(count: number) {
  if (benchCount > 0) {
    return
  }
  benchDict = new Dict('k4dbgBenchDict')
  for (let i = 0; i < count; i++) {
    benchDict.set(BENCH_PREFIX + i, 1)
  }
  benchCount = count
  log('bench: seeded ' + count + ' symbols (one-time table offset)')
}

function bench(arg: any) {
  const requested = parseInt(arg) || BENCH_COUNT_DEFAULT
  ensureBenchSeed(requested)
  const times: number[] = []
  for (let r = 0; r < BENCH_REPS; r++) {
    const t0 = now()
    // Re-set the seeded keys: each is a gensym lookup against the live table.
    for (let i = 0; i < benchCount; i++) {
      benchDict.set(BENCH_PREFIX + i, 1)
    }
    times.push(now() - t0)
  }
  times.sort((a, b) => a - b)
  osc('/debug/bench', times[Math.floor(times.length / 2)])
}

// --- lifecycle ---------------------------------------------------------------

function init(c: AppContext) {
  setOscSink(c.osc) // own utils instance -> shared batch buffer (see CLAUDE.md)
}

log('reloaded k4-debug')

const routes: Route[] = [
  { prefix: '/debug/symbolCount', parse: 'bare', fn: symbolCount },
  { prefix: '/debug/bench', parse: 'val', fn: bench },
]

export { routes, init }
