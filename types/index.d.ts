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

type IdObserverArg = [
  'id' | 'devices' | 'tracks' | 'return_tracks' | 'value',
  number,
]
type IdArr = number[]
type ObjType = 'track' | 'return' | 'main' | 'device'

type TreeNode = {
  obj: MaxObjRecord
  parent: number
  children: IdArr
}

type Tree = Record<string, TreeNode>
type ClassObj = {
  watch: LiveAPI
  last: string
  tree: Tree
}

type MaxTask = Task & { freepeer: () => void }
