// Shared, stateless LiveAPI helpers. Pure functions only — safe to import
// directly from any module despite Max's require() not caching (there is no
// per-instance state here to diverge, unlike utils' oscSink or the singletons
// the entry hands out through ctx).

// --- Reading .id --------------------------------------------------------
//
// @types/maxmsp declares `LiveAPI.id` as `number`, but at RUNTIME it reads back
// as a STRING — "0" for an object that doesn't resolve. That mismatch is the
// source of a whole class of bug: `if (api.id)` is true for "0", and
// `api.id === 0` is false for a real 0. Every read goes through these two
// helpers so the coercion exists in exactly one place.

// The numeric id of the object an api points at; 0 when it resolves to nothing.
export function apiId(api: LiveAPI): number {
  if (!api) return 0
  const n = parseInt(api.id as any)
  return isNaN(n) ? 0 : n
}

// Does this api currently point at a real Live object?
export function apiValid(api: LiveAPI): boolean {
  return apiId(api) !== 0
}

// --- Binding and re-pointing observers ----------------------------------

// Safely tear down a LiveAPI observer: unsubscribe from property notifications
// before detaching, to prevent callbacks firing on invalidated objects
// (which can crash SpiderMonkey via JS_EncodeString null pointer).
//
// Prefer re-pointing (reArm) or parking (disableObs) over this: teardown leaks
// ~6 permanent symbols per observer and detaching never gives them back. Real
// teardown belongs only in full rebuilds. See CLAUDE.md observer lifecycle.
export function detach(api: LiveAPI) {
  if (!api) return
  api.property = ''
  api.id = 0
}

// Bind a fresh observer to an object by its numeric id instead of by a path
// string. `new LiveAPI(cb, 'live_set tracks N ...')` interns that path into
// Max's global symbol table (~1 symbol per distinct path, measured); `.id = N`
// is numeric and interns nothing. The '' constructor path is interned once
// globally. Child ids come from id-list reads (.get('mixer_device'),
// .get('clip_slots'), .get('parameters') …), which also don't intern — so a
// whole strip or grid costs 0 path symbols. See k4-symbolTest.
export function obsById(id: number, cb: any, prop?: string): LiveAPI {
  const api = new LiveAPI(cb, '')
  api.id = id
  if (prop) api.property = prop
  return api
}

// Re-point an existing observer to a new object id + property. Free — no path
// interning, no teardown leak. The basis of the observer pools: reuse objects
// across scroll/retarget instead of evict+recreate.
export function reArm(api: LiveAPI, id: number, prop: string) {
  api.id = id
  api.property = prop
}

// Reuse an observer if present (re-point — free), else create one bound by id.
// `cb` is used only on first creation; on reuse the existing api keeps its own
// callback (closed over whatever persistent struct owns it).
export function ensureObs(
  api: LiveAPI,
  id: number,
  cb: any,
  prop: string
): LiveAPI {
  if (api) {
    reArm(api, id, prop)
    return api
  }
  return obsById(id, cb, prop)
}

// Unsubscribe an observer without tearing it down (property '' — free; teardown
// leaks ~6 symbols). Keeps the object alive for re-pointing.
export function disableObs(api: LiveAPI) {
  if (api) api.property = ''
}

// Re-point a mode-1 property observer at a new canonical PATH (as opposed to an
// id). Clearing the property first, then re-setting it, re-fires the callback
// with the new target's current value — so the surface re-syncs on retarget. An
// empty target detaches the observer (id 0 → reads nothing). Used by the
// focus-following observers, which must bind by path to auto-follow Live's
// selection while locked.
export function repointPath(api: LiveAPI, target: string, prop: string) {
  if (!api) return
  api.property = ''
  if (target) {
    api.path = target
    api.mode = 1
    if (prop) api.property = prop
  } else {
    api.id = 0
  }
}
