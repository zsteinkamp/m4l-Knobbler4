export const INLET_MSGS = 0
// [v8 knobbler] entry outlet map (shared by all folded-in modules):
export const OUTLET_OSC = 0 // OSC out -> [gate] -> [node.script] sender
export const OUTLET_MSGS = 1 // knobblerCore -> knob-slot bpatcher messages
export const OUTLET_SHORTCUT_NAME = 2 // [slot, name] -> [s ---shortcutName] (device-UI labels)
// k4-system (former [v8 router]) Max-side passthroughs:
export const OUTLET_REFRESH = 3 // 'refresh'/'initMenuOnly' -> [s ---REFRESH_LOGIC]
export const OUTLET_PAGE = 4 // 'page' <name> -> [s ---PAGE] (page UI)
export const OUTLET_CONFIGURE = 5 // 'host'/'port' -> [s ---CONFIGURE] (node sender target)
// Knobbler slots are shown as named pages of SLOTS_PER_PAGE (2 rows of
// SLOTS_PER_ROW), page k owning slots k*16+1..k*16+16. Only the first
// LEGACY_UI_SLOTS have a knob-slot bpatcher in the .amxd and are what an app
// without CAPABILITY_PAGES addresses.
export const SLOTS_PER_ROW = 8
export const SLOTS_PER_PAGE = 16
export const LEGACY_UI_SLOTS = 32
export const MAX_PAGES = 16
export const MAX_SLOTS = MAX_PAGES * SLOTS_PER_PAGE
// The Knobbler tab's 16 view bpatchers are addressed as OUTLET_MSGS targets
// VIEW_TARGET_BASE+1..+16, clear of the legacy importers' 1..32.
export const VIEW_TARGET_BASE = 1000

export const TYPE_TRACK = 0
export const TYPE_CHAIN = 1
export const TYPE_RETURN = 2
export const TYPE_MAIN = 3
export const TYPE_GROUP = 4
export const TYPE_DEVICE = 5
export const TYPE_RACK = 6
export const TYPE_CHILD_CHAIN = 7

export const DEFAULT_COLOR = '990000'
export const DEFAULT_COLOR_FF = DEFAULT_COLOR + 'FF'

export const noFn = () => {}

export const MAX_NAME_LEN = 32
export const MAX_SENDS = 12
export const PAUSE_MS = 300
export const METER_FLUSH_MS = 30

export const nullString = '- - -'

// indices into MaxObjRecord arrays for fields
export const FIELD_TYPE = 0
export const FIELD_ID = 1
export const FIELD_NAME = 2
export const FIELD_COLOR = 3
export const FIELD_INDENT = 4
