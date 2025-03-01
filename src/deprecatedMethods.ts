import { logFactory } from './utils'
import config from './config'
import { noFn } from './consts'

const log = logFactory(config)
let liveSetApi: LiveAPI = null
function getApi() {
  if (!liveSetApi) {
    liveSetApi = new LiveAPI(noFn, 'live_set')
  }
  return liveSetApi
}

export function deprecatedTrackDelta(delta: -1 | 1) {
  //log('TRACK DELTA ' + delta)
  const setObj = getApi()
  const viewObj = new LiveAPI(() => {}, 'live_set view')

  const track = viewObj.get('selected_track')
  const trackObj = new LiveAPI(() => {}, track)

  const path = trackObj.unquotedpath.split(' ').slice(0, 3).join(' ')
  const isReturn = !!path.match(/ return_tracks /)
  const isMaster = !!path.match(/ master_track/)
  const tracks = setObj.get('tracks')
  const returnTracks = setObj.get('return_tracks')
  const numTracks = tracks.length / 2
  const numReturnTracks = returnTracks.length / 2

  //log('UQPATH=' + path)

  if (isMaster) {
    //log('ISMASTER')
    if (delta > 0) {
      //log('NONEXT')
      // no "next" from master, only "prev"
      return
    }
    if (numReturnTracks) {
      //log('RETURN  live_set return_tracks ' + (numReturnTracks - 1))
      trackObj.goto('live_set return_tracks ' + (numReturnTracks - 1))
    } else {
      //log('RETURN live_set tracks ' + (numTracks - 1))
      trackObj.goto('live_set tracks ' + (numTracks - 1))
    }
  } else {
    // not master (return or track)
    const trackIdx = parseInt(path.match(/\d+$/)[0] || '0')
    if (isReturn) {
      if (delta < 0) {
        // prev track
        if (trackIdx < 1) {
          // shift to last track
          trackObj.goto('live_set tracks ' + (numTracks - 1))
        } else {
          trackObj.goto('live_set return_tracks ' + (trackIdx + delta))
        }
      } else {
        // next track
        if (trackIdx >= numReturnTracks - 1) {
          // last return track, so go to master
          trackObj.goto('live_set master_track')
        } else {
          trackObj.goto('live_set return_tracks ' + (trackIdx + delta))
        }
      }
    } else {
      // regular track
      if (delta < 0) {
        // prev track
        if (trackIdx < 1) {
          // no "prev" from first track
          return
        }
        trackObj.goto('live_set tracks ' + (trackIdx + delta))
      } else {
        // next track
        if (trackIdx < numTracks - 1) {
          trackObj.goto('live_set tracks ' + (trackIdx + delta))
        } else {
          if (numReturnTracks) {
            trackObj.goto('live_set return_tracks 0')
          } else {
            trackObj.goto('live_set master_track')
          }
        }
      }
    }
  }

  if (trackObj.id == 0) {
    log('HMM ZERO ' + trackObj.unquotedpath)
    return
  }

  viewObj.set('selected_track', ['id', trackObj.id])
  //log('TRACK ' + trackObj.id)
}

export function deprecatedDeviceDelta(delta: -1 | 1) {
  const devObj = new LiveAPI(
    () => {},
    'live_set view selected_track view selected_device'
  )
  if (devObj.id == 0) {
    return
  }
  const path = devObj.unquotedpath
  const devIdx = parseInt(path.match(/\d+$/)[0] || '0')
  try {
    const newPath = path.replace(/\d+$/, (devIdx + delta).toString())
    const newObj = new LiveAPI(() => {}, newPath)
    const viewApi = new LiveAPI(() => {}, 'live_set view')
    if (newObj.id > 0) {
      viewApi.call('select_device', ['id', newObj.id])
    } else {
      const parentPath = path.split(' ').slice(0, -2).join(' ')
      if (parentPath.indexOf(' devices ') > -1) {
        const parentObj = new LiveAPI(() => {}, parentPath)
        //log('PARENT_PATH ' + parentPath + ' ' + parentObj.type)
        if (parentObj.id > 0 && parentObj.type !== 'Chain') {
          viewApi.call('select_device', ['id', parentObj.id])
        } else {
          const gparentPath = path.split(' ').slice(0, -4).join(' ')
          if (gparentPath.indexOf(' devices ') > -1) {
            //log('GPARENT_PATH ' + parentPath)
            const gparentObj = new LiveAPI(() => {}, gparentPath)
            if (gparentObj.id > 0) {
              viewApi.call('select_device', ['id', gparentObj.id])
            }
          }
        }
      }
    }
  } catch (e) {}
  //log('APPORT ' + devObj.id)
}
