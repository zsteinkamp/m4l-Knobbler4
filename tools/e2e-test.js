#!/usr/bin/env node
// End-to-end tester: emulates the Knobbler4 app driving the LIVE M4L device over
// OSC, and evaluates each cycle for CORRECTNESS (expected replies arrived) and
// PERFORMANCE (round-trip time + Max symbol-table growth via /debug/symbolCount).
//
// Run on the HOST (must reach Live's [udpreceive] on 127.0.0.1:2346):
//   node tools/e2e-test.js [--listen 9000] [--to 2346] [--host 127.0.0.1]
//
// Phases:
//   1. Connect/handshake: /connect + /syn -> expect /ack, /sendState,
//      /nav/currTrackId, /visibleTracks. Times /syn->/ack.
//   2. Clips page: /page/clips + /clipView -> expect /clips/grid, /clips/scenes,
//      /clips/trackInfo. Times entry; measures symbol delta.
//   3. Mixer page: /page/mixer + /mixerView -> expect /mixer/0/name +
//      /sendMixerView. Times entry; measures symbol delta.
//
// Declares NO capabilities (version-only /syn) so the device sends plain OSC
// (no /batch, chunking, or columnar) — the decoder reads it directly. Full-cap
// fidelity comes once the emulator gains the batch/chunk/columnar decode layer.

const { OscClient } = require('./osc')

const opt = { host: '127.0.0.1', to: 2346, listen: 9000 }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--host') opt.host = argv[++i]
  else if (argv[i] === '--to') opt.to = +argv[++i]
  else if (argv[i] === '--listen') opt.listen = +argv[++i]
}

const results = [] // { phase, checks:[{name,ok,detail}], lines:[...] }

function check(phase, name, ok, detail) {
  phase.checks.push({ name, ok: !!ok, detail: detail || '' })
}
function countByPrefix(client, fromIndex) {
  const counts = {}
  for (let i = fromIndex; i < client.log.length; i++) {
    const a = client.log[i].address
    const key = a.split('/').slice(0, 3).join('/') || a
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}
async function symbolCount(client) {
  const mark = client.since()
  client.send('/debug/symbolCount', [])
  const m = await client.waitFor((x) => x.address === '/debug/symbolCount', 2000, mark)
  return m ? m.args[0] : null
}

async function main() {
  const client = new OscClient({ host: opt.host, sendPort: opt.to, listenPort: opt.listen })
  try {
    await client.bind()
  } catch (e) {
    console.error(`bind failed on ${opt.listen}: ${e.message} (try a different --listen)`)
    process.exit(1)
  }
  console.log(`emulator listening on ${opt.listen}, device at ${opt.host}:${opt.to}\n`)

  // ---- PHASE 1: connect / handshake ----
  {
    const phase = { phase: '1. Connect / handshake', checks: [] }
    results.push(phase)
    const mark = client.since()
    client.send('/connect', [`${opt.host}:${opt.listen}`])
    await client.waitFor((m) => m.address === '/loop', 600, mark) // loop-guard probe echo

    const synMark = client.since()
    const tSyn = client.now()
    client.send('/syn', ['1.0']) // version only, no caps -> plain OSC
    const ack = await client.waitFor((m) => m.address === '/ack', 2500, synMark)
    const tAck = ack ? ack.t - tSyn : null
    await client.sleep(700) // let the ~150ms deferred full re-push settle

    check(phase, '/ack received', !!ack, ack ? `"${ack.args[0]}" in ${tAck}ms` : 'timeout')
    check(phase, '/sendState received', client.log.slice(synMark).some((m) => m.address === '/sendState'))
    check(phase, '/nav/currTrackId received', client.log.slice(synMark).some((m) => m.address === '/nav/currTrackId'))
    const visN = client.log.slice(synMark).filter((m) => m.address.indexOf('/visibleTracks') === 0).length
    check(phase, '/visibleTracks pushed', visN > 0, `${visN} msg`)
    phase.timing = `syn->ack ${tAck}ms`
    phase.counts = countByPrefix(client, synMark)
  }

  // ---- PHASE 2: clips page ----
  {
    const phase = { phase: '2. Clips page entry', checks: [] }
    results.push(phase)
    const symBefore = await symbolCount(client)
    const mark = client.since()
    const t = client.now()
    client.send('/page/clips', [])
    client.send('/clipView', ['[0,0,6,8]']) // left,top,right,bottom (JSON string)
    const grid = await client.waitFor((m) => m.address === '/clips/grid', 3000, mark)
    const tGrid = grid ? grid.t - t : null
    await client.sleep(600)
    const symAfter = await symbolCount(client)

    check(phase, '/clips/grid received', !!grid, grid ? `in ${tGrid}ms` : 'timeout')
    check(phase, '/clips/scenes received', client.log.slice(mark).some((m) => m.address === '/clips/scenes'))
    check(phase, '/clips/trackInfo received', client.log.slice(mark).some((m) => m.address === '/clips/trackInfo'))
    phase.timing = `enter->grid ${tGrid}ms`
    phase.symbols = symDelta(symBefore, symAfter)
    phase.counts = countByPrefix(client, mark)
  }

  // ---- PHASE 3: mixer page ----
  {
    const phase = { phase: '3. Mixer page entry', checks: [] }
    results.push(phase)
    const symBefore = await symbolCount(client)
    client.send('/page/mixer', [])
    // Mixer only re-emits strip state for NEWLY-visible strips. Park the window
    // off-screen first (clears visibleStateSet) so [0,8] is a genuine entry.
    client.send('/mixerView', ['[9999,1]'])
    await client.sleep(150) // past MIXERVIEW_DEBOUNCE_MS + applyWindow
    const mark = client.since()
    const t = client.now()
    client.send('/mixerView', ['[0,8]']) // left, count (JSON string)
    const name0 = await client.waitFor((m) => m.address === '/mixer/0/name', 3000, mark)
    const solo = await client.waitFor((m) => m.address === '/mixer/soloCount', 3000, mark)
    const tName = name0 ? name0.t - t : null
    await client.sleep(600)
    const symAfter = await symbolCount(client)

    const stripNames = client.log.slice(mark).filter((m) => /^\/mixer\/\d+\/name$/.test(m.address)).length
    check(phase, '/mixer/0/name received', !!name0, name0 ? `"${name0.args[0]}" in ${tName}ms` : 'timeout')
    check(phase, '/mixer/soloCount received', !!solo, solo ? `${solo.args[0]}` : 'timeout')
    check(phase, 'strip names emitted', stripNames > 0, `${stripNames} strips`)
    phase.timing = `enter->name ${tName}ms`
    phase.symbols = symDelta(symBefore, symAfter)
    phase.counts = countByPrefix(client, mark)
  }

  report()
  client.close()
  const allOk = results.every((p) => p.checks.every((c) => c.ok))
  process.exit(allOk ? 0 : 1)
}

function symDelta(before, after) {
  if (before == null || after == null) return `symbols: ${before} -> ${after} (read failed)`
  const d = after - before
  return `symbols: ${before} -> ${after}  (${d >= 0 ? '+' : ''}${d})`
}

function report() {
  console.log('\n================ E2E REPORT ================')
  for (const p of results) {
    const ok = p.checks.every((c) => c.ok)
    console.log(`\n${ok ? '✅' : '❌'} ${p.phase}`)
    for (const c of p.checks) {
      console.log(`   ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? '  — ' + c.detail : ''}`)
    }
    if (p.timing) console.log(`   ⏱  ${p.timing}`)
    if (p.symbols) console.log(`   🔢 ${p.symbols}`)
    if (p.counts) {
      const top = Object.entries(p.counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `${k}:${v}`)
        .join('  ')
      console.log(`   📨 ${top}`)
    }
  }
  const allOk = results.every((p) => p.checks.every((c) => c.ok))
  console.log(`\n${allOk ? '✅ ALL PHASES PASSED' : '❌ SOME CHECKS FAILED'}`)
  console.log('===========================================')
}

main().catch((e) => {
  console.error('e2e error:', e)
  process.exit(1)
})
