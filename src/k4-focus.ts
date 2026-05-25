// Knobbler's "current target" — the single source of truth for which track and
// device the device-control surface points at. This may differ from Live's
// `selected_track` / `selected_device` when UNLOCKED.
//
// Two modes:
//   locked (default)  — bidirectional sync with Live's selection (legacy
//                       behavior). trackPath()/devicePath() return Live's
//                       selection paths, so observers bound to them auto-follow;
//                       selectTrack/selectDevice write Live's selection.
//   unlocked          — Knobbler holds its own pointer. Navigating inside
//                       Knobbler retargets this pointer WITHOUT touching Live's
//                       selection. Observers bind by id and re-point on the
//                       focus-change emit. The pointer persists as canonical
//                       PATHS (positional, like the mapped-slot paths) so it
//                       survives set reloads; resolved to ids for live binding.
//
// Reached by other modules via ctx.focus (never a direct import — require()
// doesn't share module state across files in [v8]; see CLAUDE.md).

import config from './k4-config'
import { logFactory, setOscSink, osc } from './utils'
import { noFn } from './consts'

const log = logFactory(config)

// Live's selection paths — the bind targets while locked.
const SEL_TRACK = 'live_set view selected_track'
const SEL_DEVICE = 'live_set view selected_track view selected_device'

// Canonical track prefix of a device path, e.g.
// "live_set tracks 3 devices 1" → "live_set tracks 3"
const TRACK_PATH_RE = /^(live_set (?:tracks \d+|return_tracks \d+|master_track))/

const KEY_LOCKED = 'focusLocked'
const KEY_TRACK = 'focusTrackPath'
const KEY_DEVICE = 'focusDevicePath'

let ctx: AppContext = null
let locked = true

// Unlocked pointer: canonical PATHS (persisted) + resolved ids (live binding).
// trackId === 0 means "no pinned track" → fall back to Live's selection path.
let trackId = 0
let deviceId = 0
let trackPathStr = ''
let devicePathStr = ''

type FocusListener = () => void
const listeners: FocusListener[] = []

// Scratch handle for path/id resolution (not an observer).
let scratch: LiveAPI = null
function getScratch(): LiveAPI {
  if (!scratch) scratch = new LiveAPI(noFn, 'live_set')
  return scratch
}

// True only if the LiveAPI currently points at a real device — guards against
// adopting a Track/Song that `view selected_device` can resolve to on a
// deviceless track. Excludes the known non-device types rather than allow-
// listing 'Device' (rack/instrument subtypes vary).
function isDevice(api: LiveAPI): boolean {
  const t = api.type as string
  return +api.id !== 0 && t !== 'Song' && t !== 'Track'
}

// Operational handle for writing Live's selection (locked mode).
let viewApi: LiveAPI = null
function getViewApi(): LiveAPI {
  if (!viewApi) viewApi = new LiveAPI(noFn, 'live_set view')
  return viewApi
}

export function init(c: AppContext): void {
  ctx = c
  setOscSink(c.osc)

  const savedLocked = c.settings.get(KEY_LOCKED)
  locked = savedLocked === null || savedLocked === undefined ? true : !!+savedLocked

  if (!locked) {
    restorePointer(c.settings.get(KEY_TRACK), c.settings.get(KEY_DEVICE))
  }
  // No emit() here: bluhand.init runs after us and binds its observers using
  // the current trackPath()/devicePath(), so they come up pointed correctly.
  pushLockState()
}

export function isLocked(): boolean {
  return locked
}

// Canonical, APPENDABLE path the "current track" should bind to (consumers may
// append ` mixer_device volume`, ` view selected_device`, etc.). Locked → Live's
// selection path (auto-follows). Unlocked → the pinned canonical path, falling
// back to Live's selection if nothing resolved.
export function trackPath(): string {
  if (locked || !trackPathStr) return SEL_TRACK
  return trackPathStr
}

// Canonical, APPENDABLE path the "current device" should bind to. Locked →
// Live's selection path. Unlocked → the pinned canonical path, or '' when the
// pinned track has no device (consumers must treat '' as "no device").
export function devicePath(): string {
  if (locked) return SEL_DEVICE
  return devicePathStr
}

// Make Knobbler's current track = trackId. Locked: write Live's selection (Live
// cascades back through the path-following observers). Unlocked: retarget the
// pointer + its remembered device, persist, and emit — no Live write.
export function selectTrack(id: number): void {
  if (locked) {
    getViewApi().set('selected_track', ['id', id])
    return
  }
  const s = getScratch()
  s.id = id
  if (+s.id === 0) return
  trackId = id
  trackPathStr = s.unquotedpath
  // Adopt the track's own remembered device (Live keeps this per-track even
  // when the track isn't globally selected), else clear the device. Guard: a
  // deviceless track's `view selected_device` can resolve to a non-device
  // (Track/Song) — never adopt that, or the device surface points at junk.
  s.path = trackPathStr + ' view selected_device'
  if (isDevice(s)) {
    deviceId = parseInt(s.id as any)
    devicePathStr = s.unquotedpath
  } else {
    deviceId = 0
    devicePathStr = ''
  }
  persist()
  emit()
}

// Make Knobbler's current device = deviceId. Locked: write Live's selection.
// Unlocked: retarget device + its parent track, persist, emit — no Live write.
export function selectDevice(id: number): void {
  if (locked) {
    getViewApi().call('select_device', ['id', id])
    return
  }
  const s = getScratch()
  s.id = id
  if (!isDevice(s)) return
  deviceId = id
  devicePathStr = s.unquotedpath
  const m = devicePathStr.match(TRACK_PATH_RE)
  if (m) {
    s.path = m[1]
    if (+s.id !== 0) {
      trackId = parseInt(s.id as any)
      trackPathStr = m[1]
    }
  }
  persist()
  emit()
}

// Lock toggle (OSC /focusLock from the app). Locking re-syncs to Live's current
// selection (path-following resumes); unlocking captures the current selection
// as the starting pointer. Both re-point dependent observers via emit().
export function lock(val: number): void {
  const next = !!val
  if (next === locked) {
    pushLockState()
    return
  }
  locked = next
  if (locked) {
    trackId = 0
    deviceId = 0
    trackPathStr = ''
    devicePathStr = ''
  } else {
    captureFromLiveSelection()
  }
  persist()
  emit()
  pushLockState()
}

export function onChange(cb: FocusListener): void {
  listeners.push(cb)
}

function emit(): void {
  for (const cb of listeners) cb()
}

// Seed the unlocked pointer from Live's current selection.
function captureFromLiveSelection(): void {
  const s = getScratch()
  s.path = SEL_TRACK
  trackId = +s.id === 0 ? 0 : parseInt(s.id as any)
  trackPathStr = trackId ? s.unquotedpath : ''
  s.path = SEL_DEVICE
  if (isDevice(s)) {
    deviceId = parseInt(s.id as any)
    devicePathStr = s.unquotedpath
  } else {
    deviceId = 0
    devicePathStr = ''
  }
}

// Resolve persisted paths back to ids. Positional paths can go stale across set
// edits; if the track path no longer resolves, fall back to Live's selection.
function restorePointer(tp: any, dp: any): void {
  const s = getScratch()
  if (tp) {
    s.path = String(tp)
    if (+s.id !== 0) {
      trackId = parseInt(s.id as any)
      trackPathStr = String(tp)
    }
  }
  if (dp) {
    s.path = String(dp)
    if (+s.id !== 0) {
      deviceId = parseInt(s.id as any)
      devicePathStr = String(dp)
    }
  }
  if (!trackId) captureFromLiveSelection()
}

function persist(): void {
  ctx.settings.set(KEY_LOCKED, locked ? 1 : 0)
  ctx.settings.set(KEY_TRACK, locked ? '' : trackPathStr)
  ctx.settings.set(KEY_DEVICE, locked ? '' : devicePathStr)
}

function pushLockState(): void {
  osc('/focusLock', locked ? 1 : 0)
}

const routes: Route[] = [{ prefix: '/focusLock', parse: 'val', fn: lock }]

log('reloaded k4-focus')

export { routes }
