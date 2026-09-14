#!/usr/bin/env node
// pcap-decode — summarize a packet capture of Knobbler OSC traffic between the
// app and the device. Built to answer "is the device even sending X?" without a
// rebuild: it found the /syn handshake carrying a stale capability list, which
// was why background prefetch never started.
//
// Capture (needs root; press Ctrl+C when done):
//   sudo tcpdump -i any -n -s 0 -w /tmp/k4.pcap 'udp port 2346 or udp port 2347'
// Decode (no root needed):
//   node tools/pcap-decode.js /tmp/k4.pcap
//
// Prints:
//   - packet and flow counts (device receives on 2346, the app on 2347)
//   - a timeline of the handshake (/syn, /ping, /ack, /pong — with the
//     capability lists), /connect, /mixerView, /clipView, page changes, and any
//     prefetch or /clips/dims traffic
//   - every chunked transfer (/<prefix>/start … /chunk … /end) from the device,
//     with the key it carried (for /columnar) and whether it arrived intact
//   - message counts per address in each direction, with /batch expanded into
//     its keys and /mixer/<N>/ folded together
//
// Reads pcapng (what macOS tcpdump writes). Finds IPv4/UDP inside any link
// layer, so captures on `-i any`, en0 or lo0 all work. OSC decoding reuses
// tools/osc.js, which reads plain OSC; batch, chunk and columnar envelopes are
// recognized here, not fully reassembled.

const fs = require('fs')
const { decodePacket } = require('./osc')

const PORTS = [2346, 2347]

const file = process.argv[2]
if (!file) {
  console.error('usage: node tools/pcap-decode.js <capture.pcap>')
  process.exit(1)
}
const buf = fs.readFileSync(file)

// ---------- pcapng → UDP payloads ----------

const packets = [] // { t, src, dst, sport, dport, frag, payload }
let off = 0
let le = true
while (off + 12 <= buf.length) {
  // A Section Header Block declares the byte order of everything after it.
  if (buf.readUInt32LE(off) === 0x0a0d0d0a) {
    le = buf.readUInt32LE(off + 8) === 0x1a2b3c4d
  }
  const rd = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  const type = rd(off)
  const len = rd(off + 4)
  if (len < 12 || off + len > buf.length) break
  if (type === 6) {
    // Enhanced Packet Block
    const t = (rd(off + 12) * 4294967296 + rd(off + 16)) / 1e6
    const capLen = rd(off + 20)
    parseFrame(buf.slice(off + 28, off + 28 + capLen), t)
  }
  off += len
}

// Scan for an IPv4 header carrying UDP to or from a Knobbler port, rather than
// decoding each link type.
function parseFrame(data, t) {
  for (let i = 0; i + 28 <= data.length; i++) {
    if (data[i] >> 4 !== 4) continue
    const ihl = (data[i] & 0x0f) * 4
    if (ihl < 20 || data[i + 9] !== 17) continue
    const totalLen = data.readUInt16BE(i + 2)
    if (totalLen < ihl + 8 || i + totalLen > data.length) continue
    const u = i + ihl
    const sport = data.readUInt16BE(u)
    const dport = data.readUInt16BE(u + 2)
    if (!PORTS.includes(sport) && !PORTS.includes(dport)) continue
    const flagsFrag = data.readUInt16BE(i + 6)
    const ip = (o) => `${data[o]}.${data[o + 1]}.${data[o + 2]}.${data[o + 3]}`
    packets.push({
      t,
      src: ip(i + 12),
      dst: ip(i + 16),
      sport,
      dport,
      frag: (flagsFrag & 0x2000) !== 0 || (flagsFrag & 0x1fff) !== 0,
      payload: data.slice(u + 8, i + totalLen),
    })
    return
  }
}

// ---------- OSC summary ----------

const t0 = packets.length ? packets[0].t : 0
const fmt = (t) => (t - t0).toFixed(3).padStart(8)

console.log(
  `packets: ${packets.length}, fragmented: ${packets.filter((p) => p.frag).length}`
)
const flows = {}
for (const p of packets) {
  const k = `${p.src}:${p.sport} -> ${p.dst}:${p.dport}`
  flows[k] = (flows[k] || 0) + 1
}
console.log('flows:', flows)

const toApp = {}
const toDevice = {}
const timeline = []
const transfers = {} // prefix -> in-progress chunked transfer
const finished = []

const TIMELINE =
  /^\/(syn|ping|ack|pong|connect|btnRefresh|requestVisibleTracks|mixerView|clipView|page\/|sceneRename|sceneColor|clipColor|requestClipsScenes)/

for (const p of packets) {
  let msgs
  try {
    msgs = decodePacket(p.payload)
  } catch (e) {
    timeline.push(`${fmt(p.t)} UNDECODABLE ${p.payload.length}b`)
    continue
  }
  const toDev = p.dport === 2346
  const counts = toDev ? toDevice : toApp
  const arrow = toDev ? 'app->dev' : 'dev->app'
  for (const m of msgs) {
    const a = m.address
    const arg0 = m.args[0]

    // What this message really carries: /batch holds several addresses, and a
    // /columnar envelope names its address as the first item.
    let keys = [a]
    let label = a
    let shown = arg0 === undefined ? '' : JSON.stringify(arg0).slice(0, 160)
    if (a === '/batch' && typeof arg0 === 'string') {
      try {
        keys = Object.keys(JSON.parse(arg0))
      } catch {
        keys = ['/batch (bad json)']
      }
    } else if (a === '/columnar' && typeof arg0 === 'string') {
      try {
        const arr = JSON.parse(arg0)
        label = `${arr[0]} (columnar)`
        keys = [label]
        shown = `${arr.length - 2} rows`
      } catch {
        keys = ['/columnar (bad json)']
      }
    }
    for (const k of keys) {
      const folded = k.replace(/\/mixer\/\d+\//, '/mixer/N/')
      counts[folded] = (counts[folded] || 0) + 1
    }

    if (TIMELINE.test(a) || /prefetch|dims|\/clips\/scenes/.test(label)) {
      timeline.push(`${fmt(p.t)} ${arrow} ${label} ${shown}`)
    }

    const cm = a.match(/^(.+)\/(start|chunk|end)$/)
    if (!cm || toDev) continue
    const [, prefix, part] = cm
    if (part === 'start') {
      if (transfers[prefix]) {
        finished.push({
          prefix,
          ...transfers[prefix],
          status: 'INTERRUPTED by a new start',
        })
      }
      transfers[prefix] = { t: p.t, count: arg0, chunks: 0, items: 0, key: null }
    } else if (part === 'chunk') {
      const tr = transfers[prefix]
      if (!tr) {
        finished.push({ prefix, t: p.t, status: 'CHUNK WITHOUT START' })
        continue
      }
      tr.chunks++
      try {
        const items = JSON.parse(arg0)
        // A /columnar payload is [ key, columns, ...rows ]: the first chunk's
        // first item names what it carries.
        if (tr.chunks === 1 && typeof items[0] === 'string') tr.key = items[0]
        tr.items += items.length
      } catch {
        tr.bad = true
      }
    } else {
      const tr = transfers[prefix]
      if (!tr) {
        finished.push({ prefix, t: p.t, status: 'END WITHOUT START' })
        continue
      }
      let status = 'ok'
      if (tr.bad) status = 'UNPARSEABLE CHUNK'
      else if (tr.items !== tr.count) status = `COUNT MISMATCH items=${tr.items}`
      finished.push({ prefix, ...tr, status })
      delete transfers[prefix]
    }
  }
}
for (const prefix in transfers) {
  finished.push({ prefix, ...transfers[prefix], status: 'NEVER ENDED' })
}

console.log('\n--- timeline (handshake / windows / pages / prefetch) ---')
console.log(timeline.join('\n'))

console.log('\n--- chunked transfers dev->app ---')
for (const f of finished) {
  console.log(
    `${fmt(f.t)} ${f.prefix} key=${f.key || '-'} count=${f.count} chunks=${f.chunks} ${f.status}`
  )
}

const byCount = (o) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${String(v).padStart(6)} ${k}`)
    .join('\n')
console.log('\n--- dev->app addresses ---\n' + byCount(toApp))
console.log('\n--- app->dev addresses ---\n' + byCount(toDevice))
