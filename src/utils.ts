import { DEFAULT_COLOR, MAX_SENDS, OUTLET_OSC } from './consts'

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

export function cleanArr(arr: IdObserverArg) {
  if (!arr) {
    return []
  }
  return arr.filter((e: any) => {
    return parseInt(e).toString() === e.toString()
  }) as IdArr
}
