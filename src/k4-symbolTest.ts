// Symbol-table bloat test harness.
//
// Goal: determine whether various Max data paths leak strings into Max's
// global symbol table (t_symbol hash) by measuring whether shared-prefix
// gensym lookups slow down after the path is exercised.
//
// Workflow (run in a FRESH Max launch each time to isolate the result):
//   1. prep             — pre-creates BENCH_COUNT shared-prefix symbols
//   2. bench            — baseline: outlet those existing symbols, measure time
//   3. <stressOp> N     — exercises one candidate path with N fresh strings
//   4. bench            — repeat measurement; slowdown = symbols leaked
//
// Comparing the ratio across stress ops tells us which paths intern strings.
//
// Stress ops:
//   stressOutlet N        — outlet(0, [addr, str]) — primitive JS string
//   stressOutletObj N     — outlet(0, [addr, new String(str)]) — wrapped
//   stressDictVal N       — dict.set(fixedKey, freshStr)
//   stressDictKey N       — dict.set(freshKey, fixedVal)
//   stressDictSerialize N — write+serialize+outlet the serialized result
//
// Same compiled file loads in BOTH [js k4-symbolTest.js] and [v8 k4-symbolTest.js].
// To test whether [v8] strings intern as t_string (no bloat) vs t_symbol (bloat):
//   - load both engines side-by-side
//   - run prep/bench on the [js] instance (bench measurement is engine-agnostic
//     because the symbol table is global to the Max process)
//   - run stressOutlet / stressOutletObj on the [v8] instance
//   - re-run bench on the [js] instance — slowdown ⇒ [v8] also gensyms

var module: any = { exports: {} }

autowatch = 1
inlets = 1
outlets = 1

const PREFIX = 'sym_'
const BENCH_COUNT = 200000
const BENCH_REPS = 5

function p(...args: any[]) {
  post(args.join(' ') + '\n')
}

function now(): number {
  return new Date().getTime()
}

// Pre-created benchmark strings — populated by prep().
// These get gensym'd into the symbol table during prep, then re-looked-up
// repeatedly during bench. If subsequent stress ops bloat the table with
// shared-prefix strings, these lookups slow down.
let benchStrings: string[] = []

const outMsg: any[] = ['/probe', null]

function outletString(s: string) {
  outMsg[1] = s
  outlet(0, outMsg)
}

let _testDict: any = null
function testDict(): any {
  if (!_testDict) _testDict = new Dict('symTestDict')
  return _testDict
}

// ---------------------------------------------------------------------------

function prep() {
  benchStrings = []
  for (let i = 0; i < BENCH_COUNT; i++) {
    benchStrings.push(PREFIX + i)
  }
  // First call to outletString interns the symbol. Do all of them so the
  // bench step is pure lookup, not first-insert.
  for (let i = 0; i < BENCH_COUNT; i++) {
    outletString(benchStrings[i])
  }
  p('prep: seeded', BENCH_COUNT, 'symbols with prefix', PREFIX)
}

function bench() {
  if (benchStrings.length === 0) {
    p('bench: run prep first')
    return
  }
  const times: number[] = []
  for (let r = 0; r < BENCH_REPS; r++) {
    const t0 = now()
    for (let i = 0; i < BENCH_COUNT; i++) {
      outletString(benchStrings[i])
    }
    times.push(now() - t0)
  }
  times.sort((a, b) => a - b)
  p(
    'bench: min=' +
      times[0] +
      'ms  median=' +
      times[Math.floor(times.length / 2)] +
      'ms  max=' +
      times[times.length - 1] +
      'ms'
  )
}

// ---------------------------------------------------------------------------
// Stress ops — each generates N fresh shared-prefix strings via a different
// path. Use a high offset (1e6) so they never collide with benchStrings.

function freshStr(i: number): string {
  return PREFIX + (1000000 + i)
}

function stressOutlet(n: number) {
  const t0 = now()
  for (let i = 0; i < n; i++) {
    outletString(freshStr(i))
  }
  p('stressOutlet:', n, 'in', now() - t0, 'ms')
}

// Same as stressOutlet but wraps the string in `new String(...)`. In [v8]
// this may produce a t_string atom rather than t_symbol — the whole point of
// testing this variant. In [js] it likely behaves the same as the primitive
// (both gensym), giving us a control comparison.
const outMsgObj: any[] = ['/probe', null]
function stressOutletObj(n: number) {
  const t0 = now()
  for (let i = 0; i < n; i++) {
    outMsgObj[1] = new String(freshStr(i))
    outlet(0, outMsgObj)
  }
  p('stressOutletObj:', n, 'in', now() - t0, 'ms')
}

function stressDictVal(n: number) {
  const d = testDict()
  const t0 = now()
  for (let i = 0; i < n; i++) {
    d.set('fixedKey', freshStr(i))
  }
  p('stressDictVal:', n, 'in', now() - t0, 'ms')
}

function stressDictKey(n: number) {
  const d = testDict()
  const t0 = now()
  for (let i = 0; i < n; i++) {
    d.set(freshStr(i), 1)
  }
  p('stressDictKey:', n, 'in', now() - t0, 'ms')
}

function stressDictSerialize(n: number) {
  const d = testDict()
  const t0 = now()
  for (let i = 0; i < n; i++) {
    d.set('payload', { v: freshStr(i) })
    // .stringify() returns a JSON string. If we don't outlet it, it never
    // becomes a Max atom — but if Max also gensyms during the serialize call
    // itself, this still bloats. We compare against a variant that outlets too.
    d.stringify()
  }
  p('stressDictSerialize:', n, 'in', now() - t0, 'ms')
}

// ---------------------------------------------------------------------------

function anything() {
  const cmd = messagename
  const a: any = arrayfromargs(arguments)
  if (cmd === 'prep') prep()
  else if (cmd === 'bench') bench()
  else if (cmd === 'stressOutlet') stressOutlet(parseInt(a[0]) || 1000)
  else if (cmd === 'stressOutletObj')
    stressOutletObj(parseInt(a[0]) || 1000)
  else if (cmd === 'stressDictVal') stressDictVal(parseInt(a[0]) || 1000)
  else if (cmd === 'stressDictKey') stressDictKey(parseInt(a[0]) || 1000)
  else if (cmd === 'stressDictSerialize')
    stressDictSerialize(parseInt(a[0]) || 1000)
  else p('unknown cmd:', cmd)
}

p('reloaded k4-symbolTest')

const _module = {}
export = {}
