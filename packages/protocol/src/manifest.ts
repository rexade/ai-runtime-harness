import type { ActionMetadata } from './action'

export const AI_HARNESS_PROTOCOL_VERSION = '0.1.0'

export type HarnessSurfaceType = 'app' | 'game' | 'dashboard' | 'simulation'
export type HarnessReadinessState = 'booting' | 'registering' | 'ready' | 'error'

export interface StoreMetadata {
  name: string
  mutable: boolean
  dispatchable: boolean
}

export interface HarnessSurfaceSummary {
  surfaceId: string
  surfaceName: string
  surfaceType: HarnessSurfaceType
  readiness: HarnessReadinessState
  readinessMessage?: string
  current: boolean
}

export interface HarnessCapabilities {
  dom: boolean
  reactTree: boolean
  stores: boolean
  console: boolean
  network: boolean
  errors: boolean
  screenshots: boolean
  browserInput: boolean
  frameControl: boolean
}

export interface HarnessSurfaceManifest {
  runtime: 'browser'
  surfaceId: string
  surfaceName: string
  surfaceType: HarnessSurfaceType
  protocolVersion: string
  runtimeVersion: string
  appVersion?: string
  framework?: string
  sessionId: string | null
  readiness: HarnessReadinessState
  readinessMessage?: string
  current: boolean
  stores: StoreMetadata[]
  affordances: ActionMetadata[]
  capabilities: HarnessCapabilities
}
