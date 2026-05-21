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
