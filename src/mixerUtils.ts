import { cleanArr, fixFloat } from './utils'
import {
  getTrackInputStatus,
  enableTrackInput,
  disableTrackInput,
} from './toggleInput'

/**
 * If exclusive_solo is enabled, unsolo all tracks except `trackId`.
 * `lookupApi` is a throwaway LiveAPI used for iteration.
 */
export function handleExclusiveSolo(trackId: number, lookupApi: LiveAPI) {
  lookupApi.path = 'live_set'
  if (parseInt(lookupApi.get('exclusive_solo')) === 1) {
    const tracks = cleanArr(lookupApi.get('tracks'))
    const returns = cleanArr(lookupApi.get('return_tracks'))
    for (const tid of tracks.concat(returns)) {
      if (tid === trackId) continue
      lookupApi.id = tid
      lookupApi.set('solo', 0)
    }
  }
}

/**
 * If exclusive_arm is enabled, unarm all tracks except `trackId`.
 * `lookupApi` is a throwaway LiveAPI used for iteration.
 */
export function handleExclusiveArm(trackId: number, lookupApi: LiveAPI) {
  lookupApi.path = 'live_set'
  if (parseInt(lookupApi.get('exclusive_arm')) === 1) {
    const tracks = cleanArr(lookupApi.get('tracks'))
    for (const tid of tracks) {
      if (tid === trackId) continue
      lookupApi.id = tid
      if (parseInt(lookupApi.get('can_be_armed'))) {
        lookupApi.set('arm', 0)
      }
    }
  }
}

/**
 * Toggle crossfade assignment. `side` is 0 for A, 2 for B.
 */
export function toggleXFade(mixerApi: LiveAPI, side: number) {
  if (!mixerApi || +mixerApi.id === 0) return
  const curr = parseInt(mixerApi.get('crossfade_assign'))
  mixerApi.set('crossfade_assign', curr === side ? 1 : side)
}

/**
 * Enable record arm on a track, handling exclusive arm.
 */
export function enableArm(trackApi: LiveAPI, lookupApi: LiveAPI) {
  enableTrackInput(trackApi)
  trackApi.set('arm', 1)
  handleExclusiveArm(parseInt(trackApi.id.toString()), lookupApi)
}

/**
 * Disable record arm on a track.
 */
export function disableArm(trackApi: LiveAPI) {
  trackApi.set('arm', 0)
}

/**
 * Disable track input routing.
 */
export { disableTrackInput }

/**
 * Returns { armStatus: number, inputEnabled: boolean } for a track.
 */
export function getRecordStatus(trackApi: LiveAPI) {
  const armStatus =
    parseInt(trackApi.get('can_be_armed')) && parseInt(trackApi.get('arm'))
  const trackInputStatus = getTrackInputStatus(trackApi)
  return {
    armStatus: armStatus ? 1 : 0,
    inputEnabled: !!(trackInputStatus && trackInputStatus.inputEnabled),
  }
}

// ---------------------------------------------------------------------------
// Shared strip command/computation helpers
//
// These operate on a DeviceParameter or Track LiveAPI and return computed
// values. They intentionally do NOT emit OSC — the multiMixer (indexed
// addresses) and sidebarMixer (fixed addresses) emit to different addresses,
// so the caller owns emission. Callers also own pause/debounce, since the
// two modules track pause state differently.
// ---------------------------------------------------------------------------

/**
 * Set a DeviceParameter's value and return its display string ('' if the
 * param is invalid). Caller handles pause + OSC.
 */
export function setParamValue(paramApi: LiveAPI, val: number | string): string {
  if (!paramApi || +paramApi.id === 0) return ''
  const fVal = parseFloat(val.toString())
  paramApi.set('value', fVal)
  const str = paramApi.call('str_for_value', fixFloat(fVal)) as any
  return str ? str.toString() : ''
}

/**
 * Reset a DeviceParameter to its default value. Returns { value, str } or
 * null if the param is invalid.
 */
export function resetParamValue(
  paramApi: LiveAPI
): { value: number; str: string } | null {
  if (!paramApi || +paramApi.id === 0) return null
  const defVal = parseFloat(paramApi.get('default_value').toString())
  paramApi.set('value', defVal)
  const str = paramApi.call('str_for_value', fixFloat(defVal)) as any
  return { value: defVal, str: str ? str.toString() : '' }
}

/**
 * Effective mute = mute OR muted_via_solo (the user sees both as "muted").
 * Returns 0/1. NOTE: master track lacks both properties — callers must not
 * call this for the master strip (would log v8 warnings).
 */
export function effectiveMute(trackApi: LiveAPI): number {
  if (!trackApi || +trackApi.id === 0) return 0
  const m = parseInt(trackApi.get('mute').toString()) || 0
  const mvs = parseInt(trackApi.get('muted_via_solo').toString()) || 0
  return m || mvs ? 1 : 0
}

/**
 * Toggle a track's mute. Returns the new effective mute (0/1).
 */
export function toggleMute(trackApi: LiveAPI): number {
  if (!trackApi || +trackApi.id === 0) return 0
  const curr = parseInt(trackApi.get('mute').toString()) || 0
  trackApi.set('mute', curr ? 0 : 1)
  return effectiveMute(trackApi)
}

/**
 * Toggle a track's solo, honoring exclusive-solo. Returns the new solo
 * state (0/1). `lookupApi` is a throwaway LiveAPI for the exclusive sweep.
 */
export function toggleSolo(trackApi: LiveAPI, lookupApi: LiveAPI): number {
  if (!trackApi || +trackApi.id === 0) return 0
  const next = parseInt(trackApi.get('solo').toString()) ? 0 : 1
  if (next) handleExclusiveSolo(parseInt(trackApi.id.toString()), lookupApi)
  trackApi.set('solo', next)
  return next
}

/**
 * Compute the crossfade A/B indicator pair from a mixer_device's
 * crossfade_assign (0=A, 1=off, 2=B). Returns [aOn, bOn].
 */
export function xfadeAB(mixerApi: LiveAPI): [number, number] {
  if (!mixerApi || +mixerApi.id === 0) return [0, 0]
  const x = parseInt(mixerApi.get('crossfade_assign').toString()) || 0
  return [x === 0 ? 1 : 0, x === 2 ? 1 : 0]
}
