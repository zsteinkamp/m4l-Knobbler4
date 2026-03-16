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

const SETTINGS_DICT_NAME = 'settingsDict'

export function saveSetting(key: string, value: any) {
  const d = new Dict(SETTINGS_DICT_NAME)
  d.set(key, value)
}

export function loadSetting(key: string): any {
  const d = new Dict(SETTINGS_DICT_NAME)
  return d.get(key)
}

export function meterVal(raw: any): number {
  return Math.round((parseFloat(raw) || 0) * 100) / 100
}

const oscOut: any[] = [null, null]
export function osc(addr: string, val: any) {
  oscOut[0] = addr
  oscOut[1] = val
  outlet(OUTLET_OSC, oscOut)
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
    outlet(OUTLET_OSC, [prefix + '/start', items.length])
    let chunkParts: string[] = []
    let chunkSize = 2
    let allParts: string[] = []
    for (let i = 0; i < items.length; i++) {
      const itemJson = JSON.stringify(items[i])
      allParts.push(itemJson)
      const added = (chunkParts.length > 0 ? 1 : 0) + itemJson.length
      if (chunkParts.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
        outlet(OUTLET_OSC, [prefix + '/chunk', '[' + chunkParts.join(',') + ']'])
        chunkParts = []
        chunkSize = 2
      }
      chunkParts.push(itemJson)
      chunkSize += added
    }
    if (chunkParts.length > 0) {
      outlet(OUTLET_OSC, [prefix + '/chunk', '[' + chunkParts.join(',') + ']'])
    }
    const checksum = simpleHash('[' + allParts.join(',') + ']')
    outlet(OUTLET_OSC, [prefix + '/end', checksum])
  }
  if (!chunked) {
    outlet(OUTLET_OSC, [prefix, JSON.stringify(items)])
  }
}

export function cleanArr(arr: IdObserverArg) {
  if (!arr) {
    return []
  }
  return arr.filter((e: any) => {
    return parseInt(e).toString() === e.toString()
  }) as IdArr
}
