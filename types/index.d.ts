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
  paramNames: string[]
}
type BluhandBank = {
  name: string
  paramIdxArr: number[]
}
