// Performance test: [js] vs [v8] comparison harness
// Load in both [js k4-perfTest] and [v8 k4-perfTest] (each with 1 inlet, 2 outlets)
// Send "run" to execute all benchmarks, or run individual tests:
//   runLiveApi, runOutlets, runRequire, runCompute

// [v8] entry points need `module` defined before any require() calls
var module: any = { exports: {} }

autowatch = 1
inlets = 1
outlets = 2

const OUTLET_RESULTS = 0
const OUTLET_DUMP = 1

const noFn = () => {}
const ITERATIONS = 500

function post_line(...args: any[]) {
  post(args.join(' ') + '\n')
}

// ---------------------------------------------------------------------------
// Timing helper — runs fn() `reps` times and returns [min, median, max] in ms
// ---------------------------------------------------------------------------

function benchmark(
  label: string,
  reps: number,
  fn: () => number
): { label: string; min: number; median: number; max: number } {
  const times: number[] = []
  for (let r = 0; r < reps; r++) {
    times.push(fn())
  }
  times.sort((a, b) => a - b)
  const result = {
    label,
    min: times[0],
    median: times[Math.floor(times.length / 2)],
    max: times[times.length - 1],
  }
  post_line(
    `  ${label}: min=${result.min}ms  median=${result.median}ms  max=${result.max}ms`
  )
  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTrackPaths(): string[] {
  const api = new LiveAPI(noFn, 'live_set')
  const ids: number[] = []
  const raw = api.get('tracks')
  for (let i = 0; i < raw.length; i++) {
    const n = parseInt(raw[i].toString())
    if (n.toString() === raw[i].toString()) ids.push(n)
  }
  const paths: string[] = []
  for (let i = 0; i < ids.length; i++) {
    api.id = ids[i]
    paths.push(api.unquotedpath)
  }
  // add return tracks
  api.path = 'live_set'
  const retRaw = api.get('return_tracks')
  for (let i = 0; i < retRaw.length; i++) {
    const n = parseInt(retRaw[i].toString())
    if (n.toString() === retRaw[i].toString()) {
      api.id = n
      paths.push(api.unquotedpath)
    }
  }
  // add master
  paths.push('live_set master_track')
  return paths
}

function getTrackIds(): number[] {
  const api = new LiveAPI(noFn, 'live_set')
  const ids: number[] = []
  const raw = api.get('tracks')
  for (let i = 0; i < raw.length; i++) {
    const n = parseInt(raw[i].toString())
    if (n.toString() === raw[i].toString()) ids.push(n)
  }
  const retRaw = api.get('return_tracks')
  for (let i = 0; i < retRaw.length; i++) {
    const n = parseInt(retRaw[i].toString())
    if (n.toString() === retRaw[i].toString()) ids.push(n)
  }
  const masterRaw = api.get('master_track')
  const m = parseInt(masterRaw[0].toString())
  if (!isNaN(m)) ids.push(m)
  return ids
}

// ---------------------------------------------------------------------------
// LiveAPI tests
// ---------------------------------------------------------------------------

function testCreateDestroy(paths: string[], n: number): number {
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    const p = paths[i % paths.length]
    const api = new LiveAPI(noFn, p)
    api.get('name')
    api.id = 0
  }
  return new Date().getTime() - t0
}

function testReusePath(paths: string[], n: number): number {
  const api = new LiveAPI(noFn, 'live_set')
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    api.path = paths[i % paths.length]
    api.get('name')
  }
  const elapsed = new Date().getTime() - t0
  api.id = 0
  return elapsed
}

function testReuseId(ids: number[], n: number): number {
  const api = new LiveAPI(noFn, 'live_set')
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    api.id = ids[i % ids.length]
    api.get('name')
  }
  const elapsed = new Date().getTime() - t0
  api.id = 0
  return elapsed
}

function testCreateWithObserver(paths: string[], n: number): number {
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    const p = paths[i % paths.length] + ' mixer_device volume'
    const api = new LiveAPI(function () {}, p)
    api.property = 'value'
    api.get('value')
    api.id = 0
  }
  return new Date().getTime() - t0
}

function testReuseWithObserver(paths: string[], n: number): number {
  const api = new LiveAPI(function () {}, 'live_set')
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    api.path = paths[i % paths.length] + ' mixer_device volume'
    api.property = 'value'
    api.get('value')
  }
  const elapsed = new Date().getTime() - t0
  api.id = 0
  return elapsed
}

// ---------------------------------------------------------------------------
// Outlet tests
// ---------------------------------------------------------------------------

function testOutletSimple(n: number): number {
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    outlet(OUTLET_DUMP, 'test', i)
  }
  return new Date().getTime() - t0
}

function testOutletList(n: number): number {
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    outlet(OUTLET_DUMP, 'list', i, i * 0.5, 'hello', i + 1, i * 0.25, 'world')
  }
  return new Date().getTime() - t0
}

function testOutletJson(n: number): number {
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    const payload = JSON.stringify({
      type: 'update',
      slot: i % 32,
      value: Math.random(),
      name: 'Parameter ' + (i % 32),
    })
    outlet(OUTLET_DUMP, 'json', payload)
  }
  return new Date().getTime() - t0
}

// ---------------------------------------------------------------------------
// Computation tests (pure JS, no Max API)
// ---------------------------------------------------------------------------

function testJsonSerialize(n: number): number {
  const objects = []
  for (let i = 0; i < 100; i++) {
    objects.push({
      id: i,
      name: 'Track ' + i,
      color: '#' + ((i * 12345) & 0xffffff).toString(16),
      params: Array.from({ length: 8 }, (_, j) => ({
        idx: j,
        value: Math.random(),
        name: 'Param ' + j,
      })),
    })
  }
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    JSON.stringify(objects[i % objects.length])
    JSON.parse(JSON.stringify(objects[i % objects.length]))
  }
  return new Date().getTime() - t0
}

function testArrayOps(n: number): number {
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    const arr = Array.from({ length: 200 }, (_, j) => j * Math.random())
    arr.sort((a, b) => a - b)
    arr.filter((v) => v > 50)
    arr.map((v) => v * 2)
    arr.reduce((sum, v) => sum + v, 0)
  }
  return new Date().getTime() - t0
}

function testStringOps(n: number): number {
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    let s = ''
    for (let j = 0; j < 100; j++) {
      s += 'track_' + j + '/device_' + (j % 5) + '/param_' + (j % 8) + ' '
    }
    s.split(' ').filter((p) => p.length > 0)
    s.replace(/track_(\d+)/g, 'T$1')
  }
  return new Date().getTime() - t0
}

// ---------------------------------------------------------------------------
// require() test — measure module loading overhead
// ---------------------------------------------------------------------------

function testRequire(n: number): number {
  // Use eval to bypass TypeScript's require checks — we want runtime require()
  const req = eval('require') as (path: string) => any
  const t0 = new Date().getTime()
  for (let i = 0; i < n; i++) {
    req('./consts')
    req('./config')
  }
  return new Date().getTime() - t0
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

function runLiveApi() {
  const paths = getTrackPaths()
  const ids = getTrackIds()
  const n = ITERATIONS
  const reps = 5

  post_line('=== LiveAPI Benchmarks ===')
  post_line('Tracks:', paths.length, ' Iterations:', n, ' Reps:', reps)

  // warm up
  testCreateDestroy(paths, 10)
  testReusePath(paths, 10)

  benchmark('create & destroy', reps, () => testCreateDestroy(paths, n))
  benchmark('reuse, set path', reps, () => testReusePath(paths, n))
  benchmark('reuse, set id', reps, () => testReuseId(ids, n))
  benchmark('create w/ observer', reps, () =>
    testCreateWithObserver(paths, n)
  )
  benchmark('reuse w/ observer', reps, () =>
    testReuseWithObserver(paths, n)
  )
  post_line('')
}

function runOutlets() {
  const n = ITERATIONS * 10
  const reps = 5

  post_line('=== Outlet Benchmarks ===')
  post_line('Iterations:', n, ' Reps:', reps)

  benchmark('simple outlet', reps, () => testOutletSimple(n))
  benchmark('list outlet', reps, () => testOutletList(n))
  benchmark('json outlet', reps, () => testOutletJson(n))
  post_line('')
}

function runCompute() {
  const n = ITERATIONS
  const reps = 5

  post_line('=== Computation Benchmarks ===')
  post_line('Iterations:', n, ' Reps:', reps)

  benchmark('JSON ser/deser', reps, () => testJsonSerialize(n))
  benchmark('array ops', reps, () => testArrayOps(n))
  benchmark('string ops', reps, () => testStringOps(n))
  post_line('')
}

function runRequire() {
  const n = ITERATIONS * 10
  const reps = 5

  post_line('=== require() Benchmarks ===')
  post_line('Iterations:', n, ' Reps:', reps)

  benchmark('require (cached)', reps, () => testRequire(n))
  post_line('')
}

function run() {
  post_line('')
  post_line('########################################')
  post_line('# Performance Test Harness')
  post_line('########################################')
  post_line('')

  runLiveApi()
  runOutlets()
  runCompute()
  runRequire()

  post_line('=== All done ===')
}

export = {}
