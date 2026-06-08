// Shared OSC codec + async UDP client — the host-side seed of the app emulator.
// Dep-free. encode/decode are pure (Buffer in/out); OscClient wraps dgram with
// a timestamped message log and a waitFor() so tests can express request/reply.
//
// NOTE: this codec speaks plain OSC. The device's batch (/batch JSON), chunk
// (/start+/chunk+/end) and columnar (/columnar) transforms are app-opt-in via
// capabilities — declare none (version-only /syn) and the device sends plain
// messages this decoder reads directly. Reassembly/disassembly of those
// transforms is the next emulator layer (shared with the RN app's decode).

const dgram = require('dgram')

// ---------- encode ----------
function encString(s) {
  const b = Buffer.from(String(s), 'utf8')
  return Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) // >=1 null, pad to 4
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
  return Buffer.concat([
    encString(address),
    encString(',' + parts.map((p) => p.tag).join('')),
    ...parts.map((p) => p.buf),
  ])
}

// ---------- decode ----------
function readStr(buf, off) {
  let end = off
  while (end < buf.length && buf[end] !== 0) end++
  const s = buf.toString('utf8', off, end)
  let next = end + 1
  while (next % 4 !== 0) next++
  return [s, next]
}
function decodePacket(buf, out) {
  out = out || []
  if (buf.length >= 8 && buf.toString('ascii', 0, 7) === '#bundle') {
    let off = 16 // 8-byte "#bundle\0" + 8-byte timetag
    while (off + 4 <= buf.length) {
      const size = buf.readInt32BE(off)
      off += 4
      decodePacket(buf.slice(off, off + size), out)
      off += size
    }
    return out
  }
  let p = 0
  let address
  ;[address, p] = readStr(buf, 0)
  const args = []
  if (p < buf.length && buf[p] === 0x2c /* ',' */) {
    let tags
    ;[tags, p] = readStr(buf, p)
    for (const tag of tags.slice(1)) {
      if (tag === 'i') (args.push(buf.readInt32BE(p)), (p += 4))
      else if (tag === 'f') (args.push(buf.readFloatBE(p)), (p += 4))
      else if (tag === 's') {
        let s
        ;[s, p] = readStr(buf, p)
        args.push(s)
      } else if (tag === 'b') {
        const len = buf.readInt32BE(p)
        p += 4
        args.push(buf.slice(p, p + len))
        p += len + ((4 - (len % 4)) % 4)
      } else if (tag === 'T') args.push(true)
      else if (tag === 'F') args.push(false)
    }
  }
  out.push({ address, args })
  return out
}

// ---------- async client ----------
class OscClient {
  constructor(opts) {
    opts = opts || {}
    this.host = opts.host || '127.0.0.1'
    this.sendPort = opts.sendPort || 2346
    this.listenPort = opts.listenPort || 9000
    this.log = [] // {t, address, args}
    this.waiters = []
    this.t0 = Date.now()
    this.sock = dgram.createSocket('udp4')
    this.sock.on('message', (msg) => {
      let parsed
      try {
        parsed = decodePacket(msg)
      } catch (e) {
        return
      }
      for (const m of parsed) {
        const rec = { t: Date.now() - this.t0, address: m.address, args: m.args }
        this.log.push(rec)
        for (const w of this.waiters.slice()) w(rec)
      }
    })
  }
  bind() {
    return new Promise((res, rej) => {
      this.sock.once('error', rej)
      this.sock.bind(this.listenPort, res)
    })
  }
  now() {
    return Date.now() - this.t0
  }
  since() {
    return this.log.length
  }
  send(address, args) {
    this.sock.send(encodeMessage(address, args || []), this.sendPort, this.host)
  }
  // Resolve with the first logged message (from fromIndex onward, incl. already
  // received) matching pred, or null on timeout.
  waitFor(pred, timeoutMs, fromIndex) {
    timeoutMs = timeoutMs || 1500
    for (let i = fromIndex || 0; i < this.log.length; i++) {
      if (pred(this.log[i])) return Promise.resolve(this.log[i])
    }
    return new Promise((resolve) => {
      let done = false
      const cleanup = () => {
        clearTimeout(timer)
        this.waiters = this.waiters.filter((x) => x !== w)
      }
      const w = (rec) => {
        if (!done && pred(rec)) {
          done = true
          cleanup()
          resolve(rec)
        }
      }
      const timer = setTimeout(() => {
        if (!done) {
          done = true
          cleanup()
          resolve(null)
        }
      }, timeoutMs)
      this.waiters.push(w)
    })
  }
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }
  close() {
    this.sock.close()
  }
}

module.exports = { encodeMessage, decodePacket, OscClient }
