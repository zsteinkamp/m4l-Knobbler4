inlets = 1
outlets = 1

const origInputs: Record<string, any> = {}

let lo = null
let currTrack: LiveAPI = null
const debugLog = false

function debug(_: any) {
  if (debugLog) {
    post(
      debug.caller ? debug.caller.name : 'ROOT',
      Array.prototype.slice.call(arguments).join(' '),
      '\n'
    )
  }
}

debug('reloaded')

function getTrackStatus() {
  var airt = null
  let currentInput = null
  let noInput = null
  let allInputs = null
  let inputEnabled = false
  //debug(currTrack.type);
  if (
    currTrack.get('is_foldable') == '0' &&
    currTrack.get('can_be_frozen') == '1'
  ) {
    //debug("IN HERE");
    var airt = JSON.parse(
      currTrack.get('available_input_routing_types')
    ).available_input_routing_types
    currentInput = JSON.parse(
      currTrack.get('input_routing_type')
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
  //debug(JSON.stringify(ret));
  return ret
}

function updateTrackDisplay() {
  const trackStatus = getTrackStatus()
  //debug('inputEnabled?', trackStatus.inputEnabled);
  if (trackStatus.inputEnabled) {
    outlet(0, ['/toggleInput', 1])
  } else {
    outlet(0, ['/toggleInput', 0])
  }
}

function currentTrackCallback(a: IArguments) {
  const args = arrayfromargs(a)
  if (args.shift() !== 'selected_track') {
    //debug("RETURNING1");
    return
  }
  const trackId = args.join(' ')
  if (trackId === 'id 0') {
    //debug("RETURNING2");
    return
  }
  currTrack = new LiveAPI(() => {}, trackId)
  updateTrackDisplay()
}

function init() {
  //post("INIT\n");
  lo = new LiveAPI(currentTrackCallback, 'live_set view')
  lo.mode = 1
  lo.property = 'selected_track'
}

function toggle() {
  //debug("IN TOGGLE");
  const trackStatus = getTrackStatus()
  let ret = null
  if (trackStatus.inputEnabled) {
    origInputs[currTrack.id] = trackStatus.currentInput
    // set to No Input
    ret = trackStatus.noInput
  } else {
    // set to Original, TODO default to All Inputs
    ret = origInputs[currTrack.id] || trackStatus.allInputs
  }

  if (trackStatus.currentInput) {
    currTrack.set('input_routing_type', ret)
  }
  updateTrackDisplay()
}