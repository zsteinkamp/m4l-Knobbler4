// FULL PARAM NAME

inlets = 1
outlets = 1

const OUTLET_PARAM_NAME = 0
const INLET_INPUT = 0

setinletassist(INLET_INPUT, 'Input (object ID)')
setoutletassist(OUTLET_PARAM_NAME, 'Param Name (string)')

post('RELOADED fullParamName.js\n')

const log = function () {
  for (let i = 0, len = arguments.length; i < len; i++) {
    const message = arguments[i]
    if (message && message.toString) {
      let s = message.toString()
      if (s.indexOf('[object ') >= 0) {
        s = JSON.stringify(message)
      }
      post(s)
    } else if (message === null) {
      post('<null>')
    } else {
      post(message)
    }
  }
  post('\n')
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
