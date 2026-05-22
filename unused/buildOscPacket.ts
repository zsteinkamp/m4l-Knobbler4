// Build an OSC packet (address + single arg) as a flat array of byte values
// (0..255), suitable for outlet to [udpsend]'s `rawbytes` message. Building
// the wire packet in JS keeps the payload out of Max's atom system entirely,
// avoiding the symbol-table bloat that [udpsend]'s default OSC formatter
// would otherwise create when gensym'ing string args.
//
// Arg encoding inferred from JS value type:
//   number (integer in int32 range)  → 'i', 4 bytes big-endian
//   number (other)                   → 'f', 4 bytes big-endian
//   string                           → 's', null-terminated, padded to 4
//   object / array / null / undefined → 's' with JSON.stringify (or 'null')
const _f32buf = new ArrayBuffer(4)
const _f32view = new DataView(_f32buf)
const _f32bytes = new Uint8Array(_f32buf)

export function buildOscPacket(addr: string, value: any): number[] {
  let tag: string
  let intVal = 0
  let floatVal = 0
  let strVal = ''
  if (typeof value === 'number') {
    if ((value | 0) === value && value >= -2147483648 && value <= 2147483647) {
      tag = 'i'
      intVal = value
    } else {
      tag = 'f'
      floatVal = value
    }
  } else if (typeof value === 'string') {
    tag = 's'
    strVal = value
  } else if (value === null || value === undefined) {
    tag = 's'
    strVal = String(value)
  } else {
    tag = 's'
    strVal = JSON.stringify(value)
  }

  const out: number[] = []

  // address, null-terminated, padded to 4-byte boundary
  for (let i = 0; i < addr.length; i++) out.push(addr.charCodeAt(i) & 0xff)
  out.push(0)
  while (out.length & 0x3) out.push(0)

  // type tag string ",X" — 2 chars + null + 1 pad = 4 bytes, already aligned
  out.push(0x2c, tag.charCodeAt(0), 0, 0)

  // arg
  if (tag === 'i') {
    out.push(
      (intVal >>> 24) & 0xff,
      (intVal >>> 16) & 0xff,
      (intVal >>> 8) & 0xff,
      intVal & 0xff
    )
  } else if (tag === 'f') {
    _f32view.setFloat32(0, floatVal, false)
    out.push(_f32bytes[0], _f32bytes[1], _f32bytes[2], _f32bytes[3])
  } else {
    for (let i = 0; i < strVal.length; i++)
      out.push(strVal.charCodeAt(i) & 0xff)
    out.push(0)
    while (out.length & 0x3) out.push(0)
  }

  return out
}
