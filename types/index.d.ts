type ParamType = {
  parentName?: string
  val: number
  min: number
  max: number
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

//                   type,   id,     name    color, indent
type MaxObjRecord = [number, number, string, string, number]

type IdObserverArg = (number | string)[]
type IdArr = number[]
type ListClass = 'track' | 'return' | 'main' | 'device'

type ClassObj = {
  watch: LiveAPI
  ids: IdArr
  objs: MaxObjRecord[]
  last: string
}
