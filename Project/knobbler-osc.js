// Outbound OSC sender via Node for Max — sends pre-built OSC packets as raw UDP
// datagrams, bypassing [udpsend] entirely. This sidesteps two problems at once:
//   1. [udpsend]'s `rawbytes` message only exists in Max 9.1.0+ (Live 12.4+);
//      on older Max it OSC-formats the message and the app's OSC parser crashes.
//   2. Sending variable strings through [udpsend] interns them → symbol-table
//      bloat. Here we only ever ship byte lists, never strings.
//
// Verified working on Push 3 standalone (node.script + dgram both run there).
//
// Messages from Max ([v8 knobbler]):
//   host <ip>            target host (from /connect)
//   port <n>             target port (from /connect)
//   packet <byte…>       a complete OSC packet (0–255 ints) to send raw
//   stats                post a throughput line (dev/perf check)

const maxApi = require('max-api')
const dgram = require('dgram')

let socket = dgram.createSocket('udp4')
let host = null
let port = null
let sent = 0
let bytes = 0
let dropped = 0
let errors = 0

maxApi.addHandler('host', (h) => {
  host = String(h)
})
maxApi.addHandler('port', (p) => {
  port = parseInt(p)
})

maxApi.addHandler('packet', (...packet) => {
  if (host === null || port === null) {
    dropped++ // self-gate: nothing until /connect has set host+port
    return
  }
  const buf = Buffer.from(packet)
  socket.send(buf, port, host, (err) => {
    if (err) {
      errors++
    } else {
      sent++
      bytes += buf.length
    }
  })
})

// Throughput probe — bang from Max (e.g. a 1 Hz metro) during perf testing.
maxApi.addHandler('stats', () => {
  maxApi.post(
    'knobbler-osc: sent=' + sent + ' bytes=' + bytes +
    ' dropped=' + dropped + ' errors=' + errors +
    ' target=' + host + ':' + port
  )
})

// We're up. Output 1 to OPEN the patcher's [gate 1 0] on our packet inlet: until
// this fires the gate is closed, so OSC the device pushes at load is dropped at
// the gate (no "Node script not ready" errors) rather than reaching us early.
// Those load-time packets are all pre-connect anyway — the app gets full state
// from the /syn re-push once it connects (we're long up by then). An int opens
// the gate; a bang would not.
maxApi.outlet(1)
maxApi.post('knobbler-osc: ready')
