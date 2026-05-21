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

const _settingsDict: any = new Dict('settingsDict')
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

// Reusable outlet arrays. Numeric fast-path uses [addr, val] — udpsend handles
// numeric atoms cleanly with no symbol-table interaction. Non-numeric payloads
// (strings, objects, arrays) go through buildOscPacket() and emit as raw OSC
// packet bytes via udpsend's `rawbytes` message, bypassing its OSC formatter so
// the payload never becomes a Max atom.
const oscOut: any[] = [null, null]
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
  if (typeof val === 'number') {
    oscOut[0] = addr
    oscOut[1] = val !== (val | 0) ? Math.round(val * 1000000) / 1000000 : val
    outlet(OUTLET_OSC, oscOut)
    return
  }
  const bytes = buildOscPacket(addr, val)
  oscRawOut.length = 1
  for (let i = 0; i < bytes.length; i++) oscRawOut.push(bytes[i])
  outlet(OUTLET_OSC, oscRawOut)
}

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

const CHUNK_MAX_BYTES = 1024

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}

export function sendChunkedData(prefix: string, items: any[]) {
  const caps = loadSetting('clientCapabilities')
  const chunked =
    caps && (' ' + caps.toString() + ' ').indexOf(' cNav ') !== -1
  if (chunked) {
    osc(prefix + '/start', items.length)
    let chunkItems: any[] = []
    let chunkSize = 2
    let allParts: string[] = []
    for (let i = 0; i < items.length; i++) {
      const itemJson = JSON.stringify(items[i])
      allParts.push(itemJson)
      const added = (chunkItems.length > 0 ? 1 : 0) + itemJson.length
      if (chunkItems.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
        osc(prefix + '/chunk', chunkItems)
        chunkItems = []
        chunkSize = 2
      }
      chunkItems.push(items[i])
      chunkSize += added
    }
    if (chunkItems.length > 0) {
      osc(prefix + '/chunk', chunkItems)
    }
    const checksum = simpleHash('[' + allParts.join(',') + ']')
    osc(prefix + '/end', checksum)
  }
  if (!chunked) {
    osc(prefix, items)
  }
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
