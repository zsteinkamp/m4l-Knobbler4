autowatch = 1
inlets = 1
outlets = 1

const INLET_FOO = 0
const OUTLET_FOO = 0

setinletassist(INLET_FOO, 'Description of Inlet')
setoutletassist(OUTLET_FOO, 'Description of Outlet')

const debugLog = true

function debug(_: any) {
  if (debugLog) {
    post(
      //'[' + debug.caller ? debug.caller.name : 'ROOT' + ']',
      Array.prototype.slice.call(arguments).join(' '),
      '\n'
    )
  }
}

debug('reloaded')
