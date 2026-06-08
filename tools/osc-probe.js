#!/usr/bin/env node
// osc-probe — minimal OSC send/receive tool for poking the live Knobbler4
// device over UDP. Seed of the app emulator: hand-rolled OSC codec (no deps),
// host-side so it can reach Live's [udpreceive] on 127.0.0.1.
//
// Topology (from Knobbler4.amxd): device receives on 2346, sends to
// 127.0.0.1:2347 by default. So we bind 2347 and send to 2346. --connect
// reaffirms that reply target (and fires the device's /loop guard harmlessly).
//
// Usage:
//   node tools/osc-probe.js [opts] <address> [args...]
//   node tools/osc-probe.js /debug/symbolCount
//   node tools/osc-probe.js /debug/bench
//   node tools/osc-probe.js --no-connect /debug/symbolCount
//   node tools/osc-probe.js /connect 127.0.0.1:2347      # raw send, string arg
// Opts:
//   --to N        device receive port (default 2346)
//   --listen N    our receive port (default 2347)
//   --host H      device host (default 127.0.0.1)
//   --connect     send /connect host:listen first (default: on)
//   --no-connect  skip the /connect
//   --wait MS     keep listening this long after send, then exit (default 2500)
// args: integers -> OSC int32, decimals -> float32, else string.

const dgram = require('dgram')

// ---------- OSC encode ----------
function padLen(n) {
  return (4 - (n % 4)) % 4
}
function encString(s) {
  const b = Buffer.from(s, 'utf8')
  const pad = 4 - (b.length % 4) // always >=1 trailing null, padded to 4
  return Buffer.concat([b, Buffer.alloc(pad)])
}
function encArg(a) {
  if (typeof a === 'string') return { tag: 's', buf: encString(a) }
  if (Number.isInteger(a)) {
    const b = Buffer.alloc(4)
    b.writeInt32BE(a | 0)
    return { tag: 'i', buf: b }
  }
  const b = Buffer.alloc(4)
  b.writeFloatBE(a)
  return { tag: 'f', buf: b }
}
function encodeMessage(address, args) {
  const parts = (args || []).map(encArg)
  const tags = ',' + parts.map((p) => p.tag).join('')
  return Buffer.concat([
    encString(address),
    encString(tags),
    ...parts.map((p) => p.buf),
  ])
}

// ---------- OSC decode ----------
function readString(buf, off) {
  let end = off
  while (end < buf.length && buf[end] !== 0) end++
  const s = buf.toString('utf8', off, end)
  let next = end + 1
  next += padLen(next - off === 0 ? 0 : next - off) // align to 4 from message start? handled below
  return { s, next }
}
// Proper 4-byte alignment relative to packet start.
function readStringAligned(buf, off) {
  let end = off
  while (end < buf.length && buf[end] !== 0) end++
  const s = buf.toString('utf8', off, end)
  let next = end + 1
  while (next % 4 !== 0) next++
  return { s, next }
}
function decodePacket(buf, out) {
  if (buf.length >= 8 && buf.toString('ascii', 0, 8) === '#bundle\0') {
    // skip 8-byte tag + 8-byte timetag, then [int32 size][element]...
    let off = 16
    while (off + 4 <= buf.length) {
      const size = buf.readInt32BE(off)
      off += 4
      decodePacket(buf.slice(off, off + size), out)
      off += size
    }
    return out
  }
  let p = 0
  const a = readStringAligned(buf, p)
  const address = a.s
  p = a.next
  let args = []
  if (buf[p - (p % 4 === 0 ? 0 : 0)] !== undefined && buf.toString('ascii', p, p + 1) === ',') {
    const t = readStringAligned(buf, p)
    const tags = t.s.slice(1)
    p = t.next
    for (const tag of tags) {
      if (tag === 'i') {
        args.push(buf.readInt32BE(p))
        p += 4
      } else if (tag === 'f') {
        args.push(buf.readFloatBE(p))
        p += 4
      } else if (tag === 's') {
        const r = readStringAligned(buf, p)
        args.push(r.s)
        p = r.next
      } else if (tag === 'b') {
        const len = buf.readInt32BE(p)
        p += 4
        args.push(buf.slice(p, p + len))
        p += len
        while (p % 4 !== 0) p++
      }
    }
  }
  out.push({ address, args })
  return out
}

// ---------- CLI ----------
const argv = process.argv.slice(2)
const opt = { to: 2346, listen: 2347, host: '127.0.0.1', connect: true, wait: 2500 }
const rest = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--to') opt.to = +argv[++i]
  else if (a === '--listen') opt.listen = +argv[++i]
  else if (a === '--host') opt.host = argv[++i]
  else if (a === '--connect') opt.connect = true
  else if (a === '--no-connect') opt.connect = false
  else if (a === '--wait') opt.wait = +argv[++i]
  else rest.push(a)
}
if (rest.length === 0) {
  console.error('usage: node tools/osc-probe.js [opts] <address> [args...]')
  process.exit(1)
}
const address = rest[0]
const sendArgs = rest.slice(1).map((s) => {
  if (/^-?\d+$/.test(s)) return parseInt(s, 10)
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s)
  return s
})

const sock = dgram.createSocket('udp4')
const t0 = Date.now()
function send(addr, args) {
  const buf = encodeMessage(addr, args)
  sock.send(buf, opt.to, opt.host)
  console.log(`SENT  ${addr} ${JSON.stringify(args || [])} -> ${opt.host}:${opt.to}`)
}

sock.on('message', (msg, rinfo) => {
  let parsed = []
  try {
    decodePacket(msg, parsed)
  } catch (e) {
    console.log(`RECV  <undecodable ${msg.length}B from ${rinfo.address}:${rinfo.port}>: ${e}`)
    return
  }
  const dt = Date.now() - t0
  for (const m of parsed) {
    console.log(`RECV  +${dt}ms  ${m.address} ${JSON.stringify(m.args)}`)
  }
})

sock.on('error', (e) => {
  console.error('socket error:', e.message)
  process.exit(1)
})

sock.bind(opt.listen, () => {
  console.log(`listening on 0.0.0.0:${opt.listen}`)
  if (opt.connect) send('/connect', [`${opt.host}:${opt.listen}`])
  setTimeout(() => send(address, sendArgs), opt.connect ? 150 : 0)
  setTimeout(() => {
    console.log(`done (waited ${opt.wait}ms)`)
    sock.close()
    process.exit(0)
  }, opt.wait + (opt.connect ? 150 : 0))
})
