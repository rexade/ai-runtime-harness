export type RequestType =
  | 'GET_DOM'
  | 'GET_REACT_TREE'
  | 'GET_STORE'
  | 'GET_CONSOLE'
  | 'GET_NETWORK'
  | 'GET_ERRORS'
  | 'CLICK'
  | 'TYPE'
  | 'NAVIGATE'
  | 'SCROLL'
  | 'HOVER'
  | 'MOCK_API'
  | 'CALL_ACTION'
  | 'SET_STORE_STATE'
  | 'DISPATCH_STORE_ACTION'

export interface HarnessRequest {
  id: string
  type: RequestType
  payload?: unknown
}

export interface HarnessResponse {
  id: string
  ok: boolean
  result?: unknown
  error?: string
}
