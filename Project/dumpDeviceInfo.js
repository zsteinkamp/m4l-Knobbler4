// Dump info and parameters for the device immediately before this one.
// Place right after the device to inspect, send a bang.

autowatch = 1
inlets = 1
outlets = 0

function bang() {
  var thisDevice = new LiveAPI(function(){}, 'this_device')
  var thisPath = thisDevice.unquotedpath
  var lastDevicesIdx = thisPath.lastIndexOf('devices ')
  var trackPath = thisPath.substring(0, lastDevicesIdx).trim()
  var myIndex = parseInt(thisPath.substring(lastDevicesIdx + 8))

  if (myIndex <= 0) {
    post('\nNo device found before this one.\n')
    return
  }

  var prevPath = trackPath + ' devices ' + (myIndex - 1)
  var dev = new LiveAPI(function(){}, prevPath)
  post('\n=== ' + dev.get('name') + ' (class=' + dev.get('class_name') + ') ===\n')

  var raw = dev.get('parameters')
  var paramIds = []
  for (var i = 0; i < raw.length; i++) {
    if (raw[i] !== 'id') {
      paramIds.push(parseInt(raw[i]))
    }
  }

  post('Parameters (' + paramIds.length + '):\n')
  for (var p = 0; p < paramIds.length; p++) {
    var param = new LiveAPI(function(){}, 'id ' + paramIds[p])
    post('  [' + p + '] ' + param.get('name') + ' = ' + param.get('value') + ' (' + param.get('min') + ' .. ' + param.get('max') + ')\n')
  }
  post('=== Done ===\n')
}
