type ParamType = {
  parentName?: string
  val: number
  min: number
  max: number
  quant: number
  quantItems: string[]
  id?: number
  path?: string
  customName?: string
  name?: string
  deviceName?: string
  trackName?: string
  trackColor?: string
  allowParamValueUpdates?: boolean
}

type MessageType =
  | [string, number | boolean | string]
  | [string, number, number, number, number]

type NameBank = {
  name: string
  paramNames: (string | number)[]
}
type BluhandBank = {
  name: string
  paramIdxArr: number[]
}

// Orchestrator context: the entry owns the live module singletons + shared
// services and hands them to each module via init(ctx). Modules reach siblings
// through ctx instead of importing them (require() does not share state across
// files in [v8], so a direct import would be a separate, dead instance).
interface AppContext {
  // Outbound OSC singleton (k4-oscBatch.send). Each module wires its own utils
  // instance to this in init() via setOscSink(ctx.osc) — require() gives every
  // file a separate utils instance, so the batch buffer is reached through ctx.
  osc(addr: string, val: any): void
  knobbler: { bkMap(knobblerSlot: number, paramId: number): void }
  sidebar: { sidebarMeters(val: number): void }
  gotoDevice(deviceId: string): void // recall navigation (-> bluhand)
  gotoTrack(trackId: string): void // selects a track, unfolding enclosing groups (-> bluhand)
  notifyVisibleTracks(): void
  loopProbe(): void // feedback-loop guard: re-enable output + ping /loop (-> knobbler entry)
  // per-instance persistence (---settingsDict); one Dict ref, no key prefixing.
  // legacyGet reads the pre-[v8] shared [dict settingsDict] (prefixed keys) for
  // one-time migration of old sets.
  settings: {
    get(key: string): any
    set(key: string, value: any): void
    legacyGet(key: string): any
  }
}

// In-process route descriptor for the [v8 knobbler] dispatcher. Replaces the
// old router's (outlet, msgName) fan-out with a direct function reference.
// parse describes how the OSC address+value map to the handler's args:
//   bare    -> fn()
//   val     -> fn(value)
//   slot    -> fn(slotNum)            (slotNum parsed from the address suffix)
//   slotVal -> fn(slotNum, value)
//   custom  -> fn(address, value)
type RouteParse = 'bare' | 'val' | 'slot' | 'slotVal' | 'custom'
type Route = {
  prefix: string
  parse: RouteParse
  fn: (...args: any[]) => void
  coalesce?: boolean
}

//                   type,   id,     name    color, indent, use indent, parent
type MaxObjRecord = [number, number, string, string, number, number, number]

type IdObserverArg = [
  'id' | 'devices' | 'tracks' | 'return_tracks' | 'value',
  number,
]
type IdArr = number[]

type MaxTask = Task & { freepeer: () => void }

// Fix @types/maxmsp: args should be optional per the docs
interface LiveAPI {
  call(func: string, args?: any): void
}
