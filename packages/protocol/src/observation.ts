import type { ActionMetadata } from './action'
import type { HarnessSurfaceType } from './manifest'

export interface DomSnapshot {
  tag: string
  id?: string
  className?: string
  text?: string
  attrs: Record<string, string>
  children: DomSnapshot[]
}

export interface ComponentSnapshot {
  name: string
  props: Record<string, unknown>
  state: unknown
  children: ComponentSnapshot[]
}

export interface StoreSnapshot {
  name: string
  state: unknown
  mutable?: boolean
  dispatchable?: boolean
}

export interface NetworkEvent {
  url: string
  method: string
  status?: number
  duration?: number
  requestBody?: unknown
  responseBody?: unknown
  timestamp: number
}

export interface ConsoleEvent {
  level: 'log' | 'warn' | 'error' | 'info'
  args: unknown[]
  timestamp: number
}

export interface RuntimeError {
  message: string
  source?: string
  line?: number
  col?: number
  timestamp: number
}

export type HarnessConnectionState =
  | 'idle'
  | 'registering'
  | 'registered'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error'

export type HarnessMode = 'explorer' | 'recording' | 'replay'

export type HarnessActionSource = 'browser-driver' | 'semantic-affordance' | 'debug-mutation'

export interface HarnessLastAction {
  name: string
  source: HarnessActionSource
  detail?: string
  surfaceId: string | null
  surfaceName: string | null
  surfaceType: HarnessSurfaceType | null
  timestamp: number
}

export interface HarnessSessionState {
  sessionId: string | null
  connection: HarnessConnectionState
  recording: boolean
  mode: HarnessMode
  selectedSurfaceId: string | null
  selectedSurfaceName: string | null
  selectedSurfaceType: HarnessSurfaceType | null
  lastAction: HarnessLastAction | null
  updatedAt: number
}

export interface Observation {
  runtime: 'browser'
  time: number
  actions?: ActionMetadata[]
  session?: HarnessSessionState
  dom?: DomSnapshot
  components?: ComponentSnapshot[]
  stores?: StoreSnapshot[]
  network?: NetworkEvent[]
  console?: ConsoleEvent[]
  errors?: RuntimeError[]
}
