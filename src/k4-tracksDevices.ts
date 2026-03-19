autowatch = 1
inlets = 1
outlets = 2

import {
  cleanArr,
  colorToString,
  isDeviceSupported,
  loadSetting,
  logFactory,
  saveSetting,
  truncate,
} from './utils'
import config from './config'
import {
  FIELD_INDENT,
  INLET_MSGS,
  MAX_NAME_LEN,
  OUTLET_MSGS,
  OUTLET_OSC,
  TYPE_CHAIN,
  TYPE_CHILD_CHAIN,
  TYPE_DEVICE,
  TYPE_RACK,
  noFn,
} from './consts'

const log = logFactory(config)

const CHUNK_MAX_BYTES = 1024
function clientHasCapability(cap: string): boolean {
  const caps = loadSetting('clientCapabilities')
  if (!caps) {
    return false
  }
  return (' ' + caps.toString() + ' ').indexOf(' ' + cap + ' ') !== -1
}

function sendNavData(prefix: string, items: MaxObjRecord[]) {
  const chunked = clientHasCapability('cNav')
  if (chunked) {
    // chunked protocol: start, chunk(s), end
    outlet(OUTLET_OSC, [prefix + '/start', items.length])

    let chunkParts: string[] = []
    let chunkSize = 2 // for the surrounding []
    for (let i = 0; i < items.length; i++) {
      const itemJson = JSON.stringify(items[i])
      const added = (chunkParts.length > 0 ? 1 : 0) + itemJson.length // comma + item
      if (chunkParts.length > 0 && chunkSize + added > CHUNK_MAX_BYTES) {
        outlet(OUTLET_OSC, [prefix + '/chunk', '[' + chunkParts.join(',') + ']'])
        chunkParts = []
        chunkSize = 2
      }
      chunkParts.push(itemJson)
      chunkSize += added
    }
    if (chunkParts.length > 0) {
      outlet(OUTLET_OSC, [prefix + '/chunk', '[' + chunkParts.join(',') + ']'])
    }

    outlet(OUTLET_OSC, [prefix + '/end'])
  }
  // legacy: send full payload for old/unknown clients (may truncate on large sets)
  if (!chunked) {
    outlet(OUTLET_OSC, [prefix, JSON.stringify(items)])
  }
}

setinletassist(INLET_MSGS, 'Receives messages and args to call JS functions')
setoutletassist(OUTLET_OSC, 'Output OSC messages to [udpsend]')
setoutletassist(OUTLET_MSGS, 'Messages')

const state = {
  api: null as LiveAPI,
  currDeviceId: null as number,
  currDeviceWatcher: null as LiveAPI,
  currTrackId: null as number,
  currTrackWatcher: null as LiveAPI,
}

function onCurrDeviceChange(val: IdObserverArg) {
  if (val[0] !== 'id') {
    return
  }
  const newId = cleanArr(val)[0]
  if (state.currDeviceId === newId) {
    return
  }
  state.currDeviceId = newId

  updateDeviceNav()
}

function updateDeviceNav() {
  //log('DEVICE ID=' + state.currDeviceId + ' TRACKID=' + state.currTrackId)
  if (+state.currDeviceId === 0) {
    // if no device is selected, null out the devices list
    outlet(OUTLET_OSC, ['/nav/currDeviceId', -1])
    //log('/nav/devices=' + JSON.stringify([]))
    sendNavData('/nav/devices', [])
    return
  }

  //log('NEW CURR DEVICE ID=' + state.currDeviceId)
  outlet(OUTLET_OSC, ['/nav/currDeviceId', state.currDeviceId])

  const ret: MaxObjRecord[] = []
  const utilObj = state.api
  utilObj.path = 'live_set'
  const currDeviceObj = new LiveAPI(noFn, 'id ' + state.currDeviceId)
  if (+currDeviceObj.id === 0) return
  const currIsSupported = isDeviceSupported(currDeviceObj)

  const parentObj = new LiveAPI(
    noFn,
    currIsSupported
      ? currDeviceObj.get('canonical_parent')
      : 'id ' + state.currTrackId
  )
  if (+parentObj.id === 0) return
  // handle cases where the device has an incomplete jsliveapi implementation, e.g. CC Control
  const parentChildIds = cleanArr(parentObj.get('devices'))

  // first, self and siblings (with chain children under self)
  for (const childDeviceId of parentChildIds) {
    utilObj.id = childDeviceId
    const objIsSupported = isDeviceSupported(utilObj)
    ret.push([
      /* TYPE   */ objIsSupported && parseInt(utilObj.get('can_have_chains'))
        ? TYPE_RACK
        : TYPE_DEVICE,
      /* ID     */ childDeviceId,
      /* NAME   */ objIsSupported
        ? truncate(utilObj.get('name').toString(), MAX_NAME_LEN)
        : '? Unsupported',
      /* COLOR  */ colorToString(parentObj.get('color').toString()),
      /* INDENT */ 0, // temporary indent
      /* USE INDENT */ 0, // temporary indent
      /* PARENT */ parentObj.id,
    ])
    if (childDeviceId === state.currDeviceId) {
      // add child chains below the current item
      if (objIsSupported && parseInt(currDeviceObj.get('can_have_chains'))) {
        const chainIds = cleanArr(utilObj.get('chains'))
        for (const chainId of chainIds) {
          utilObj.id = chainId
          ret.push([
            /* TYPE   */ TYPE_CHILD_CHAIN,
            /* ID     */ chainId,
            /* NAME   */ truncate(utilObj.get('name').toString(), MAX_NAME_LEN),
            /* COLOR  */ colorToString(utilObj.get('color').toString()),
            /* INDENT */ 1, // temporary indent
            /* USE INDENT */ 1, // temporary indent
            /* PARENT */ parentObj.id,
          ])
        }

        if (currDeviceObj.info.toString().match('return_chains')) {
          // drum racks have return chains
          const returnChainIds = cleanArr(currDeviceObj.get('return_chains'))
          for (const chainId of returnChainIds) {
            utilObj.id = chainId
            ret.push([
              /* TYPE   */ TYPE_CHILD_CHAIN,
              /* ID     */ chainId,
              /* NAME   */ truncate(
                utilObj.get('name').toString(),
                MAX_NAME_LEN
              ),
              /* COLOR  */ colorToString(utilObj.get('color').toString()),
              /* INDENT */ 1, // temporary indent
              /* USE INDENT */ 1, // temporary indent
              /* PARENT */ parentObj.id,
            ])
          }
        }
      }
    }
  }
  // now add hierarchy, up to when the parent is a track
  let indent = 0
  let watchdog = 0

  while (parentObj.type !== 'Track' && watchdog < 20) {
    const isChain = parentObj.type === 'Chain' || parentObj.type === 'DrumChain'
    let color = null
    if (isChain) {
      color = colorToString(parentObj.get('color').toString())
    } else {
      const grandparentId = cleanArr(parentObj.get('canonical_parent'))[0]
      utilObj.id = grandparentId
      color = colorToString(utilObj.get('color').toString())
    }

    const parentObjParentId = cleanArr(parentObj.get('canonical_parent'))[0]

    ret.unshift([
      /* TYPE   */ isChain ? TYPE_CHAIN : TYPE_RACK,
      /* ID     */ parentObj.id,
      /* NAME   */ truncate(parentObj.get('name').toString(), MAX_NAME_LEN),
      /* COLOR  */ color,
      /* INDENT */ --indent, // temporary indent
      /* USEINDENT */ --indent, // temporary indent
      /* PARENT */ parseInt(parentObjParentId.toString()),
    ])
    // needs to be after
    parentObj.id = parentObjParentId
    //log('CP=' + parentObjParentId)
    //log('NEWTYPE=' + parentObj.type)
    watchdog++
  }

  // now normalize device indentation ... the first item in the ret[] list needs
  // to become zero, but may be negative
  if (ret.length > 0) {
    const baseIndent = ret[0][FIELD_INDENT]
    for (const maxObj of ret) {
      maxObj[FIELD_INDENT] -= baseIndent
    }
  }

  //log('/nav/devices=' + JSON.stringify(ret))
  sendNavData('/nav/devices', ret)
}

function onCurrTrackChange(val: IdObserverArg) {
  if (val[0] !== 'id' && val[1].toString() !== 'id') {
    return
  }
  const newId = cleanArr(val)[0]
  if (state.currTrackId === newId) {
    return
  }
  if (newId === 0) {
    return
  }
  state.currTrackId = newId

  outlet(OUTLET_OSC, ['/nav/currTrackId', state.currTrackId])

  // ensure a device is selected if one exists
  state.api.path = 'live_set view selected_track view selected_device'
  if (+state.api.id === 0) {
    state.api.path = 'live_set view selected_track'
    const devices = cleanArr(state.api.get('devices'))
    if (devices.length > 0) {
      state.api.path = 'live_set view'
      state.api.call('select_device', 'id ' + devices[0])
    }
  }
}

function init() {
  saveSetting('clientVersion', '')
  saveSetting('clientCapabilities', '')
  state.currDeviceId = null
  state.currTrackId = null

  state.api = new LiveAPI(noFn, 'live_set')

  state.currTrackWatcher = new LiveAPI(
    onCurrTrackChange,
    'live_set view selected_track'
  )
  state.currTrackWatcher.mode = 1
  state.currTrackWatcher.property = 'id'

  state.currDeviceWatcher = new LiveAPI(
    onCurrDeviceChange,
    'live_set view selected_track view selected_device'
  )
  state.currDeviceWatcher.mode = 1
  state.currDeviceWatcher.property = 'id'
}

log('reloaded k4-tracksDevices')

// NOTE: This section must appear in any .ts file that is directuly used by a
// [js] or [jsui] object so that tsc generates valid JS for Max.
const module = {}
export = {}
