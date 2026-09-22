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
import { apiId, apiValid } from './liveApi'
import { noFn } from './consts'

const log = logFactory(config)

// Live's selection paths — the bind targets while locked.
const SEL_TRACK = 'live_set view selected_track'

// Live has TWO "current device" pointers, and they DIVERGE inside racks:
//
//   live_set view selected_track view selected_device
//     the track's selected device. Clicking a CHAIN inside a rack leaves this
//     pointing at the rack, so the surface never follows the user into chains.
//   live_set appointed_device
//     the BLUE HAND — "the device used by a control surface unless the control
//     surface itself chooses which device to use" (LOM). This one DOES follow a
//     chain click, and it's the pointer the bluhand page is named after.
//
// The blue hand is only MAINTAINED when a control surface is configured in
// Live's Preferences. With zero surfaces, appointed_device still RESOLVES (it
// holds whatever was last appointed) but Live stops updating it on ordinary
// device selection — measured: with all Preferences slots set to None, clicking
// a device left appointed stale on the previous device while selected_device
// moved; only chain clicks still moved it. Binding to it there freezes the
// surface, so a "does it resolve?" test is NOT sufficient — we must gate on the
// control surface itself and fall back to selected_device (the legacy behavior)
// when there is none.
const SEL_DEVICE = 'live_set view selected_track view selected_device'
const APPOINTED_DEVICE = 'live_set appointed_device'

// Canonical track prefix of a device path, e.g.
// "live_set tracks 3 devices 1" → "live_set tracks 3"
const TRACK_PATH_RE =
  /^(live_set (?:tracks \d+|return_tracks \d+|master_track))/

const KEY_LOCKED = 'focusLocked'
const KEY_TRACK = 'focusTrackPath'
const KEY_DEVICE = 'focusDevicePath'

let ctx: AppContext = null
let locked = true

// Unlocked pointer: canonical PATHS (persisted), plus the resolved track id —
// the only id this module needs, as a "did anything pin?" flag. (There was a
// matching deviceId, but nothing ever read it; devicePathStr is the device
// pointer, and '' means "no device".)
let trackId = 0
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
  return apiValid(api) && t !== 'Song' && t !== 'Track'
}

// --- Which of Live's two device pointers we follow ---------------------------

// false = the track's selected_device (no blue hand available), true = the blue
// hand. Re-evaluated whenever the appointed device changes; a flip re-points
// every dependent observer via emit().
let useAppointed = false

// True when Live's Preferences hold at least one control surface — i.e. when the
// blue hand is actually being maintained. The list has one entry per Preferences
// slot and reads back like:
//
//   "id -1 id 0 id 0 id 0 id 0 id 0 id 0"   (one surface configured, in slot 1)
//   "id 0 id 0 id 0 id 0 id 0 id 0 id 0"    (none configured)
//
// An EMPTY slot is id 0. A CONFIGURED surface is not exposed as a LOM object, so
// it reads as id -1 rather than a real id — hence `!== 0`, not "is a valid id".
// The id-list read is a non-interning `get` (CLAUDE.md).
function controlSurfaceConfigured(): boolean {
  const s = getScratch()
  s.path = 'live_app'
  const cs: any = s.get('control_surfaces')
  if (!cs || !cs.length) return false
  for (let i = 0; i < cs.length; i++) {
    // The list interleaves the literal 'id' symbol with the numbers; parseInt
    // of 'id' is NaN, which fails the test below.
    const n = parseInt(cs[i])
    if (!isNaN(n) && n !== 0) return true
  }
  return false
}

// Does the blue hand currently point at a real device?
function appointedResolves(): boolean {
  const s = getScratch()
  s.path = APPOINTED_DEVICE
  return isDevice(s)
}

// The locked-mode device bind path — appointed device or selected device.
function liveDevicePath(): string {
  return useAppointed ? APPOINTED_DEVICE : SEL_DEVICE
}

// Re-decide which pointer to follow. Biased toward never going dead: the blue
// hand must both be maintained (a control surface exists) AND currently resolve,
// so a set where nothing is appointed yet keeps working off selected_device and
// flips over as soon as the blue hand lands somewhere.
function refreshDeviceSource(): void {
  const next = controlSurfaceConfigured() && appointedResolves()
  if (next === useAppointed) return
  useAppointed = next
  log(
    'device source -> ' +
      (useAppointed ? 'appointed_device' : 'selected_device')
  )
  emit()
}

// Watch the blue hand itself, so a set that starts with nothing appointed flips
// over the moment Live appoints something. This also picks up a control surface
// added or removed in Preferences mid-session: Live (un)appoints in response,
// and the callback re-runs the control-surface test.
let appointedApi: LiveAPI = null
function initAppointedWatcher(): void {
  appointedApi = new LiveAPI(function (args: IArguments) {
    if (args[0] !== 'appointed_device') return
    refreshDeviceSource()
  }, 'live_set')
  appointedApi.property = 'appointed_device'
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
  locked =
    savedLocked === null || savedLocked === undefined ? true : !!+savedLocked

  // Decide appointed-vs-selected BEFORE bluhand.init binds its observers to
  // devicePath(), so they come up on the right pointer with no re-point.
  useAppointed = controlSurfaceConfigured() && appointedResolves()
  // init() re-runs on every refresh (each app connect sends /syn), so create the
  // watcher once; a fresh one per refresh would stack up observers.
  if (!appointedApi) initAppointedWatcher()

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
  if (locked) return liveDevicePath()
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
  if (!apiValid(s)) return
  trackId = id
  trackPathStr = s.unquotedpath
  // Adopt the track's own remembered device (Live keeps this per-track even
  // when the track isn't globally selected), else clear the device. Guard: a
  // deviceless track's `view selected_device` can resolve to a non-device
  // (Track/Song) — never adopt that, or the device surface points at junk.
  s.path = trackPathStr + ' view selected_device'
  devicePathStr = isDevice(s) ? s.unquotedpath : ''
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
  devicePathStr = s.unquotedpath
  const m = devicePathStr.match(TRACK_PATH_RE)
  if (m) {
    s.path = m[1]
    if (apiValid(s)) {
      trackId = apiId(s)
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
  trackId = apiId(s)
  trackPathStr = trackId ? s.unquotedpath : ''
  s.path = liveDevicePath()
  devicePathStr = isDevice(s) ? s.unquotedpath : ''
}

// Resolve persisted paths back to ids. Positional paths can go stale across set
// edits; if the track path no longer resolves, fall back to Live's selection.
function restorePointer(tp: any, dp: any): void {
  const s = getScratch()
  if (tp) {
    s.path = String(tp)
    if (apiValid(s)) {
      trackId = apiId(s)
      trackPathStr = String(tp)
    }
  }
  if (dp) {
    s.path = String(dp)
    if (apiValid(s)) {
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
