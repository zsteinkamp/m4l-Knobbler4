// Standalone diagnostic: dump info and parameters for the device immediately
// before this [js] object on the same track.
// Usage: place this device right after the device you want to inspect,
// then send it a bang.

autowatch = 1
inlets = 1
outlets = 0

function bang() {
  // Find this M4L device's path to determine track and device index
  var thisDevice = new LiveAPI(function(){}, 'this_device')
  var thisPath = thisDevice.unquotedpath
  post('\nthis_device id=' + thisDevice.id + ' path=' + thisPath + '\n')

  // Parse the path to get the track path and our device index
  // Path format: "live_set tracks N devices M" (or similar with chains)
  var lastDevicesIdx = thisPath.lastIndexOf('devices ')
  if (lastDevicesIdx === -1) {
    post('Could not parse device path\n')
    return
  }
  var trackPath = thisPath.substring(0, lastDevicesIdx).trim()
  var myIndex = parseInt(thisPath.substring(lastDevicesIdx + 8))
  post('trackPath=' + trackPath + ' myIndex=' + myIndex + '\n')

  if (myIndex <= 0) {
    post('\nNo device found before this one.\n')
    return
  }

  // Get the preceding device
  var prevPath = trackPath + ' devices ' + (myIndex - 1)
  var api = new LiveAPI(function(){}, prevPath)
  if (+api.id === 0) {
    post('Could not find device at ' + prevPath + '\n')
    return
  }
  var name = api.get('name')
  var className = api.get('class_name')
  var type = api.get('type')

  post('\n=== ' + name + ' (class=' + className + ', type=' + type + ') ===\n')
  post('Path: ' + api.unquotedpath + '\n')

  // Dump all parameters
  var numParams = parseInt(api.getcount('parameters'))
  post('\nParameters (' + numParams + '):\n')
  for (var p = 0; p < numParams; p++) {
    var paramApi = new LiveAPI(function(){}, prevPath + ' parameters ' + p)
    if (+paramApi.id === 0) break
    var pName = paramApi.get('name')
    var pMin = paramApi.get('min')
    var pMax = paramApi.get('max')
    var pVal = paramApi.get('value')
    post('  [' + p + '] ' + pName + ' = ' + pVal + ' (' + pMin + ' .. ' + pMax + ')\n')
  }
  post('\n=== Done ===\n')
}
