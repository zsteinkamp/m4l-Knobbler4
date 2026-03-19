import { cleanArr } from './utils'
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
