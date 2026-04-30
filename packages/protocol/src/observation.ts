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

export interface Observation {
  runtime: 'browser'
  time: number
  dom?: DomSnapshot
  components?: ComponentSnapshot[]
  stores?: StoreSnapshot[]
  network?: NetworkEvent[]
  console?: ConsoleEvent[]
  errors?: RuntimeError[]
}
