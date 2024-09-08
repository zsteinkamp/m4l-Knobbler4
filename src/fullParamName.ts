// FULL PARAM NAME

inlets = 1
outlets = 1

const OUTLET_PARAM_NAME = 0
const INLET_INPUT = 0

setinletassist(INLET_INPUT, 'Input (object ID)')
setoutletassist(OUTLET_PARAM_NAME, 'Param Name (string)')

const fpDebugLog = false

function fpDebug(_: any) {
  if (fpDebugLog) {
    post(
      tiDebug.caller ? tiDebug.caller.name : 'ROOT',
      Array.prototype.slice.call(arguments).join(' '),
      '\n'
    )
  }
}

function updateParamName(objId: string) {
  //log(objId)
  const nameArr = []
  let counter = 0
  let obj = new LiveAPI(() => {}, 'id ' + objId)

  if (obj.id == 0) {
    return
  }

  while (counter < 10) {
    if (obj.type === 'Song') {
      break
    }
    if (obj.type === 'MixerDevice') {
      nameArr.unshift('Mixer')
    } else {
      nameArr.unshift(obj.get('name'))
    }
    obj = new LiveAPI(() => {}, obj.get('canonical_parent'))
    counter++
  }
  outlet(OUTLET_PARAM_NAME, nameArr.join(' > '))
}

fpDebug('reloaded fullParamName\n')
