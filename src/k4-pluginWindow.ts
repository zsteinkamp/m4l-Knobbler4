// Auto-open / auto-close plug-in editor windows (VST, VST3, AU) as the focused
// device changes — "the plug-in window follows the blue hand".
//
// Off by default; the app toggles it with /pluginWindows <0|1> and the setting
// persists per device instance. When on, every device change closes the
// previously focused plug-in's editor and opens the new one's. A device that
// is not a plug-in (stock Live devices, Max devices, racks) just closes the
// previous window and opens nothing.
//
// Driven by k4-bluhand's onParameterChange — the one place that knows the
// focused device actually changed, in both focus-lock modes.

import config from './k4-config'
import { logFactory, setOscSink, osc } from './utils'
import { noFn } from './consts'

const log = logFactory(config)

const KEY = 'pluginWindows'

// PluginDevice.is_editor_open arrived in Live 12.4.3. Older builds don't expose
// the property at all, so the feature is simply unavailable there.
const MIN_VERSION = [12, 4, 3]

let ctx: AppContext = null
let enabled = false
let available = false

// The device the surface currently points at (any type), used to make repeat
// notifications for the same device free.
let lastDeviceId = 0
// The plug-in whose editor we last opened — the close target when focus moves.
let openPluginId = 0
// The first device change after load is the set opening, not a user selecting
// something; seed the state from it without popping a window.
let seeded = false

// Non-observing handle, re-pointed by id. `.id =` is numeric so it interns no
// symbols, unlike assigning `.path` (see CLAUDE.md).
let scratch: LiveAPI = null
function getScratch(): LiveAPI {
  if (!scratch) {
    scratch = new LiveAPI(noFn, '')
  }
  return scratch
}

// Is Live new enough to expose is_editor_open at all? Read once at init so the
// app can grey out the toggle without waiting for a plug-in to be focused.
// (The per-device gate below is the one that actually guards the write.)
function liveSupportsEditorOpen(): boolean {
  const app = new LiveAPI(noFn, 'live_app')
  if (+app.id === 0) {
    return false
  }
  // @types/maxmsp types LiveAPI.call as void; it returns the result.
  const v = [
    parseInt(app.call('get_major_version') as any),
    parseInt(app.call('get_minor_version') as any),
    parseInt(app.call('get_bugfix_version') as any),
  ]
  for (let i = 0; i < 3; i++) {
    if (isNaN(v[i])) {
      return false
    }
    if (v[i] !== MIN_VERSION[i]) {
      return v[i] > MIN_VERSION[i]
    }
  }
  return true
}

// Point the scratch handle at `id` and report whether that object is a plug-in
// with a controllable editor.
//
// The test is the LOM description itself rather than class_name: only
// PluginDevice carries is_editor_open, and only on Live 12.4.3+, so one `.info`
// read covers both gates at once and never provokes a console error by
// probing a property the object doesn't have. (Same trick as
// utils.isDeviceSupported; string reads don't intern.)
function pointAtPlugin(id: number): boolean {
  if (!id) {
    return false
  }
  const api = getScratch()
  api.id = id
  if (+api.id === 0) {
    return false // deleted device
  }
  return /\bis_editor_open\b/.test(api.info)
}

// Returns true only if `id` was a plug-in and the write went out.
function setEditorOpen(id: number, open: boolean): boolean {
  if (!pointAtPlugin(id)) {
    return false
  }
  getScratch().set('is_editor_open', open ? 1 : 0)
  return true
}

function applyFocus(deviceId: number): void {
  if (openPluginId && openPluginId !== deviceId) {
    setEditorOpen(openPluginId, false)
    openPluginId = 0
  }
  if (deviceId && setEditorOpen(deviceId, true)) {
    openPluginId = deviceId
  }
}

// Called by k4-bluhand whenever the focused device changes. `deviceId` is 0
// when the focus landed on something with no device.
export function deviceChanged(deviceId: number): void {
  const next = +deviceId || 0
  if (next === lastDeviceId) {
    return
  }
  lastDeviceId = next
  if (!seeded) {
    // Set load / JS reload: adopt the current device silently.
    seeded = true
    return
  }
  if (!enabled || !available) {
    return
  }
  applyFocus(next)
}

// The toggle. Reached from the app as /pluginWindows <0|1> and from the
// device's own chkPluginWindows checkbox (`pluginWindows $1` -> the entry).
// Turning it on opens the currently focused plug-in right away (so the toggle
// has a visible effect); turning it off closes the window we opened and leaves
// everything else alone.
export function setEnabled(val: number): void {
  // The checkbox can fire before init(ctx) on load; init pushes the real state
  // back to it afterwards, so dropping the early one loses nothing.
  if (!ctx) {
    return
  }
  if (!available) {
    log('pluginWindows: this Live has no is_editor_open (needs 12.4.3+)')
    pushState()
    return
  }
  const next = !!+val
  if (next !== enabled) {
    enabled = next
    ctx.settings.set(KEY, enabled ? 1 : 0)
    if (enabled) {
      applyFocus(lastDeviceId)
    } else if (openPluginId) {
      setEditorOpen(openPluginId, false)
      openPluginId = 0
    }
  }
  pushState()
}

// Echo the current state to the app and to the device's checkbox. Over OSC, -1
// means "this Live can't do it" so the app can disable the control rather than
// show a switch that does nothing; the checkbox just reads unchecked.
export function pushState(): void {
  osc('/pluginWindows', available ? (enabled ? 1 : 0) : -1)
  const chk = patcher.getnamed('chkPluginWindows')
  if (chk) {
    chk.message('set', available && enabled ? 1 : 0)
  }
}

export function init(c: AppContext): void {
  setOscSink(c.osc)
  ctx = c
  available = liveSupportsEditorOpen()
  const stored = c.settings.get(KEY)
  enabled = stored === null || stored === undefined ? false : !!+stored
  pushState()
}

const routes: Route[] = [
  { prefix: '/pluginWindows', parse: 'val', fn: setEnabled },
]

log('reloaded k4-pluginWindow')

export { routes }
