import { DEFAULT_COLOR } from './consts'

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

export function cleanArr(arr: IdObserverArg) {
  if (!arr) {
    return []
  }
  return arr.filter((e: any) => {
    return parseInt(e).toString() === e.toString()
  }) as IdArr
}
