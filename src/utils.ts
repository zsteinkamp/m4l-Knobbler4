export type logFn = (_: any) => void
export function logFactory({ outputLogs = true }) {
  function log(_: any) {
    post(Array.prototype.slice.call(arguments).join(' '), '\n')
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
  let retString = parseInt(colorVal).toString(16).toUpperCase()
  const strlen = retString.length
  for (let i = 0; i < 6 - strlen; i++) {
    retString = '0' + retString
  }
  return retString
}

const tasks: Record<string, Task[]> = {}
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
    tasks[key][slot] = null
  }
  tasks[key][slot] = task
  tasks[key][slot].schedule(delayMs)
}
