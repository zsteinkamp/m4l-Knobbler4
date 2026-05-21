// Per-instance persistence service. ONE Dict reference to the device's
// `---settingsDict` (a parameter-enabled [dict] in the patcher, so it persists
// with the Live set and is unique per device instance via the `---` scope).
//
// Owned by the orchestrator and handed to modules as ctx.settings — there must
// be exactly one Dict reference (creating another reference to a
// parameter-enabled dict can reset its contents), which is why no module builds
// its own and why this is not in per-module `utils`.

let dict: any = null

// name = the resolved `---settingsDict`, delivered by the patcher via the
// entry's settingsDictName message on load (before init). Created once.
export function open(name: string) {
  if (!dict) {
    dict = new Dict(name)
  }
}

export function get(key: string): any {
  return dict ? dict.get(key) : null
}

export function set(key: string, value: any) {
  if (dict) {
    dict.set(key, value)
  }
}

// --- Legacy bridge -----------------------------------------------------------
// TODO(cleanup, after 2026-07-01 or once v65 ships): remove this whole bridge —
// it only migrates pre-[v8] sets one time. Delete: openLegacy/setLegacyPrefix/
// legacyGet here; the entry's legacyPort handler + openLegacy call + ctx.legacyGet;
// the legacyGet backfill branches in knobblerCore.loadXYPairs and
// k4-sidebarMixer (meters); and in the patcher the [dict settingsDict] bridge
// object + the [prepend legacyPort] tap. (utils stays on 'k4Runtime'.)
//
// Pre-[v8] sets persisted per-instance keys in ONE shared [dict settingsDict]
// (parameter-enabled, fixed name) prefixed by the device's `---` value, e.g.
// "2346_xyPairs". The new scheme uses this per-instance ---settingsDict with
// unprefixed keys. We hold a SINGLE ref to the old settingsDict (re-added to the
// patcher) so old data loads and can be migrated on first open. ONE ref only —
// same reset-gotcha rule as above.
let legacyDict: any = null
let legacyPrefix = ''

export function openLegacy() {
  if (!legacyDict) {
    legacyDict = new Dict('settingsDict')
  }
}

// The OLD scheme prefixed per-instance keys with the device PORT (e.g. 2346),
// NOT the `---` device id. The entry feeds the port here (tapped from the port
// field) so legacyGet builds "<port>_<key>".
export function setLegacyPrefix(port: any) {
  legacyPrefix = String(port)
}

export function legacyGet(key: string): any {
  if (!legacyDict || !legacyPrefix) {
    return null
  }
  return legacyDict.get(legacyPrefix + '_' + key)
}
