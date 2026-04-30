import type {
  ActionMetadata,
  HarnessCapabilities,
  HarnessActionKind,
  HarnessActionSafety,
  HarnessExecutionPath,
  HarnessReadinessState,
  HarnessSurfaceType,
  SuccessContract,
} from '@ai-runtime-harness/protocol'
import type { HarnessAction, HarnessRuntimeConfig } from './harness-state'
import {
  buildHarnessManifest,
  getCurrentHarnessSurfaceId,
  getOrCreateHarnessSurface,
  getHarnessSurfaceConfig,
  getHarnessSessionState,
  listHarnessSurfaces,
  selectHarnessSurface,
  subscribeHarnessSession,
  updateHarnessSurface,
  updateHarnessConfig,
} from './harness-state'
import { initializeHarnessRuntime } from './runtime'

export interface HarnessActionMetadataInput {
  kind: HarnessActionKind
  safety: HarnessActionSafety
  description: string
  executionPath?: HarnessExecutionPath
  provesUserFlow?: boolean
  argsSchema?: unknown
  successContract?: SuccessContract
}

export interface HarnessSurfaceInput {
  id: string
  name: string
  type: HarnessSurfaceType
  runtimeVersion: string
  appVersion?: string
  framework?: string
  readiness?: HarnessReadinessState
  readinessMessage?: string
  capabilities?: Partial<HarnessCapabilities>
  current?: boolean
}

export function registerHarnessStore(
  surfaceId: string,
  name: string,
  getState: () => unknown,
  setState?: (patch: unknown) => void,
  dispatch?: (action: unknown) => void,
) {
  getOrCreateHarnessSurface(surfaceId).stores.register(name, getState, setState, dispatch)
}

export function registerHarnessAction(
  surfaceId: string,
  name: string,
  fn: HarnessAction,
  metadata: HarnessActionMetadataInput,
) {
  const actionMetadata: ActionMetadata = {
    name,
    kind: metadata.kind,
    safety: metadata.safety,
    executionPath: metadata.executionPath ?? defaultExecutionPath(metadata.kind),
    description: metadata.description,
    provesUserFlow: metadata.provesUserFlow ?? defaultProvesUserFlow(metadata.executionPath ?? defaultExecutionPath(metadata.kind)),
    argsSchema: metadata.argsSchema,
    successContract: metadata.successContract,
  }

  getOrCreateHarnessSurface(surfaceId).actions[name] = {
    fn,
    metadata: actionMetadata,
  }
}

export function registerHarnessSurface(surface: HarnessSurfaceInput) {
  const registered = updateHarnessSurface(surface.id, {
    name: surface.name,
    type: surface.type,
    runtimeVersion: surface.runtimeVersion,
    appVersion: surface.appVersion,
    framework: surface.framework,
    readiness: surface.readiness ?? 'registering',
    readinessMessage: surface.readinessMessage ?? `Registering ${surface.name}.`,
    capabilities: surface.capabilities,
  })

  if (surface.current) {
    selectHarnessSurface(surface.id)
  }

  return registered
}

export function setHarnessReadiness(
  readiness: HarnessReadinessState,
  readinessMessage?: string,
  surfaceId?: string,
) {
  const targetSurfaceId = surfaceId ?? getCurrentHarnessSurfaceId() ?? 'default'
  return updateHarnessSurface(targetSurfaceId, {
    readiness,
    readinessMessage,
  })
}

export function setCurrentHarnessSurface(surfaceId: string) {
  return selectHarnessSurface(surfaceId)
}

export function enableHarnessConnection(config: HarnessRuntimeConfig = {}) {
  updateHarnessConfig({ ...config, autoConnect: true })
  initializeHarnessRuntime().connect?.()
}

function defaultExecutionPath(kind: HarnessActionKind): HarnessExecutionPath {
  if (kind === 'player') return 'game-input'
  if (kind === 'mutation') return 'state-mutation'
  if (kind === 'debug') return 'semantic-action'
  return 'system'
}

function defaultProvesUserFlow(executionPath: HarnessExecutionPath) {
  return executionPath === 'visible-ui' || executionPath === 'game-input'
}

export {
  buildHarnessManifest,
  getCurrentHarnessSurfaceId,
  getHarnessSessionState,
  getHarnessSurfaceConfig,
  listHarnessSurfaces,
  subscribeHarnessSession,
}
