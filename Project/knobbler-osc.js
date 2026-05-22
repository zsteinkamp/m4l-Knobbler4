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
let debug = false

maxApi.addHandler('host', (h) => {
  host = String(h)
})
maxApi.addHandler('port', (p) => {
  port = parseInt(p)
})

// Debug checkbox ([prepend debugOutput] -> node.script). When on, log every
// outgoing packet (address + decoded payload). Floods at meter rates — only for
// dev inspection.
maxApi.addHandler('debugOutput', (v) => {
  debug = !!parseInt(v)
})

// Decode an outgoing OSC packet back to "<address> <payload>" for logging.
// Mirrors buildOscPacket: 4-byte-aligned address, ",<tag>" type tag, then one
// arg — i (int32 BE), f (float32 BE), s (null-terminated string), or none.
function oscDescribe(buf) {
  let n = 0
  while (n < buf.length && buf[n] !== 0) n++
  const addr = buf.toString('ascii', 0, n)
  const tagOff = (n + 1 + 3) & ~3 // past null, padded to 4
  const tag = buf[tagOff + 1] // char after ','
  const argOff = tagOff + 4
  let payload
  if (tag === 0x69) {
    payload = buf.readInt32BE(argOff) // 'i'
  } else if (tag === 0x66) {
    payload = buf.readFloatBE(argOff) // 'f'
  } else if (tag === 0x73) {
    let e = argOff // 's'
    while (e < buf.length && buf[e] !== 0) e++
    payload = buf.toString('ascii', argOff, e)
  } else {
    payload = '(no arg)'
  }
  return addr + ' ' + payload
}

maxApi.addHandler('packet', (...packet) => {
  if (host === null || port === null) {
    dropped++ // self-gate: nothing until /connect has set host+port
    return
  }
  const buf = Buffer.from(packet)
  if (debug) {
    maxApi.post('knobbler-osc out: ' + oscDescribe(buf) + ' -> ' + host + ':' + port)
  }
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
