import { DEFAULT_COLOR, MAX_SENDS, OUTLET_OSC } from './consts'

// Safely tear down a LiveAPI observer: unsubscribe from property notifications
// before detaching, to prevent callbacks firing on invalidated objects
// (which can crash SpiderMonkey via JS_EncodeString null pointer).
export function detach(api: LiveAPI) {
  if (!api) return
  api.property = ''
  api.id = 0
}

export type logFn = (...args: any[]) => void
export function logFactory({ outputLogs = true }) {
  function log(...args: any[]) {
    post(
      args
        .map((a) => {
          return typeof a === 'string' ? a : JSON.stringify(a)
        })
        .join(' '),
      '\n'
    )
  }
  if (!outputLogs) {
    return () => {}
  }
  return log as logFn
}

// Format a float for LiveAPI.call() which stringifies args internally.
// Avoids scientific notation (e.g. 7.26e-05) which LiveAPI can't parse.
export function fixFloat(val: number): string {
  return val.toFixed(10)
}

export function dequote(str: string) {
  //log(str, typeof str)
  return str.toString().replace(/^"|"$/g, '')
}

export function isValidPath(path: string) {
  return typeof path === 'string' && path.match(/^live_set /)
}

export function colorToString(colorVal: string) {
  if (!colorVal) {
    return DEFAULT_COLOR
  }
  let retString = parseInt(colorVal.toString()).toString(16).toUpperCase()
  const strlen = retString.length
  for (let i = 0; i < 6 - strlen; i++) {
    retString = '0' + retString
  }
  return retString
}

export function truncate(str: string, len: number) {
  //post('IN TRUNCATE ' + JSON.stringify({ str, len }) + '\n')
  if (str.length < len) {
    return str
  }
  return str.substring(0, len - 2) + '…'
}

export function isDeviceSupported(obj: LiveAPI) {
  return !!obj.info.match(/property/)
}

const tasks: Record<string, MaxTask[]> = {}
export function debouncedTask(
  key: 'sendVal' | 'allowUpdates' | 'allowMapping' | 'allowUpdateFromOsc',
  slot: number,
  task: Task,
  delayMs: number
) {
  if (!tasks[key]) {
    tasks[key] = []
  }
  if (tasks[key][slot]) {
    tasks[key][slot].cancel()
    tasks[key][slot].freepeer()
    tasks[key][slot] = null
  }
  tasks[key][slot] = task as MaxTask
  tasks[key][slot].schedule(delayMs)
}

// Cross-instance RUNTIME store (clientCapabilities, visibleTracks) — re-derived
// each session, never persisted. Named (not ---) so every module's utils
// instance shares it. Deliberately NOT 'settingsDict': that name now belongs to
// the re-added parameter-enabled [dict settingsDict] (the legacy-set bridge,
// read via a single ref in k4-settings) — pointing utils' ~15 instances at a
// parameter-enabled dict would risk the new-Dict-resets-contents gotcha.
const _settingsDict: any = new Dict('k4Runtime')
let _instancePrefix = ''

export function setDictPrefix(prefix: any) {
  _instancePrefix = String(prefix) + '_'
}

export function saveSetting(key: string, value: any) {
  _settingsDict.set(key, value)
}

export function loadSetting(key: string): any {
  return _settingsDict.get(key)
}

export function saveInstanceSetting(key: string, value: any) {
  _settingsDict.set(_instancePrefix + key, value)
}

export function loadInstanceSetting(key: string): any {
  return _settingsDict.get(_instancePrefix + key)
}

export type TrackInfo = {
  id: number
  type: number
  name: string
  color: string
  path: string
  parentId: number
}

// Cached typed accessor for the shared visibleTracks dict entry. Each [v8]
// module has its own utils instance (Max require() does not cache modules),
// so the cache is per-consumer. A version counter stored alongside the JSON
// payload keeps consumers in sync with the producer without re-parsing on
// every call.
let _visibleTracksCache: TrackInfo[] = null
let _visibleTracksCacheVersion: number = -1

const VISIBLE_TRACKS_VERSION_MOD = 1048576
export function setVisibleTracks(value: TrackInfo[]) {
  _settingsDict.set('visibleTracks', JSON.stringify(value))
  const prev = parseInt(_settingsDict.get('visibleTracksVersion')) || 0
  const next = (prev + 1) % VISIBLE_TRACKS_VERSION_MOD
  _settingsDict.set('visibleTracksVersion', next)
  _visibleTracksCache = value
  _visibleTracksCacheVersion = next
}

export function getVisibleTracksList(): TrackInfo[] {
  const version = parseInt(_settingsDict.get('visibleTracksVersion')) || 0
  if (_visibleTracksCache && version === _visibleTracksCacheVersion) {
    return _visibleTracksCache
  }
  const raw = _settingsDict.get('visibleTracks')
  if (!raw) {
    _visibleTracksCache = []
    _visibleTracksCacheVersion = version
    return _visibleTracksCache
  }
  try {
    _visibleTracksCache = JSON.parse(raw.toString())
  } catch (e) {
    _visibleTracksCache = []
  }
  _visibleTracksCacheVersion = version
  return _visibleTracksCache
}


export function meterVal(raw: any): number {
  return Math.round((parseFloat(raw) || 0) * 100) / 100
}

// [udpsend]'s `rawbytes` message — which lets us ship a JS-built OSC packet as
// a byte list (no string interning, no app-side crash) — only exists in Max
// 9.1.0+ (Live 12.4+). Below that, `rawbytes` is OSC-formatted as a literal
// address and crashes the app's parser. So gate on the Max version and fall
// back to native `addr value` sends (which intern strings, but never crash).
//
// max.version concatenates each version component as a single hex char (Max
// 4.5.1 -> "451", 9.0.10 -> "90a", 9.1.0 -> "910"). So compare major/minor by
// position — NOT parseInt the whole string, which would mis-read a hex patch
// (e.g. parseInt("91a") = 91). rawbytes (udpsend) needs >= 9.1.0; default to
// native (the safe path — no crash) if the version can't be read.
export const RAWBYTES_OK: boolean = (function () {
  try {
    const s = String(max.version)
    const major = parseInt(s.charAt(0), 16)
    const minor = parseInt(s.charAt(1), 16)
    if (isNaN(major) || isNaN(minor)) {
      return false
    }
    return major > 9 || (major === 9 && minor >= 1)
  } catch (e) {
    return false
  }
})()
export const MAX_VERSION_RAW: string = (function () {
  try {
    return String(max.version)
  } catch (e) {
    return '(unknown)'
  }
})()

// Reusable output arrays for the fallback path (osc() with no sink wired — only
// hit pre-init/standalone). rawbytes ships the JS-built packet; native sends the
// address + value for [udpsend] to format. The primary path is k4-oscBatch.send.
const oscRawOut: any[] = ['rawbytes']

// OSC output sink — the orchestrator's oscBatch singleton, reached via ctx.
// Each module wires its own utils instance in init() with setOscSink(ctx.osc):
// Max require() does NOT cache modules, so every file gets its OWN utils
// instance with its own `oscSink`, and each must be pointed at the one shared
// oscBatch.send the entry put on ctx. When unset (standalone tools, or before
// init) osc() falls back to emitting directly to OUTLET_OSC.
let oscSink: ((addr: string, val: any) => void) | null = null
export function setOscSink(fn: (addr: string, val: any) => void) {
  oscSink = fn
}

export function osc(addr: string, val: any) {
  if (oscSink) {
    oscSink(addr, val)
    return
  }
  // Fallback (no sink wired): emit straight to [udpsend], matching the oscBatch
  // sink's version-gated behavior.
  const v =
    typeof val === 'number' && val !== (val | 0)
      ? Math.round(val * 1000000) / 1000000
      : val
  if (RAWBYTES_OK) {
    const bytes = buildOscPacket(addr, v)
    oscRawOut.length = 1
    for (let i = 0; i < bytes.length; i++) {
      oscRawOut.push(bytes[i])
    }
    outlet(OUTLET_OSC, oscRawOut)
  } else if (v === undefined) {
    outlet(OUTLET_OSC, addr) // bare address, no arg
  } else if (typeof v === 'object' && v !== null) {
    outlet(OUTLET_OSC, addr, JSON.stringify(v))
  } else {
    outlet(OUTLET_OSC, addr, v)
  }
}

// Build an OSC packet (address + single arg) as a flat array of byte values
// (0..255), handed to the [node.script] sender to transmit as a raw UDP
// datagram. Building the wire packet in JS keeps the payload out of Max's atom
// system entirely, avoiding the symbol-table bloat that emitting string args
// to a Max object would otherwise create by gensym'ing them.
//
// Arg encoding inferred from JS value type:
//   number (integer in int32 range)  → 'i', 4 bytes big-endian
//   number (other)                   → 'f', 4 bytes big-endian
//   string                           → 's', null-terminated, padded to 4
//   object / array / null / undefined → 's' with JSON.stringify (or 'null')
const _f32buf = new ArrayBuffer(4)
const _f32view = new DataView(_f32buf)
const _f32bytes = new Uint8Array(_f32buf)

// Append `str` to `out` as UTF-8 bytes. The OSC wire format is bytes, and the
// app decodes strings as UTF-8 — so a non-ASCII char (e.g. "Ā" U+0100, accents,
// emoji, CJK) must be encoded to its multi-byte UTF-8 sequence. The old
// `charCodeAt(i) & 0xff` truncated each UTF-16 unit to one byte, which both
// corrupted the text AND could emit a stray 0x00 (any U+xx00) that prematurely
// terminates the null-terminated OSC string — desyncing the whole packet.
function pushUtf8(out: number[], str: string): void {
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    // Combine a UTF-16 surrogate pair into a single code point.
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00)
        i++
      }
    }
    if (c < 0x80) {
      out.push(c)
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f)
      )
    }
  }
}

export function buildOscPacket(addr: string, value: any): number[] {
  // No-arg OSC message (value omitted): just the address + an empty type-tag
  // string ",". Used for bare control sends like /page/X and /loop.
  if (value === undefined) {
    const noArg: number[] = []
    for (let i = 0; i < addr.length; i++) noArg.push(addr.charCodeAt(i) & 0xff)
    noArg.push(0)
    while (noArg.length & 0x3) noArg.push(0)
    noArg.push(0x2c, 0, 0, 0) // "," null + pad, no arg bytes
    return noArg
  }

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
  pushUtf8(out, addr)
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
    pushUtf8(out, strVal)
    out.push(0)
    while (out.length & 0x3) out.push(0)
  }

  return out
}

export type PauseState = { paused: boolean; task: MaxTask }

export function pauseUnpause(p: PauseState, delayMs: number) {
  if (p.task) {
    p.task.cancel()
  } else {
    p.task = new Task(() => {
      p.paused = false
    }) as MaxTask
  }
  p.paused = true
  p.task.schedule(delayMs)
}

// Pre-computed OSC address strings for sends
export const SEND_ADDR: string[] = []
for (let _i = 0; _i < MAX_SENDS; _i++) {
  SEND_ADDR[_i] = '/mixer/send' + (_i + 1)
}

export function numArrToJson(arr: number[]): string {
  return '[' + arr.join(',') + ']'
}

// Chunking now lives in the outbound pipeline (k4-oscBatch): callers just
// osc(addr, array) and large arrays are split transparently. simpleHash is the
// chunk checksum, exported for that stage (and matched by the app).
export function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}

// Filter an id-observer arg down to its numeric ids, returning them AS
// numbers. The arg comes from LiveAPI as strings (e.g. ["id", "42", "id",
// "55"]); each numeric-looking string round-trips through parseInt and the
// rest are dropped. Returning numbers (matching the declared IdArr type) is
// required by [v8]'s LiveAPI .id setter, which rejects strings.
export function cleanArr(arr: IdObserverArg): IdArr {
  if (!arr) return []
  const out: number[] = []
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i]
    const n = parseInt(e as any)
    if (!isNaN(n) && n.toString() === (e as any).toString()) {
      out.push(n)
    }
  }
  return out
}
