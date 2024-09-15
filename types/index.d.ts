type ParamType = {
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
}

type MessageType =
  | [string, number | boolean | string]
  | [string, number, number, number, number]
