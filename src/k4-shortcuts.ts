// 8 device-shortcut slots (replaces the native [poly~ shortcutPoly 8]).
// Press an unmapped shortcut -> maps the currently-selected device. Press a
// mapped one -> focuses Live on that device (recall). Each slot persists the
// device PATH in ctx.settings; a single shared Task re-resolves the live paths
// every second (device/track reorders change paths, and the path must be
// current whenever the Set is saved so shortcuts restore to the right device).
//
// Inbound (router OUTLET_PRESETS): shortcut(slot) [/mapshortcut], unmap(slot)
// [/unmapshortcut]. Outbound: /shortcutName{N}, /shortcut{N}Color (RRGGBBAA),
// plus the device-UI label via OUTLET_SHORTCUT_NAME. Recall navigates through
// ctx.gotoDevice (bluhand).

import { colorToString, dequote, logFactory, osc, setOscSink } from './utils'
import config from './config'
import { noFn, OUTLET_SHORTCUT_NAME } from './consts'

const log = logFactory(config)

const NUM_SHORTCUTS = 8
const RESET_NAME = '- - -'
const RESET_COLOR = '990000ff'
const CHECK_PATH_MS = 1000

let ctx: AppContext = null

interface ShortcutSlot {
  deviceApi: LiveAPI // bound to the mapped device (by id); .unquotedpath stays current
  nameApi: LiveAPI
  colorApi: LiveAPI
  mapped: boolean
}

const slots: ShortcutSlot[] = []
let scratchApi: LiveAPI = null // resolve selected_device / restore paths
let checkPathTask: Task = null

// Carry-forward from pre-[v8] versions: those persisted each shortcut path in a
// parameter-enabled blob (longname N_shortcutPath, inside the old shortcutPoly).
// The .amxd now has 8 invisible blob params with matching longnames; on load
// each fires its restored value here so we can backfill ctx.settings for a slot
// that hasn't been migrated yet. legacyPaths is populated once per device load
// (the params fire on Live's parameter restore) and is read settings-first.
const legacyPaths: string[] = []

function pathKey(slot: number): string {
  return 'shortcut_' + slot + '_path'
}

function emitName(slot: number, name: string) {
  osc('/shortcutName' + slot, name)
  // device-side UI label (bluShortcutUI) — [slot, name]
  outlet(OUTLET_SHORTCUT_NAME, slot, name)
}

function emitColor(slot: number, colorHex: string) {
  osc('/shortcut' + slot + 'Color', colorHex)
}

function onName(slot: number) {
  const s = slots[slot - 1]
  if (!s.mapped) {
    return
  }
  emitName(slot, dequote(s.nameApi.get('name')[0]))
}

function onColor(slot: number) {
  const s = slots[slot - 1]
  if (!s.mapped) {
    return
  }
  emitColor(
    slot,
    colorToString(s.colorApi.get('color').toString()).toLowerCase() + 'ff'
  )
}

function makeCb(slot: number, prop: string, fn: (slot: number) => void) {
  return function (args: IArguments) {
    if (args[0] !== prop) {
      return
    }
    fn(slot)
  }
}

function bindDevice(slot: number, deviceId: number) {
  const s = slots[slot - 1]
  if (!s.deviceApi) {
    s.deviceApi = new LiveAPI(noFn, 'id ' + deviceId)
  } else {
    s.deviceApi.id = deviceId
  }
  // Devices have no 'color' — the shortcut color comes from the device's
  // canonical_parent (the track, or chain for rack devices).
  const parentId = parseInt(s.deviceApi.get('canonical_parent')[1] as any)
  if (!s.nameApi) {
    s.nameApi = new LiveAPI(makeCb(slot, 'name', onName), 'id ' + deviceId)
    s.nameApi.property = 'name'
    s.colorApi = new LiveAPI(makeCb(slot, 'color', onColor), 'id ' + parentId)
    s.colorApi.property = 'color'
  } else {
    s.nameApi.id = deviceId
    s.colorApi.id = parentId
  }
  s.mapped = true
  onName(slot)
  onColor(slot)
  ensureCheckPath()
}

function resetSlot(slot: number) {
  emitName(slot, RESET_NAME)
  emitColor(slot, RESET_COLOR)
}

// --- inbound -----------------------------------------------------------------

// /mapshortcut{N}: map the selected device when empty, else recall it.
function shortcut(slot: number) {
  const s = slots[slot - 1]
  if (s.mapped) {
    recall(slot)
    return
  }
  if (!scratchApi) {
    scratchApi = new LiveAPI(noFn, 'live_set')
  }
  scratchApi.path = 'live_set view selected_track view selected_device'
  const id = parseInt(scratchApi.id as any)
  if (id === 0) {
    return // nothing selected
  }
  ctx.settings.set(pathKey(slot), scratchApi.unquotedpath)
  bindDevice(slot, id)
}

function recall(slot: number) {
  const s = slots[slot - 1]
  if (!s.mapped || !s.deviceApi || +s.deviceApi.id === 0) {
    return
  }
  ctx.gotoDevice(s.deviceApi.id.toString())
}

// /unmapshortcut{N}
function unmap(slot: number) {
  const s = slots[slot - 1]
  ctx.settings.set(pathKey(slot), '')
  if (s.deviceApi) {
    s.deviceApi.id = 0
    s.nameApi.id = 0
    s.colorApi.id = 0
  }
  s.mapped = false
  resetSlot(slot)
}

// --- path revalidation (one shared poll for all mapped slots) ----------------

function ensureCheckPath() {
  if (checkPathTask) {
    return
  }
  checkPathTask = new Task(function () {
    for (let i = 1; i <= NUM_SHORTCUTS; i++) {
      const s = slots[i - 1]
      if (s.mapped && s.deviceApi && +s.deviceApi.id !== 0) {
        ctx.settings.set(pathKey(i), s.deviceApi.unquotedpath)
      }
    }
    checkPathTask.schedule(CHECK_PATH_MS)
  })
  checkPathTask.schedule(CHECK_PATH_MS)
}

// --- lifecycle ---------------------------------------------------------------

function refresh() {
  for (let i = 1; i <= NUM_SHORTCUTS; i++) {
    if (slots[i - 1].mapped) {
      onName(i)
      onColor(i)
    } else {
      resetSlot(i)
    }
  }
}

// Resolve one slot: ctx.settings wins; else backfill from the legacy blob param
// (carry-forward from pre-[v8] sets); else leave it unmapped. Idempotent — safe
// on every refresh()/reconnect (a value already applied re-binds to the same id).
function restoreShortcut(slot: number) {
  if (!ctx || !slots.length) {
    return
  }
  let p = ctx.settings.get(pathKey(slot))
  if (!(typeof p === 'string' && p.length) && legacyPaths[slot]) {
    p = legacyPaths[slot]
    ctx.settings.set(pathKey(slot), p) // migrate the old mapping into settings
  }
  if (typeof p === 'string' && p.length) {
    scratchApi.path = p
    const id = parseInt(scratchApi.id as any)
    if (id !== 0) {
      bindDevice(slot, id)
      return
    }
  }
  slots[slot - 1].mapped = false
  resetSlot(slot)
}

// Max message from a legacy N_shortcutPath blob param (fires on load). Stash the
// value and apply it if we're ready; otherwise init() will pick it up.
function legacyShortcutPath(slot: number, path: string) {
  if (slot < 1 || slot > NUM_SHORTCUTS) {
    return
  }
  legacyPaths[slot] = path == null ? '' : path.toString()
  restoreShortcut(slot)
}

function init(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
  if (!slots.length) {
    for (let i = 0; i < NUM_SHORTCUTS; i++) {
      slots.push({
        deviceApi: null,
        nameApi: null,
        colorApi: null,
        mapped: false,
      })
    }
  }
  if (!scratchApi) {
    scratchApi = new LiveAPI(noFn, 'live_set')
  }
  // Restore from persisted paths (kept current by the checkPath poll at save),
  // backfilling from legacy blob params for sets saved before the [v8] port.
  for (let i = 1; i <= NUM_SHORTCUTS; i++) {
    restoreShortcut(i)
  }
}

log('reloaded k4-shortcuts')

const routes: Route[] = [
  { prefix: '/mapshortcut', parse: 'slot', fn: shortcut },
  { prefix: '/unmapshortcut', parse: 'slot', fn: unmap },
]

export { routes, init, legacyShortcutPath }
