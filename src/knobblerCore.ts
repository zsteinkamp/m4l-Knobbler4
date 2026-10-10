import {
  colorToString,
  debouncedTask,
  dequote,
  getVisibleTracksList,
  isValidPath,
  structureKeys,
  loadSetting,
  setDictPrefix,
  logFactory,
  setOscSink,
  osc,
  saveSetting,
} from './utils'
import { apiId, apiValid, detach } from './liveApi'
import {
  DEFAULT_COLOR_FF,
  LEGACY_UI_SLOTS,
  MAX_NAME_LEN,
  MAX_PAGES,
  MAX_SLOTS,
  SLOTS_PER_PAGE,
  SLOTS_PER_ROW,
  noFn,
  nullString,
  OUTLET_MSGS,
  OUTLET_PAGE,
  VIEW_TARGET_BASE,
} from './consts'

import { propToValue, valueString, valueToProp } from './deviceParam'

import config from './k4-config'
const log = logFactory(config)

// Orchestrator context (set in initAll) — per-instance persistence via ctx.settings.
let ctx: AppContext = null

// Pre-computed OSC address strings (indexed 1–MAX_SLOTS)
const ADDR_VAL: string[] = []
const ADDR_VALSTR: string[] = []
const ADDR_VALCOLOR: string[] = []
const ADDR_PARAM: string[] = []
const ADDR_PARAM_AUTO: string[] = []
const ADDR_DEVICE: string[] = []
const ADDR_TRACK: string[] = []
const ADDR_QUANT: string[] = []
const ADDR_QUANT_ITEMS: string[] = []
for (let _i = 1; _i <= MAX_SLOTS; _i++) {
  ADDR_VAL[_i] = '/val' + _i
  ADDR_VALSTR[_i] = '/valStr' + _i
  ADDR_VALCOLOR[_i] = '/val' + _i + 'color'
  ADDR_PARAM[_i] = '/param' + _i
  ADDR_PARAM_AUTO[_i] = '/param' + _i + 'auto'
  ADDR_DEVICE[_i] = '/device' + _i
  ADDR_TRACK[_i] = '/track' + _i
  ADDR_QUANT[_i] = '/quant' + _i
  ADDR_QUANT_ITEMS[_i] = '/quantItems' + _i
}
// Module-level scratchpad for one-off lookups (reuse via .path is fastest)
// Initialized in initAll() to avoid "Live API is not initialized" at load time
let scratchApi: LiveAPI = null
// Set true by initAll() (gated by live.thisdevice). Bpatcher parameters
// can fire setMin/setMax/setPath before the API is ready — queue those.
let apiReady = false
let pendingCalls: Array<() => void> = []

// slot arrays
const paramObj: LiveAPI[] = []
const paramNameObj: LiveAPI[] = []
const automationStateObj: LiveAPI[] = []
const deviceObj: LiveAPI[] = []
const trackObj: LiveAPI[] = []
const parentNameObj: LiveAPI[] = []
const parentColorObj: LiveAPI[] = []
const param: ParamType[] = []
const outMin: number[] = []
const outMax: number[] = []

// other vars
const allowMapping: boolean[] = []
const allowUpdateFromOsc: boolean[] = []

// XY pad pairs - stores left indices of active pairs
let xyPairs: number[] = []
const XY_PAIRS_KEY = 'xyPairs'

function isSlotInPair(slot: number): number | null {
  for (let i = 0; i < xyPairs.length; i++) {
    if (xyPairs[i] === slot || xyPairs[i] + 1 === slot) {
      return xyPairs[i]
    }
  }
  return null
}

function saveXYPairs() {
  ctx.settings.set(XY_PAIRS_KEY, xyPairs)
}

function loadXYPairs() {
  let val = ctx.settings.get(XY_PAIRS_KEY)
  // Carry forward from pre-[v8] sets: old xyPairs lived in the shared
  // [dict settingsDict] under "<port>_xyPairs". Migrate it once.
  // TODO(cleanup, after 2026-07-01 / v65): remove — see k4-settings legacy bridge.
  if (!(val && typeof val === 'object')) {
    const legacy = ctx.settings.legacyGet(XY_PAIRS_KEY)
    if (legacy && typeof legacy === 'object') {
      val = legacy
      ctx.settings.set(XY_PAIRS_KEY, legacy)
    }
  }
  //log('LOAD XY PAIRS val=' + JSON.stringify(val))
  if (val && typeof val === 'object') {
    xyPairs = (val as number[]).filter(function (n) {
      return typeof n === 'number' && !isNaN(n)
    })
  } else {
    xyPairs = []
  }
}

function sendXYPairs() {
  //log('SEND XY PAIRS', JSON.stringify(xyPairs))
  osc('/xyPairs', xyPairs)
}

// --- Slot persistence -------------------------------------------------------
//
// ctx.settings (---settingsDict) is the ONLY store for knobbler config: per
// slot path/min/max/customName (slot_<N>_<field>), plus the page names
// (kPages) and XY pairs (xyPairs). Everything is written there on mutation and
// read back by restoreSlot() on load/refresh.
function slotKey(slot: number, field: string): string {
  return 'slot_' + slot + '_' + field
}

function persistSlotPath(slot: number, path: string) {
  if (ctx) ctx.settings.set(slotKey(slot, 'path'), path || '')
}

// True once a slot field has ANY stored value. A cleared slot is stored as ''
// (clearSlotSettings), so this is how "never configured" differs from
// "deliberately emptied" — the distinction the legacy importers depend on.
function hasSetting(slot: number, field: string): boolean {
  const v = ctx.settings.get(slotKey(slot, field))
  return v !== null && v !== undefined
}

// Restore one slot from ctx.settings. Idempotent — safe to re-run on every
// refresh()/reconnect (matched values are no-ops).
function restoreSlot(slot: number) {
  if (!ctx) return

  const sPath = ctx.settings.get(slotKey(slot, 'path'))
  if (typeof sPath === 'string' && sPath.length) {
    if (!param[slot] || param[slot].path !== sPath) {
      setPath(slot, sPath)
    }
  }

  // min / max are stored as the 0–100 integers setMin/setMax take
  const sMin = ctx.settings.get(slotKey(slot, 'min'))
  if (typeof sMin === 'number' && outMin[slot] !== sMin / 100.0) {
    setMin(slot, sMin)
  }
  const sMax = ctx.settings.get(slotKey(slot, 'max'))
  if (typeof sMax === 'number' && outMax[slot] !== sMax / 100.0) {
    setMax(slot, sMax)
  }

  const sName = ctx.settings.get(slotKey(slot, 'customName'))
  if (sName === nullString) {
    // Saved by a bug (the legacy importer took the name field's "- - -"
    // default for a name); it would mask the parameter's own name.
    ctx.settings.set(slotKey(slot, 'customName'), '')
    if (param[slot] && param[slot].customName) clearCustomName(slot)
  } else if (typeof sName === 'string' && sName.length) {
    if (param[slot] && param[slot].customName !== sName) {
      setCustomName(slot, sName)
    }
  }
}

// --- Legacy importers (REMOVE after 2028-05-21) ----------------------------
//
// Before v61 (2026-05-21) slot config lived ONLY in the 32 knob-slot
// bpatchers' parameters (#N_path, #N_targetMin, #N_targetMax, #N_eparam).
// Those bpatchers stay in the device, hidden, purely so a set last saved before
// then still loads its mappings: Live restores their parameters on load, and
// their setPath/setMin/setMax/setCustomName messages land here.
//
// The device no longer WRITES them, so their values go stale the moment a
// fader moves or a slot is unmapped. That is why a value is imported only into
// a slot with NO stored setting at all, and why an imported (or overruled) path
// and name are then CLEARED in the bpatcher: saved, the set carries nothing
// for them to resurrect, and each importer goes inert after one save. Min/max
// can't be cleared that way — the bpatcher's only reset makes its numboxes
// output, which would loop back in here — but they need not be: once a slot's
// min/max setting exists, the importer is ignored for good.
//
// After 2028-05-21: delete the 32 bpatchers1..32 (and their 160 parameters)
// from both devices, this section, and the entry's setPath/setMin/setMax/
// setCustomName/clearCustomName handlers.
function whenReady(fn: () => void) {
  if (apiReady) fn()
  else pendingCalls.push(fn)
}

function importLegacyPath(slot: number, path: string) {
  whenReady(function () {
    if (slot < 1 || slot > LEGACY_UI_SLOTS || !path) return
    if (!hasSetting(slot, 'path') && isValidPath(path)) {
      initSlotIfNecessary(slot)
      setPath(slot, path) // persists to settings
    }
    legacyMsg(slot, ['path', ''])
  })
}

function importLegacyMin(slot: number, val: number) {
  whenReady(function () {
    if (slot < 1 || slot > LEGACY_UI_SLOTS) return
    if (!hasSetting(slot, 'min')) setMin(slot, val) // persists
  })
}

function importLegacyMax(slot: number, val: number) {
  whenReady(function () {
    if (slot < 1 || slot > LEGACY_UI_SLOTS) return
    if (!hasSetting(slot, 'max')) setMax(slot, val) // persists
  })
}

function importLegacyCustomName(slot: number, name: string) {
  whenReady(function () {
    // The bpatcher's name field DEFAULTS to the "- - -" placeholder, and Live
    // restores that on a fresh device: it is "no name", not a name to import.
    if (slot < 1 || slot > LEGACY_UI_SLOTS || !isCustomName(name)) return
    if (!hasSetting(slot, 'customName')) {
      initSlotIfNecessary(slot)
      setCustomName(slot, name) // persists
    }
    legacyMsg(slot, ['param', ''])
  })
}

// Clear a slot's persisted state (explicit user unmap, not the startup init()).
function clearSlotSettings(slot: number) {
  if (!ctx) return
  ctx.settings.set(slotKey(slot, 'path'), '')
  ctx.settings.set(slotKey(slot, 'customName'), '')
}

function xyJoin(leftIdx: number) {
  //log('xyJOIN', leftIdx)
  if (leftIdx < 1 || leftIdx >= MAX_SLOTS) {
    return
  }
  // check no overlap with existing pairs
  if (isSlotInPair(leftIdx) !== null || isSlotInPair(leftIdx + 1) !== null) {
    return
  }
  xyPairs.push(leftIdx)
  //log('JOIN', leftIdx, leftIdx + 1)
  saveXYPairs()
  sendXYPairs()
}

function xySplit(leftIdx: number) {
  const idx = xyPairs.indexOf(leftIdx)
  if (idx === -1) {
    return
  }
  xyPairs.splice(idx, 1)
  saveXYPairs()
  sendXYPairs()
}

function unmap(slot: number) {
  //log(`UNMAP ${slot}`)
  // if slot is part of a pair, remove that pair
  const pairLeft = isSlotInPair(slot)
  if (pairLeft !== null) {
    xySplit(pairLeft)
  }
  init(slot)
  clearSlotSettings(slot) // explicit user unmap — drop persisted mapping
  refreshSlotUI(slot)
}

// Swap (or move) the full mapping between two slots. Driven by the app's
// map-mode "swap source -> target" gesture (OSC /swapN [m]). If the target is
// unmapped this is a move (source ends up empty).
//
// We rebuild via setPath rather than swapping the parallel-array refs directly:
// each slot's observers close over their slot index (paramValueCallback(slot)),
// so moving the LiveAPI ref to the other index would drive the wrong slot's UI.
// Snapshot both slots' identifying state first, then re-map each from the
// other's path — setPath recreates observers with the correct closure.
type SlotSnapshot = {
  path: string
  min: number // 0–100 (as stored in settings / used by setMin)
  max: number
  customName: string
}

function captureSlot(slot: number): SlotSnapshot {
  const p = param[slot]
  return {
    path: p && p.path ? p.path : '',
    min: outMin[slot] !== undefined ? Math.round(outMin[slot] * 100) : 0,
    max: outMax[slot] !== undefined ? Math.round(outMax[slot] * 100) : 100,
    customName: p && p.customName ? p.customName : '',
  }
}

function applySnapshot(slot: number, snap: SlotSnapshot) {
  init(slot, !!snap.path)
  if (snap.path) {
    setPath(slot, snap.path)
    setMin(slot, snap.min)
    setMax(slot, snap.max)
    if (snap.customName) setCustomName(slot, snap.customName)
  } else {
    clearSlotSettings(slot)
    // The range travelled with the fader; an emptied slot starts full-range
    // rather than handing the old one to whatever is mapped here next.
    setMin(slot, 0)
    setMax(slot, 100)
    refreshSlotUI(slot)
  }
}

function swap(slotA: number, slotB: number) {
  if (!apiReady) {
    pendingCalls.push(function () {
      swap(slotA, slotB)
    })
    return
  }
  if (slotA === slotB) return
  if (slotA < 1 || slotA > MAX_SLOTS || slotB < 1 || slotB > MAX_SLOTS) return

  // Snapshot both before tearing down (each references the other).
  const snapA = captureSlot(slotA)
  const snapB = captureSlot(slotB)

  // A true swap (both slots mapped) keeps any XY pairs: a pair is a slot-INDEX
  // grouping, so swapping the params in those slots doesn't change which indices
  // are paired — mapping onto half a pad just shows the new param. But a MOVE
  // (one slot empty) leaves a paired slot half-empty, so split any pair either
  // slot belongs to.
  if (!snapA.path || !snapB.path) {
    const pairA = isSlotInPair(slotA)
    if (pairA !== null) xySplit(pairA)
    const pairB = isSlotInPair(slotB)
    if (pairB !== null) xySplit(pairB)
  }

  applySnapshot(slotA, snapB)
  applySnapshot(slotB, snapA)
}

// --- Pages -----------------------------------------------------------------
//
// The app shows the slots as named pages of SLOTS_PER_PAGE, page k owning slots
// k*16+1..k*16+16 (the Bluhand bank scheme). A page is nothing but a NAME, so
// slot index stays the identity of a fader and everything keyed on it —
// mappings, XY pairs, the app's value cache — is untouched. Moving a fader is a
// slot rewrite; reordering or deleting a page is the same rewrite in blocks.
// Rewrites re-point the slot's existing observers (reArmSlot), so none of this
// tears an observer down and leaks symbols.
const PAGES_KEY = 'kPages'
let pageNames: string[] = []

// Matches the app's default (knobbler-native lib/knobblerPages.ts).
function defaultPageName(idx: number): string {
  return 'Knobbler ' + (idx + 1)
}

function cleanPageName(name: any, idx: number): string {
  const s = name == null ? '' : String(name).trim()
  return s.length ? s.substring(0, MAX_NAME_LEN) : defaultPageName(idx)
}

function loadPages() {
  const val = ctx.settings.get(PAGES_KEY)
  if (val && typeof val === 'object' && (val as any).length > 0) {
    const arr = (val as any[]).slice(0, MAX_PAGES)
    pageNames = arr.map(function (n, i) {
      return cleanPageName(n, i)
    })
  } else {
    // Every set made before pages existed had exactly these two.
    pageNames = [defaultPageName(0), defaultPageName(1)]
  }
}

function savePages() {
  ctx.settings.set(PAGES_KEY, pageNames)
}

function sendPages() {
  osc('/kPages', pageNames)
  sendPageMenu()
}

// Slots anyone can address: every page's, and never fewer than the 32 an older
// app (or the device's own knob-slot UI) reaches.
function activeSlots(): number {
  return Math.max(LEGACY_UI_SLOTS, pageNames.length * SLOTS_PER_PAGE)
}

function sameSnapshot(a: SlotSnapshot, b: SlotSnapshot): boolean {
  return (
    a.path === b.path &&
    (!a.path ||
      (a.min === b.min && a.max === b.max && a.customName === b.customName))
  )
}

// Rewrite slots[i] to hold snaps[i]. Snapshots must all be captured BEFORE the
// first rewrite (a move reads slots it also writes). A slot already holding its
// target is skipped, so a block move only re-points what actually changed.
function rewriteSlots(slots: number[], snaps: SlotSnapshot[]) {
  for (let i = 0; i < slots.length; i++) {
    if (sameSnapshot(captureSlot(slots[i]), snaps[i])) continue
    applySnapshot(slots[i], snaps[i])
  }
}

function setPairs(pairs: number[]) {
  xyPairs = pairs
  saveXYPairs()
  sendXYPairs()
}

function parseArgs(val: any): any[] | null {
  try {
    const arr = typeof val === 'string' ? JSON.parse(val) : val
    return arr && typeof arr === 'object' && arr.length != null ? arr : null
  } catch (e) {
    return null
  }
}

// A cell range [slot, slot+width) that exists and doesn't wrap onto the next row.
function validCells(slot: number, width: number): boolean {
  if (slot < 1 || slot + width - 1 > activeSlots()) return false
  return width === 1 || (slot - 1) % SLOTS_PER_ROW !== SLOTS_PER_ROW - 1
}

// /kMove '[from, to, width]' — the app's Layout-mode drop. width 1 moves a
// single fader, width 2 an XY pad (from = its left slot). Whatever sat at the
// destination goes to the cells the move vacated, so a pad dropped one cell
// over rotates its neighbour around it rather than overwriting it. A single
// can't land on half a pad, and a pad can't straddle another pad.
function moveCells(val: any) {
  if (!apiReady) {
    pendingCalls.push(function () {
      moveCells(val)
    })
    return
  }
  const args = parseArgs(val)
  if (!args) return
  const from = +args[0]
  const to = +args[1]
  const width = +args[2] === 2 ? 2 : 1
  if (from === to || !validCells(from, width) || !validCells(to, width)) return

  const toIsPad = width === 2 && xyPairs.indexOf(to) !== -1
  if (width === 2) {
    if (xyPairs.indexOf(from) === -1) return
    if (!toIsPad) {
      for (let s = to; s < to + 2; s++) {
        const pad = isSlotInPair(s)
        if (pad !== null && pad !== from) return
      }
    }
  } else if (isSlotInPair(from) !== null || isSlotInPair(to) !== null) {
    return
  }

  const src: number[] = []
  const dst: number[] = []
  for (let i = 0; i < width; i++) {
    src.push(from + i)
    dst.push(to + i)
  }
  const slots = dst.slice()
  const snaps = src.map(captureSlot)
  const vacated = src.filter(function (s) {
    return dst.indexOf(s) === -1
  })
  const displaced = dst.filter(function (s) {
    return src.indexOf(s) === -1
  })
  for (let i = 0; i < vacated.length; i++) {
    slots.push(vacated[i])
    snaps.push(captureSlot(displaced[i]))
  }

  // Pairs are positional: a pad moving onto plain cells takes its pair marker
  // with it; two pads swapping leave both markers where they are.
  if (width === 2 && !toIsPad) {
    setPairs(
      xyPairs
        .filter(function (p) {
          return p !== from
        })
        .concat([to])
    )
  }
  rewriteSlots(slots, snaps)
}

// Lay the pages out in a new order: order[k] is the OLD index of the page that
// becomes page k, so leaving an index out deletes that page (and unmaps its
// faders — the caller confirms). Slots past the new last page are cleared.
function rearrangePages(order: number[]) {
  const oldCount = pageNames.length
  const lastSlot = activeSlots()
  const slots: number[] = []
  const snaps: SlotSnapshot[] = []
  for (let k = 0; k < order.length; k++) {
    for (let j = 1; j <= SLOTS_PER_PAGE; j++) {
      slots.push(k * SLOTS_PER_PAGE + j)
      snaps.push(captureSlot(order[k] * SLOTS_PER_PAGE + j))
    }
  }
  const empty: SlotSnapshot = { path: '', min: 0, max: 100, customName: '' }
  for (let s = order.length * SLOTS_PER_PAGE + 1; s <= lastSlot; s++) {
    // Below LEGACY_UI_SLOTS a slot past the last page is still reachable by an
    // older app, so only a deleted page's own slots are cleared there.
    if (s <= LEGACY_UI_SLOTS && s > oldCount * SLOTS_PER_PAGE) continue
    slots.push(s)
    snaps.push(empty)
  }

  const pairs: number[] = []
  for (let i = 0; i < xyPairs.length; i++) {
    const page = Math.floor((xyPairs[i] - 1) / SLOTS_PER_PAGE)
    if (page >= oldCount) {
      pairs.push(xyPairs[i]) // a legacy slot outside every page: untouched
      continue
    }
    const k = order.indexOf(page)
    if (k !== -1) pairs.push(xyPairs[i] + (k - page) * SLOTS_PER_PAGE)
  }

  pageNames = order.map(function (i) {
    return pageNames[i]
  })
  savePages()
  sendPages()
  setPairs(pairs)
  rewriteSlots(slots, snaps)
  setUiPage(uiPage) // the page showing may have moved or gone
}

// /kPageOrder '[old indices…]' — reorder and/or delete pages in one op.
function setPageOrder(val: any) {
  if (!apiReady) {
    pendingCalls.push(function () {
      setPageOrder(val)
    })
    return
  }
  const args = parseArgs(val)
  if (!args || !args.length) return
  const order: number[] = []
  for (let i = 0; i < args.length; i++) {
    const idx = +args[i]
    if (!(idx >= 0 && idx < pageNames.length) || order.indexOf(idx) !== -1) {
      return
    }
    order.push(idx)
  }
  rearrangePages(order)
}

// /kPageAdd 'name' — append a page. Its slots are whatever already sits there:
// empty by construction past slot 32, and below it possibly mapped by an older
// app or the device's own UI, which is worth showing rather than clearing.
function addPage(name: any) {
  if (!apiReady) {
    pendingCalls.push(function () {
      addPage(name)
    })
    return
  }
  if (pageNames.length >= MAX_PAGES) return
  const idx = pageNames.length
  pageNames.push(cleanPageName(name, idx))
  savePages()
  sendPages()
  for (let j = 1; j <= SLOTS_PER_PAGE; j++) {
    refreshSlotUI(idx * SLOTS_PER_PAGE + j)
  }
  setUiPage(uiPage)
}

// /kPageRename '[idx, name]'
function renamePage(val: any) {
  if (!ctx) return
  const args = parseArgs(val)
  if (!args) return
  const idx = +args[0]
  if (!(idx >= 0 && idx < pageNames.length)) return
  pageNames[idx] = cleanPageName(args[1], idx)
  savePages()
  sendPages()
}

// --- Device UI: the Knobbler view ------------------------------------------
//
// The device's Knobbler tab shows ONE page at a time in 16 view bpatchers
// (knobView-bpatcher.maxpat, varnames view1..view16). A view has no slot of its
// own: it listens on "---<VIEW_TARGET_BASE + pos>-SLOT" (the patcher's one
// forwarder addresses targets by number, and the legacy importers keep 1..32)
// and reports edits with its POSITION
// (viewMin/viewMax/viewName/viewClearName/viewUnmap), and this module maps
// positions to slots through uiPage. Switching pages is just refreshViews().
// The page menu beside the tab is filled and selected through OUTLET_PAGE
// ("kmenu …" → the patcher's route).
let uiPage = 0

function sendMsg(slot: number, msg: MessageType) {
  const pos = slot - uiPage * SLOTS_PER_PAGE
  if (pos < 1 || pos > SLOTS_PER_PAGE) return
  outlet(OUTLET_MSGS, [VIEW_TARGET_BASE + pos, ...msg])
}

// To one of the hidden legacy importer bpatchers (see Legacy importers).
function legacyMsg(slot: number, msg: MessageType) {
  outlet(OUTLET_MSGS, [slot, ...msg])
}

function slotOfView(pos: number): number {
  return uiPage * SLOTS_PER_PAGE + pos
}

function sendViewRange(slot: number) {
  sendMsg(slot, [
    'range',
    outMin[slot] !== undefined ? Math.round(outMin[slot] * 100) : 0,
    outMax[slot] !== undefined ? Math.round(outMax[slot] * 100) : 100,
  ])
}

// Everything a view shows for one slot.
function sendView(slot: number) {
  initSlotIfNecessary(slot)
  sendMsg(slot, ['mapped', paramObj[slot] ? true : false])
  sendMsg(slot, ['param', paramNameOf(slot)])
  sendMsg(slot, ['device', deviceNameOf(slot)])
  sendMsg(slot, ['track', trackNameOf(slot)])
  sendMsg(slot, ['color', ...colorOf(slot)])
  sendViewRange(slot)
}

function refreshViews() {
  for (let pos = 1; pos <= SLOTS_PER_PAGE; pos++) {
    sendView(slotOfView(pos))
  }
}

function sendPageMenu() {
  outlet(OUTLET_PAGE, ['kmenu', 'clear'])
  for (let i = 0; i < pageNames.length; i++) {
    outlet(OUTLET_PAGE, ['kmenu', 'append', pageNames[i]])
  }
  outlet(OUTLET_PAGE, ['kmenu', 'set', uiPage])
}

// Show page `idx` (clamped) on the device. Doesn't tell the app — callers that
// start on the device do that themselves. Also offers the page to the
// automatable "Knobbler Page" parameter (1-based); the patcher applies it with
// `set` (so it records without echoing back here) only while Automate Page Chg
// is on, the same gate the Page tab uses. Automation playing back arrives as
// uiPage <idx> from that parameter.
function setUiPage(idx: number) {
  // The saved parameter can land before the page list has loaded; clamp to the
  // device maximum then, and refresh() clamps to the real count afterwards.
  const last = (pageNames.length || MAX_PAGES) - 1
  uiPage = Math.max(0, Math.min(last, Math.floor(+idx) || 0))
  outlet(OUTLET_PAGE, ['kmenu', 'set', uiPage])
  outlet(OUTLET_PAGE, ['kparam', uiPage + 1])
  refreshViews()
}

// /kShow <idx> — the app switched pages.
function showPage(val: any) {
  whenReady(function () {
    setUiPage(+val)
  })
}

// The device's page menu: switch, and have the app follow.
function uiPageSelect(idx: number) {
  whenReady(function () {
    setUiPage(idx)
    osc('/kShow', uiPage)
  })
}

// An older app names Knobbler pages knobbler1/knobbler2 in /page/.
function showLegacyPage(pageName: string) {
  if (pageName === 'knobbler1') showPage(0)
  else if (pageName === 'knobbler2') showPage(1)
}

// Edits from a view, by position on the page showing.
function viewMin(pos: number, val: number) {
  setMin(slotOfView(pos), val)
}
function viewMax(pos: number, val: number) {
  setMax(slotOfView(pos), val)
}
function viewName(pos: number, name: string) {
  setCustomName(slotOfView(pos), name)
}
function viewClearName(pos: number) {
  clearCustomName(slotOfView(pos))
}
function viewUnmap(pos: number) {
  unmap(slotOfView(pos))
}

function bkMap(slot: number, id: number) {
  if (!apiReady) return
  scratchApi.id = id
  setPath(slot, scratchApi.unquotedpath)
}

// Resolve a mixer OSC path (e.g. "/mixer/3/vol", "/mixer/0/send1",
// "/mixer/vol") to a Live API parameter path and bind it to the given slot.
function mkMap(slot: number, mixerPath: string) {
  if (!apiReady) {
    pendingCalls.push(function () {
      mkMap(slot, mixerPath)
    })
    return
  }
  if (!mixerPath) return
  const parts = String(mixerPath).split('/') // ['', 'mixer', '3', 'vol'] or ['', 'mixer', 'vol']
  if (parts.length < 3 || parts[1] !== 'mixer') {
    log('mkMap: unrecognized path ' + mixerPath)
    return
  }
  let stripIdx: number = null
  let ctrl: string
  if (parts.length >= 4) {
    stripIdx = parseInt(parts[2])
    ctrl = parts[3]
  } else {
    ctrl = parts[2]
  }

  // Crossfader without a strip index = the master crossfader itself.
  // With a strip index = that track's crossfade_assign (A/B/off routing),
  // handled below in the per-track branch.
  if (ctrl === 'crossfader' && (stripIdx === null || isNaN(stripIdx))) {
    setPath(slot, 'live_set master_track mixer_device crossfader')
    return
  }
  if (ctrl === 'cue') {
    setPath(slot, 'live_set master_track mixer_device cue_volume')
    return
  }

  let trackPath: string = null
  if (stripIdx === null || isNaN(stripIdx)) {
    // Single-strip variant: resolve against Knobbler's current track (focus;
    // Live's selection when locked).
    scratchApi.path = ctx.focus.trackPath()
    trackPath = scratchApi.unquotedpath
  } else {
    const list = getVisibleTracksList()
    if (!list || list.length === 0) {
      log('mkMap: visibleTracks dict empty')
      return
    }
    if (stripIdx < 0 || stripIdx >= list.length) {
      log('mkMap: stripIdx ' + stripIdx + ' out of range')
      return
    }
    trackPath = list[stripIdx].path
  }
  if (!trackPath) return

  let paramPath: string
  if (ctrl === 'vol') {
    paramPath = trackPath + ' mixer_device volume'
  } else if (ctrl === 'pan') {
    paramPath = trackPath + ' mixer_device panning'
  } else if (ctrl === 'mute') {
    // mute is exposed as mixer_device.track_activator (inverted: activator=1
    // means unmuted) — bind as a normal parameter
    paramPath = trackPath + ' mixer_device track_activator'
  } else if (ctrl === 'crossfader') {
    // NOTE: crossfade_assign is an int property on mixer_device (0=A, 1=off,
    // 2=B), NOT a DeviceParameter — setPath can't bind it. Same situation as
    // Track.solo. Will need the property-binding code path to support this.
    log(
      'mkMap: crossfade_assign binding not yet supported (not a DeviceParameter)'
    )
    return
  } else if (ctrl.indexOf('send') === 0) {
    const sendNum = parseInt(ctrl.substring(4))
    if (isNaN(sendNum) || sendNum < 1) {
      log('mkMap: bad send spec ' + ctrl)
      return
    }
    paramPath = trackPath + ' mixer_device sends ' + (sendNum - 1)
  } else {
    log('mkMap: unsupported control ' + ctrl)
    return
  }
  setPath(slot, paramPath)
}

function initAll(c: AppContext) {
  setOscSink(c.osc)
  ctx = c
  if (!scratchApi) scratchApi = new LiveAPI(noFn, 'live_set')
  apiReady = true
  for (let i = 1; i <= MAX_SLOTS; i++) {
    initSlotIfNecessary(i)
  }
  // Replay calls that arrived before the API was ready
  const queued = pendingCalls
  pendingCalls = []
  for (let i = 0; i < queued.length; i++) {
    queued[i]()
  }
}

function initSlotIfNecessary(slot: number) {
  if (!param[slot]) {
    init(slot)
  }
}

// quiet: the slot is about to be re-pointed (applySnapshot), and its new value
// string follows at once — blanking it first would flash "- - -" in between.
function init(slot: number, quiet?: boolean) {
  if (!apiReady) {
    pendingCalls.push(function () {
      init(slot, quiet)
    })
    return
  }
  //log(`INIT ${slot}`)
  if (paramObj[slot]) {
    detach(paramObj[slot])
    if (!quiet) osc(ADDR_VALSTR[slot], nullString)
  }
  paramObj[slot] = null
  if (param[slot]) {
    param[slot].path = ''
    watchSlot(slot)
  }
  allowMapping[slot] = true
  allowUpdateFromOsc[slot] = true
  // Full range until setMin/setMax (or the stored settings) narrow it. Only
  // those two ever wrote the range, and slots 1-32 got it from their knob-slot
  // bpatcher's numboxes, so a slot past 32 had none: min and max both
  // undefined read as min == max, and sendVal then reported every change from
  // Live as 0 / "- - -".
  if (outMin[slot] === undefined) outMin[slot] = 0
  if (outMax[slot] === undefined) outMax[slot] = 1
  param[slot] = {
    val: 0,
    min: 0,
    max: 100,
    quant: 0,
    quantItems: [],
    allowParamValueUpdates: true,
  }
  detach(paramNameObj[slot])
  detach(automationStateObj[slot])
  detach(deviceObj[slot])
  detach(parentNameObj[slot])
  detach(parentColorObj[slot])
  detach(trackObj[slot])
  sendMsg(slot, ['mapped', false])
}

function setMin(slot: number, val: number) {
  //log(`SETMIN ${slot}: ${val}`)
  initSlotIfNecessary(slot)
  outMin[slot] = val / 100.0
  if (ctx) ctx.settings.set(slotKey(slot, 'min'), val)
  sendViewRange(slot)
  sendVal(slot)
}

function setMax(slot: number, val: number) {
  //log(`SETMAX ${slot}: ${val}`)
  initSlotIfNecessary(slot)
  outMax[slot] = val / 100.0
  if (ctx) ctx.settings.set(slotKey(slot, 'max'), val)
  sendViewRange(slot)
  sendVal(slot)
}

function clearCustomName(slot: number) {
  //log()
  param[slot].customName = null
  if (ctx) ctx.settings.set(slotKey(slot, 'customName'), '')
  sendParamName(slot)
}

// A real custom name — not empty, and not the "- - -" placeholder the device
// shows (and its name fields default to) for "none". Stored as a name, the
// placeholder would hide the mapped parameter's own name.
function isCustomName(name: any): boolean {
  return !!name && String(name) !== nullString
}

function setCustomName(slot: number, args: string) {
  //log(args)
  if (!param[slot]) {
    return
  }
  if (!isCustomName(args)) return clearCustomName(slot)
  if (ctx) ctx.settings.set(slotKey(slot, 'customName'), args)

  param[slot].customName = args
  sendParamName(slot)
}

function gotoTrackFor(slot: number) {
  if (!trackObj[slot]) {
    return
  }
  ctx.gotoTrack(apiId(trackObj[slot]).toString()) // shared nav: unfolds groups
}

function setDefault(slot: number) {
  //log('DEFAULT TOP ' + slot)
  if (!paramObj[slot]) {
    return
  }
  if (!allowUpdateFromOsc[slot]) {
    return
  }
  let defaultValue = paramObj[slot].get('default_value')
  if (typeof defaultValue !== 'object') {
    return
  }
  defaultValue = defaultValue[0]

  paramObj[slot].set('value', defaultValue)
}

function paramValueCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  //log(args, 'ALLOW_UPDATES=', param[slot].allowParamValueUpdates)
  if (param[slot].allowParamValueUpdates) {
    if (iargs[0] === 'value') {
      //log("PARAM_VAL", typeof(iargs[1]), iargs[1], "\n");
      param[slot].val = iargs[1]
      sendVal(slot)
    }
  }
}

function paramNameCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  if (iargs[0] === 'name') {
    param[slot].name = iargs[1]
    sendParamName(slot)
  }
}

function automationStateCallback(slot: number, iargs: IArguments) {
  if (iargs[0] === 'automation_state') {
    sendAutomationState(slot)
  }
}

function deviceNameCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  if (iargs[0] === 'name') {
    param[slot].deviceName = iargs[1]
    sendDeviceName(slot)
  }
}

function parentNameCallback(slot: number, iargs: IArguments) {
  if (iargs[0] === 'name') {
    param[slot].parentName = iargs[1]
    sendTrackName(slot)
  }
}

function parentColorCallback(slot: number, iargs: IArguments) {
  if (!param[slot]) return
  if (iargs[0] === 'color') {
    param[slot].trackColor = colorToString(iargs[1]) + 'FF'
    sendColor(slot)
  }
}

// --- Structure watchers ------------------------------------------------------
//
// A mapped parameter's device can be deleted, and its PATH can change (a track
// inserted above it, its device dragged along the chain). The path is what's
// persisted, so it must follow. Both can only happen when one of the LISTS
// along the path changes: for "live_set tracks 3 devices 2 chains 1 devices 0
// parameters 5" that's live_set.tracks, track 3's devices, device 2's chains,
// chain 1's devices and device 0's parameters. So each list on a mapped path is
// observed, and any change re-runs checkAllDevicesPresent once it settles.
//
// This replaced a 1s poll that read two LiveAPI paths per mapped slot every
// second whether anything changed or not — 512 reads/s with 16 full pages.
// Observers cost nothing until Live changes something.
//
// A list is watched once however many slots share it (refcounted by
// "<object path>|<list>"). Watchers are RE-POINTED and parked, never dropped:
// tearing an observer down leaks symbols (see CLAUDE.md, symbol interning).
type Watcher = { api: LiveAPI; refs: number }
const watchers: { [key: string]: Watcher } = {}
const parkedWatchers: LiveAPI[] = []
const slotWatchKeys: string[][] = []
const STRUCTURE_SETTLE_MS = 50
let structureTask: MaxTask = null

// Live calls back on every change (and once when the property is first set);
// a burst — a track insert moves many paths — settles into one check.
function onStructureChange() {
  if (!structureTask)
    structureTask = new Task(checkAllDevicesPresent) as MaxTask
  structureTask.cancel()
  structureTask.schedule(STRUCTURE_SETTLE_MS)
}

function acquireWatcher(key: string) {
  const w = watchers[key]
  if (w) {
    w.refs++
    return
  }
  const sep = key.lastIndexOf('|')
  const api = parkedWatchers.pop() || new LiveAPI(onStructureChange, '')
  api.property = ''
  api.path = key.substring(0, sep)
  if (apiValid(api)) api.property = key.substring(sep + 1)
  watchers[key] = { api: api, refs: 1 }
}

function releaseWatcher(key: string) {
  const w = watchers[key]
  if (!w || --w.refs > 0) return
  detach(w.api)
  parkedWatchers.push(w.api)
  delete watchers[key]
}

// Watch the lists along this slot's current path (and stop watching any its
// old path had that the new one doesn't).
function watchSlot(slot: number) {
  const next =
    param[slot] && param[slot].path ? structureKeys(param[slot].path) : []
  const prev = slotWatchKeys[slot] || []
  next.forEach(function (k) {
    acquireWatcher(k)
  })
  prev.forEach(function (k) {
    releaseWatcher(k)
  })
  slotWatchKeys[slot] = next
}

function checkAllDevicesPresent() {
  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    if (paramObj[slot]) {
      checkDevicePresent(slot)
    }
  }
}

function checkDevicePresent(slot: number) {
  //log('CHECK_DEVICE_PRESENT ' + slot)
  if (!param[slot]) return
  if (deviceObj[slot] && !deviceObj[slot].unquotedpath) {
    //log(`slot=${slot} DEVICE DELETED`)
    init(slot)
    return
  }

  // check if path has changed (e.g. inserting a track above this one)
  if (paramObj[slot] && paramObj[slot].unquotedpath !== param[slot].path) {
    //log(
    //  `UPDATE PATH slot=${slot} new=${paramObj[slot].unquotedpath} old=${param[slot].path}`
    //)
    setPath(slot, paramObj[slot].unquotedpath)
  }
}

// An "id N" reference (or ["id", N]) -> N; a positional path string -> 0. The
// .path setter REJECTS "id N" (only the constructor accepts it), so targets that
// come from get('canonical_parent') must be re-pointed by .id, not .path.
function idFromRef(ref: any): number {
  const s = (Array.isArray(ref) ? ref.join(' ') : String(ref)).trim()
  const m = s.match(/^id\s+(\d+)$/)
  if (m) return parseInt(m[1])
  if (/^\d+$/.test(s)) return parseInt(s)
  return 0
}

// Re-point (or lazily create) a per-slot observer instead of dropping the old one
// and making a new one on every (re)map. Reuse is free; dropping an armed LiveAPI
// for GC leaks ~6 symbols and can fire its callback mid-finalization (see
// CLAUDE.md / the cue-point note). property '' unsubscribes before moving target.
// Targets may be a positional path string (paramPath, matches[0]) or an id ref
// (canonical_parent); re-point the latter by .id since .path rejects "id N".
function reArmSlot(api: LiveAPI, cb: any, target: any, prop: string): LiveAPI {
  if (!api) api = new LiveAPI(cb, '')
  const id = idFromRef(target)
  api.property = ''
  if (id) api.id = id
  else api.path = target
  if (prop) api.property = prop
  return api
}

function setPath(slot: number, paramPath: string) {
  //log(`SETPATH ${slot}: ${paramPath}`)
  if (!apiReady) {
    pendingCalls.push(function () {
      setPath(slot, paramPath)
    })
    return
  }
  initSlotIfNecessary(slot)
  //log(paramPath)
  if (!isValidPath(paramPath)) {
    //log(`skipping ${slot}: ${paramPath}`)
    return
  }
  // Re-point (or create) the param value observer, then validate the resolved id.
  const pv = reArmSlot(
    paramObj[slot],
    (iargs: IArguments) => paramValueCallback(slot, iargs),
    paramPath,
    ''
  )
  if (!apiValid(pv)) {
    log(`Invalid path for slot ${slot}: ${paramPath}`)
    return
  }
  pv.property = 'value'
  paramObj[slot] = pv

  paramNameObj[slot] = reArmSlot(
    paramNameObj[slot],
    (iargs: IArguments) => paramNameCallback(slot, iargs),
    paramPath,
    'name'
  )

  automationStateObj[slot] = reArmSlot(
    automationStateObj[slot],
    (iargs: IArguments) => automationStateCallback(slot, iargs),
    paramPath,
    'automation_state'
  )

  param[slot].id = apiId(paramObj[slot])
  param[slot].path = paramObj[slot].unquotedpath
  param[slot].val = parseFloat(paramObj[slot].get('value'))
  param[slot].min = parseFloat(paramObj[slot].get('min')) || 0
  param[slot].max = parseFloat(paramObj[slot].get('max')) || 1
  param[slot].name = paramObj[slot].get('name')[0]
  const isQuantized = parseInt(paramObj[slot].get('is_quantized')) > 0
  param[slot].quantItems = isQuantized
    ? (paramObj[slot].get('value_items') as unknown as string[])
    : []
  param[slot].quant = param[slot].quantItems.length

  deviceObj[slot] = reArmSlot(
    deviceObj[slot],
    (iargs: IArguments) => deviceNameCallback(slot, iargs),
    paramObj[slot] && paramObj[slot].get('canonical_parent'),
    '' // property set conditionally below
  )
  const devicePath = deviceObj[slot].unquotedpath

  // Only get the device name if it has the name property
  if (deviceObj[slot].info.match(/property name str/)) {
    deviceObj[slot].property = 'name'
    param[slot].deviceName = deviceObj[slot].get('name')
  } else if (param[slot].path.match(/mixer_device/)) {
    param[slot].deviceName = 'Mixer'
  }

  const parentId = deviceObj[slot].get('canonical_parent')

  // parent name
  parentNameObj[slot] = reArmSlot(
    parentNameObj[slot],
    (iargs: IArguments) => parentNameCallback(slot, iargs),
    parentId,
    'name'
  )
  param[slot].parentName = parentNameObj[slot].get('name')

  // parent color
  parentColorObj[slot] = reArmSlot(
    parentColorObj[slot],
    (iargs: IArguments) => parentColorCallback(slot, iargs),
    parentId,
    'color'
  )
  param[slot].trackColor =
    colorToString(parentColorObj[slot].get('color')) + 'FF'

  // Try to get the track name
  const matches =
    devicePath.match(/^live_set tracks \d+/) ||
    devicePath.match(/^live_set return_tracks \d+/) ||
    devicePath.match(/^live_set master_track/)

  if (matches) {
    // NOT an observer — a plain handle so gotoTrackFor(slot) can resolve the
    // owning track. (It used to be armed with a trackNameCallback and an empty
    // property, so the callback could never fire; the strip's track label comes
    // from parentNameObj.)
    trackObj[slot] = reArmSlot(trackObj[slot], noFn, matches[0], '')
  }

  //log("PARAM DATA", JSON.stringify(param), "\n");
  watchSlot(slot)
  sendMsg(slot, ['mapped', true])
  persistSlotPath(slot, param[slot].path) // ctx.settings (migration target)

  // Defer outputting the new param val because the controller
  // will not process it since it was just sending other vals
  // that triggered the mapping.
  const sendValTask = new Task(function () {
    sendVal(slot)
  })
  debouncedTask('sendVal', slot, sendValTask, 333)
  sendNames(slot)
}

function refresh() {
  //log('IN REFRESH')
  if (!apiReady) {
    pendingCalls.push(function () {
      refresh()
    })
    return
  }
  loadPages()
  sendPages()
  loadXYPairs()
  sendXYPairs()
  for (let i = 1; i <= activeSlots(); i++) {
    restoreSlot(i)
    refreshSlotUI(i)
  }
  setUiPage(uiPage)
}

function refreshSlotUI(slot: number) {
  sendNames(slot)
  sendVal(slot)
}

function sendNames(slot: number) {
  //log(param.name, param.deviceName, param.trackName)
  sendParamName(slot)
  sendAutomationState(slot)
  sendDeviceName(slot)
  sendTrackName(slot)
  sendColor(slot)
  sendQuant(slot)
}

function sendQuant(slot: number) {
  initSlotIfNecessary(slot)
  osc(ADDR_QUANT[slot], param[slot].quant)
  // Always an array — the app decodes the payload the same way either way.
  // (The empty case used to ship the literal STRING '[]'.)
  osc(
    ADDR_QUANT_ITEMS[slot],
    param[slot].quant > 2 ? param[slot].quantItems : []
  )
}

// Display strings for a slot, shared by the OSC senders and the device view.
function paramNameOf(slot: number): string {
  return dequote(
    (
      (param[slot] && (param[slot].customName || param[slot].name)) ||
      nullString
    ).toString()
  )
}

function deviceNameOf(slot: number): string {
  return param[slot].deviceName
    ? dequote(param[slot].deviceName.toString())
    : nullString
}

function trackNameOf(slot: number): string {
  return param[slot].parentName
    ? dequote(param[slot].parentName.toString())
    : nullString
}

function trackColorOf(slot: number): string {
  return param[slot].trackColor
    ? dequote(param[slot].trackColor.toString())
    : DEFAULT_COLOR_FF
}

// The view's color bar as 0–1 RGBA; an unmapped slot is black.
function colorOf(slot: number): number[] {
  let c = trackColorOf(slot)
  if (c === DEFAULT_COLOR_FF) c = '000000FF'
  return [0, 2, 4, 6].map(function (i) {
    return parseInt(c.substring(i, i + 2), 16) / 255.0 || 0
  })
}

function sendParamName(slot: number) {
  //log(`SEND PARAM NAME ${slot}`)
  initSlotIfNecessary(slot)
  const paramName = paramNameOf(slot)
  sendMsg(slot, ['param', paramName])
  //log('SEND PARAM NAME ' + slot + '=' + paramName)
  osc(ADDR_PARAM[slot], paramName)
}

function sendAutomationState(slot: number) {
  initSlotIfNecessary(slot)
  const automationState = parseInt(
    (paramObj && paramObj[slot] && paramObj[slot].get('automation_state')) || 0
  )
  //log('PAYLOAD ' + ADDR_PARAM_AUTO[slot] + ' ' + automationState)
  osc(ADDR_PARAM_AUTO[slot], automationState)
}

function sendDeviceName(slot: number) {
  //log(`SEND DEVICE NAME ${slot}`)
  initSlotIfNecessary(slot)
  const deviceName = deviceNameOf(slot)
  sendMsg(slot, ['device', deviceName])
  osc(ADDR_DEVICE[slot], deviceName)
}

function sendTrackName(slot: number) {
  //log(`SEND TRACK NAME ${slot}`)
  initSlotIfNecessary(slot)
  const trackName = trackNameOf(slot)
  sendMsg(slot, ['track', trackName])
  osc(ADDR_TRACK[slot], trackName)
}

function sendColor(slot: number) {
  //log(`SEND COLOR ${slot}`)
  initSlotIfNecessary(slot)
  osc(ADDR_VALCOLOR[slot], trackColorOf(slot))
  // for the color highlight in the Max for Live device
  sendMsg(slot, ['color', ...colorOf(slot)])
}

function sendVal(slot: number) {
  //log(`SEND VAL ${slot}`)
  if (!ADDR_VAL[slot]) {
    log('sendVal: out-of-range slot=' + slot + ' (type=' + typeof slot + ')')
    return
  }
  initSlotIfNecessary(slot)

  if (
    !apiValid(paramObj[slot]) ||
    param[slot].val === undefined ||
    param[slot].max === undefined ||
    param[slot].min === undefined ||
    outMax[slot] === outMin[slot]
  ) {
    osc(ADDR_VAL[slot], 0)
    osc(ADDR_VALSTR[slot], nullString)
    return
  }

  osc(
    ADDR_VAL[slot],
    valueToProp(
      param[slot].val,
      param[slot].min,
      param[slot].max,
      outMin[slot],
      outMax[slot]
    )
  )
  osc(
    ADDR_VALSTR[slot],
    paramObj[slot] ? valueString(paramObj[slot], param[slot].val) : nullString
  )
}

// new value received over OSC
function val(slot: number, val: number) {
  //log(slot + ' - VAL: ' + val)
  if (paramObj[slot]) {
    if (allowUpdateFromOsc[slot]) {
      // scale the 0..1 value to the param's min/max range
      param[slot].val = propToValue(
        val,
        param[slot].min,
        param[slot].max,
        outMin[slot],
        outMax[slot]
      )

      // prevent updates from params directly being sent to OSC for 500ms
      if (param[slot].allowParamValueUpdates) {
        param[slot].allowParamValueUpdates = false
        const allowUpdatesTask = new Task(function () {
          param[slot].allowParamValueUpdates = true
        })
        debouncedTask('allowUpdates', slot, allowUpdatesTask, 500)
      }
      //log('VAL ' + paramObj[slot] + ' ' + param[slot].val)
      paramObj[slot].set('value', param[slot].val)
      // get() the value from the param instead of re-using the val we
      // calculated above because buttons and whatnot will report the wrong
      // string value due to what looks like a rounding bug inside of
      // those params (e.g. str_for_value(0.9) yields "on" even though
      // the device shows up as "off"
      osc(
        ADDR_VALSTR[slot],
        valueString(paramObj[slot], parseFloat(paramObj[slot].get('value')))
      )
    }
  } else {
    //log('GONNA_MAP', 'ALLOWED=', allowMapping)
    // If we get a OSC value but are unassigned, trigger a mapping.
    // This removes a step from typical mapping.
    if (allowMapping[slot]) {
      // debounce mapping, since moving the CC will trigger many message
      allowMapping[slot] = false
      const allowMappingTask = new Task(function () {
        allowMapping[slot] = true
      })
      debouncedTask('allowMapping', slot, allowMappingTask, 1000)

      // wait 500ms before paying attention to values again after mapping
      if (allowUpdateFromOsc[slot]) {
        allowUpdateFromOsc[slot] = false
        const allowUpdateFromOscTask = new Task(function () {
          allowUpdateFromOsc[slot] = true
        })
        debouncedTask('allowUpdateFromOsc', slot, allowUpdateFromOscTask, 500)
      }

      //log("PRE-SELOBJ\n");
      scratchApi.path = 'live_set view selected_parameter'
      if (!scratchApi.unquotedpath) {
        post('No Live param is selected.\n')
      } else {
        //log('SELOBJ', scratchApi.unquotedpath, 'SELOBJINFO', scratchApi.info)
        // Only map things that have a 'value' property
        if (scratchApi.info.match(/property value/)) {
          setPath(slot, scratchApi.unquotedpath)
        }
      }
    }
  }
}

export {
  addPage,
  bkMap,
  gotoTrackFor,
  importLegacyCustomName,
  importLegacyMax,
  importLegacyMin,
  importLegacyPath,
  initAll,
  mkMap,
  moveCells,
  refresh,
  renamePage,
  setDefault,
  setDictPrefix,
  setPageOrder,
  showLegacyPage,
  showPage,
  swap,
  uiPageSelect,
  unmap,
  val,
  viewClearName,
  viewMax,
  viewMin,
  viewName,
  viewUnmap,
  xyJoin,
  xySplit,
}
