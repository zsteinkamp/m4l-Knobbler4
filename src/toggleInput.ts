import { logFactory } from './utils'
import config from './config'
import { noFn } from './consts'

const origInputs = {} as Record<string, any>

const log = logFactory(config)

export function getTrackInputStatus(currTrack: LiveAPI) {
  var airt = null
  let currentInput = null
  let noInput = null
  let allInputs = null
  let inputEnabled = false
  //log(
  //  'GET INPUT STATUS ' + currTrack.type + ' ' + currTrack.get('can_be_armed')
  //)
  if (
    currTrack.get('is_foldable') == '0' &&
    currTrack.get('can_be_armed') == '1'
  ) {
    var airt = JSON.parse(
      currTrack.get('available_input_routing_types').toString()
    ).available_input_routing_types
    currentInput = JSON.parse(
      currTrack.get('input_routing_type').toString()
    ).input_routing_type
    allInputs = airt[0]
    noInput = airt[airt.length - 1] // "No Input" is the last available input routing type
    inputEnabled = currentInput.display_name !== noInput.display_name
  }

  const ret = {
    currentInput: currentInput,
    noInput: noInput,
    inputEnabled: inputEnabled,
    allInputs: allInputs,
  }

  //log('TRACK_INPUT_STATUS ' + JSON.stringify(ret))
  return ret
}

enum Intent {
  Disable,
  Enable,
  Toggle,
}

function changeInternal(trackObj: LiveAPI, intent: Intent) {
  //log('CHANGE INTERNAL id=' + trackObj.id + ' ' + intent)
  let ret = null
  const trackStatus = getTrackInputStatus(trackObj)
  if (trackStatus.inputEnabled) {
    if (intent === Intent.Disable || intent === Intent.Toggle) {
      origInputs[trackObj.id] = trackStatus.currentInput
      // set to No Input
      ret = trackStatus.noInput
      //log('GONNA ENABLE ' + JSON.stringify(ret))
    }
  } else {
    // input disabled
    if (intent === Intent.Enable || intent === Intent.Toggle) {
      ret = origInputs[trackObj.id] || trackStatus.allInputs

      if (!ret) {
        //log('FALLBACK')
        ret = JSON.parse(
          trackObj.get('available_input_routing_types').toString()
        ).available_input_routing_types[0]
      }
    }
  }
  if (ret) {
    //log('SET ROUTING TYPE ' + JSON.stringify(ret))
    trackObj.set('input_routing_type', ret)
  }
}

export function disableTrackInput(trackObj: LiveAPI) {
  changeInternal(trackObj, Intent.Disable)
}
export function enableTrackInput(trackObj: LiveAPI) {
  changeInternal(trackObj, Intent.Enable)
}
export function toggleTrackInput(trackObj: LiveAPI) {
  changeInternal(trackObj, Intent.Toggle)
}

log('reloaded toggleInput')
