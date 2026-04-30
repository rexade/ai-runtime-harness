import type {
  ActionMetadata,
  HarnessCapabilities,
  HarnessMode,
  HarnessReadinessState,
  HarnessSessionState,
  HarnessSurfaceManifest,
  HarnessSurfaceSummary,
  HarnessSurfaceType,
  RuntimeError,
  StoreMetadata,
  StoreSnapshot,
} from '@ai-runtime-harness/protocol'
import { StoresModule } from './stores'

const AI_HARNESS_PROTOCOL_VERSION = '0.1.0'
const DEFAULT_SURFACE_ID = 'default'

export type HarnessAction = (args: unknown) => unknown | Promise<unknown>
export type SessionListener = (session: HarnessSessionState) => void
type SurfaceSelectionMode = 'auto' | 'explicit'

export interface HarnessActionDefinition {
  fn: HarnessAction
  metadata: ActionMetadata
}

export interface HarnessSurfaceConfig {
  id: string
  name: string
  type: HarnessSurfaceType
  protocolVersion: string
  runtimeVersion: string
  appVersion?: string
  framework?: string
  readiness: HarnessReadinessState
  readinessMessage?: string
  capabilities: HarnessCapabilities
  stores: StoresModule
  actions: Record<string, HarnessActionDefinition>
}

export interface HarnessRuntimeConfig {
  autoConnect?: boolean
  url?: string
  onConnecting?: () => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event | Error) => void
}

export interface HarnessState {
  errors: RuntimeError[]
  initialized: boolean
  surfaces: Record<string, HarnessSurfaceConfig>
  currentSurfaceId: string | null
  surfaceSelectionMode: SurfaceSelectionMode
  session: HarnessSessionState
  sessionListeners: Set<SessionListener>
  connect?: () => void
}

type LegacyHarnessState = Partial<HarnessState> & {
  stores?: StoresModule
  actions?: Record<string, HarnessActionDefinition>
}

export type HarnessWindow = Window & {
  __AI_HARNESS__?: HarnessState
  __AI_HARNESS_CONFIG__?: HarnessRuntimeConfig
}

function readSessionIdFromUrl() {
  try {
    return new URL(window.location.href).searchParams.get('ai-harness-session')
  } catch {
    return null
  }
}

function createSessionState(): HarnessSessionState {
  return {
    sessionId: readSessionIdFromUrl(),
    connection: 'idle',
    recording: false,
    mode: 'explorer',
    selectedSurfaceId: null,
    selectedSurfaceName: null,
    selectedSurfaceType: null,
    lastAction: null,
    updatedAt: Date.now(),
  }
}

function defaultCapabilities(): HarnessCapabilities {
  return {
    dom: true,
    reactTree: true,
    stores: true,
    console: true,
    network: true,
    errors: true,
    screenshots: true,
    browserInput: true,
    frameControl: false,
  }
}

function createSurfaceState(id = DEFAULT_SURFACE_ID): HarnessSurfaceConfig {
  return {
    id,
    name: document.title?.trim() || (id === DEFAULT_SURFACE_ID ? 'AI Harness Surface' : id),
    type: 'app',
    protocolVersion: AI_HARNESS_PROTOCOL_VERSION,
    runtimeVersion: 'dev',
    readiness: 'booting',
    readinessMessage: 'Surface booting.',
    capabilities: defaultCapabilities(),
    stores: new StoresModule(),
    actions: {},
  }
}

function isFallbackSurfaceId(surfaceId: string) {
  return surfaceId === DEFAULT_SURFACE_ID
}

function isEmptyFallbackSurface(surface: HarnessSurfaceConfig) {
  return isFallbackSurfaceId(surface.id)
    && surface.stores.getAll().length === 0
    && Object.keys(surface.actions).length === 0
}

function listRegisteredSurfaceIds(state: HarnessState) {
  return Object.keys(state.surfaces).filter((surfaceId) => !isFallbackSurfaceId(surfaceId))
}

function ensureDefaultSurfaceState(existing?: LegacyHarnessState) {
  const migrated = existing?.surfaces?.[DEFAULT_SURFACE_ID]
  if (migrated) {
    return {
      ...createSurfaceState(DEFAULT_SURFACE_ID),
      ...migrated,
      id: DEFAULT_SURFACE_ID,
      capabilities: {
        ...defaultCapabilities(),
        ...(migrated.capabilities ?? {}),
      },
      stores: migrated.stores ?? new StoresModule(),
      actions: migrated.actions ?? {},
    }
  }

  const surface = createSurfaceState(DEFAULT_SURFACE_ID)
  if (existing?.stores) surface.stores = existing.stores
  if (existing?.actions) surface.actions = existing.actions
  return surface
}

function applySessionPatch(state: HarnessState, patch: Partial<HarnessSessionState>) {
  state.session = {
    ...state.session,
    ...patch,
    updatedAt: Date.now(),
  }

  for (const listener of state.sessionListeners) {
    listener(state.session)
  }

  return state.session
}

function syncSelectedSurfaceIntoSession(state: HarnessState, surfaceId: string | null) {
  const surface = surfaceId ? state.surfaces[surfaceId] ?? null : null
  const nextId = surface?.id ?? null
  const nextName = surface?.name ?? null
  const nextType = surface?.type ?? null

  if (
    state.session.selectedSurfaceId === nextId
    && state.session.selectedSurfaceName === nextName
    && state.session.selectedSurfaceType === nextType
  ) {
    return state.session
  }

  return applySessionPatch(state, {
    selectedSurfaceId: nextId,
    selectedSurfaceName: nextName,
    selectedSurfaceType: nextType,
  })
}

function syncAutoSurfaceSelection(state: HarnessState) {
  if (state.surfaceSelectionMode === 'explicit') {
    if (state.currentSurfaceId && state.surfaces[state.currentSurfaceId]) {
      syncSelectedSurfaceIntoSession(state, state.currentSurfaceId)
      return
    }

    state.surfaceSelectionMode = 'auto'
  }

  const surfaceIds = listRegisteredSurfaceIds(state)

  if (surfaceIds.length === 0) {
    state.currentSurfaceId = DEFAULT_SURFACE_ID
    syncSelectedSurfaceIntoSession(state, state.currentSurfaceId)
    return
  }

  if (surfaceIds.length === 1) {
    state.currentSurfaceId = surfaceIds[0]
    syncSelectedSurfaceIntoSession(state, state.currentSurfaceId)
    return
  }

  state.currentSurfaceId = null
  syncSelectedSurfaceIntoSession(state, null)
}

function getOrCreateSurface(state: HarnessState, surfaceId = DEFAULT_SURFACE_ID) {
  if (!state.surfaces[surfaceId]) {
    state.surfaces[surfaceId] = createSurfaceState(surfaceId)
    syncAutoSurfaceSelection(state)
  }

  return state.surfaces[surfaceId]
}

function resolveSurfaceConfig(state: HarnessState, surfaceId?: string) {
  if (surfaceId) {
    const surface = state.surfaces[surfaceId]
    if (!surface) {
      throw new Error(`Surface '${surfaceId}' is not registered.`)
    }

    return surface
  }

  if (state.currentSurfaceId) {
    const current = state.surfaces[state.currentSurfaceId]
    if (current) return current
  }

  const registeredSurfaceIds = listRegisteredSurfaceIds(state)

  if (registeredSurfaceIds.length === 0) {
    return getOrCreateSurface(state, DEFAULT_SURFACE_ID)
  }

  if (registeredSurfaceIds.length === 1) {
    return state.surfaces[registeredSurfaceIds[0]]
  }

  throw new Error(
    `Surface selection is ambiguous. Available surfaces: ${registeredSurfaceIds.join(', ')}. `
    + 'Pass surfaceId explicitly or call session.select_surface(surfaceId).',
  )
}

function buildStoreMetadataForSurface(surface: HarnessSurfaceConfig) {
  return surface.stores.describeAll()
}

function buildStoreSnapshotsForSurface(surface: HarnessSurfaceConfig) {
  return surface.stores.getAll()
}

function buildAffordancesForSurface(surface: HarnessSurfaceConfig) {
  return Object.values(surface.actions).map((action) => action.metadata)
}

export function getHarnessWindow(): HarnessWindow {
  return window as HarnessWindow
}

export function ensureHarnessState(): HarnessState {
  const win = getHarnessWindow()
  const existing = win.__AI_HARNESS__ as LegacyHarnessState | undefined
  const defaultSurface = ensureDefaultSurfaceState(existing)

  win.__AI_HARNESS__ = {
    errors: existing?.errors ?? [],
    initialized: existing?.initialized ?? false,
    surfaces: {
      ...(existing?.surfaces ?? {}),
      [DEFAULT_SURFACE_ID]: defaultSurface,
    },
    currentSurfaceId: existing?.currentSurfaceId ?? DEFAULT_SURFACE_ID,
    surfaceSelectionMode: existing?.surfaceSelectionMode ?? 'auto',
    session: existing?.session ?? createSessionState(),
    sessionListeners: existing?.sessionListeners ?? new Set(),
    connect: existing?.connect,
  }

  syncAutoSurfaceSelection(win.__AI_HARNESS__)

  return win.__AI_HARNESS__
}

export function recordHarnessError(error: RuntimeError) {
  const state = ensureHarnessState()
  state.errors.push(error)
  if (state.errors.length > 100) state.errors.shift()
}

export function getHarnessSessionState() {
  return ensureHarnessState().session
}

export function listHarnessSurfaces(): HarnessSurfaceSummary[] {
  const state = ensureHarnessState()
  const registeredSurfaceIds = listRegisteredSurfaceIds(state)
  const surfaces = Object.values(state.surfaces).filter((surface) => {
    if (registeredSurfaceIds.length === 0) return true
    return !isEmptyFallbackSurface(surface)
  })

  return surfaces.map((surface) => ({
    surfaceId: surface.id,
    surfaceName: surface.name,
    surfaceType: surface.type,
    readiness: surface.readiness,
    readinessMessage: surface.readinessMessage,
    current: surface.id === state.currentSurfaceId,
  }))
}

export function getCurrentHarnessSurfaceId() {
  return ensureHarnessState().currentSurfaceId
}

export function getOrCreateHarnessSurface(surfaceId?: string) {
  return getOrCreateSurface(ensureHarnessState(), surfaceId ?? DEFAULT_SURFACE_ID)
}

export function getHarnessSurfaceConfig(surfaceId?: string) {
  return resolveSurfaceConfig(ensureHarnessState(), surfaceId)
}

export function updateHarnessSurface(surfaceId: string, patch: Partial<HarnessSurfaceConfig>) {
  const state = ensureHarnessState()
  const existing = getOrCreateSurface(state, surfaceId)

  state.surfaces[surfaceId] = {
    ...existing,
    ...patch,
    id: surfaceId,
    capabilities: {
      ...existing.capabilities,
      ...(patch.capabilities ?? {}),
    },
    stores: existing.stores,
    actions: existing.actions,
  }

  syncAutoSurfaceSelection(state)

  return state.surfaces[surfaceId]
}

export function selectHarnessSurface(surfaceId: string) {
  const state = ensureHarnessState()
  if (!state.surfaces[surfaceId]) {
    throw new Error(`Surface '${surfaceId}' is not registered.`)
  }

  state.currentSurfaceId = surfaceId
  state.surfaceSelectionMode = 'explicit'
  syncSelectedSurfaceIntoSession(state, surfaceId)
  return state.surfaces[surfaceId]
}

export function getHarnessAffordances(surfaceId?: string) {
  const surface = resolveSurfaceConfig(ensureHarnessState(), surfaceId)
  return buildAffordancesForSurface(surface)
}

export function getHarnessStoreMetadata(surfaceId?: string) {
  const surface = resolveSurfaceConfig(ensureHarnessState(), surfaceId)
  return buildStoreMetadataForSurface(surface)
}

export function getHarnessStoreSnapshots(surfaceId?: string) {
  const surface = resolveSurfaceConfig(ensureHarnessState(), surfaceId)
  return buildStoreSnapshotsForSurface(surface)
}

export function getHarnessStoreSnapshot(name: string, surfaceId?: string) {
  const surface = resolveSurfaceConfig(ensureHarnessState(), surfaceId)
  return surface.stores.get(name)
}

export function assertHarnessActionAvailable(name: string, surfaceId?: string) {
  const surface = resolveSurfaceConfig(ensureHarnessState(), surfaceId)
  const action = surface.actions[name]

  if (!action) {
    throw new Error(`Action '${name}' is not exposed by surface '${surface.id}'.`)
  }

  return action
}

export function assertHarnessStoreMutable(name: string, surfaceId?: string) {
  const surface = resolveSurfaceConfig(ensureHarnessState(), surfaceId)
  const store = surface.stores.get(name)

  if (!store) {
    throw new Error(`Store '${name}' is not exposed by surface '${surface.id}'.`)
  }

  return store
}

export function setHarnessStoreState(name: string, patch: unknown, surfaceId?: string) {
  const surface = resolveSurfaceConfig(ensureHarnessState(), surfaceId)
  surface.stores.setState(name, patch)
}

export function dispatchHarnessStoreAction(name: string, action: unknown, surfaceId?: string) {
  const surface = resolveSurfaceConfig(ensureHarnessState(), surfaceId)
  surface.stores.dispatch(name, action)
}

export function buildHarnessManifest(surfaceId?: string): HarnessSurfaceManifest {
  const state = ensureHarnessState()
  const surface = resolveSurfaceConfig(state, surfaceId)
  const stores = buildStoreMetadataForSurface(surface)
  const affordances = buildAffordancesForSurface(surface)

  return {
    runtime: 'browser',
    surfaceId: surface.id,
    surfaceName: surface.name,
    surfaceType: surface.type,
    protocolVersion: surface.protocolVersion,
    runtimeVersion: surface.runtimeVersion,
    appVersion: surface.appVersion,
    framework: surface.framework,
    sessionId: state.session.sessionId,
    readiness: surface.readiness,
    readinessMessage: surface.readinessMessage,
    current: surface.id === state.currentSurfaceId,
    stores,
    affordances,
    capabilities: {
      ...surface.capabilities,
      frameControl: surface.capabilities.frameControl
        || inferFrameControl(surface.capabilities, affordances, stores),
    },
  }
}

export function updateHarnessSessionState(patch: Partial<HarnessSessionState>) {
  const state = ensureHarnessState()
  return applySessionPatch(state, patch)
}

function inferFrameControl(
  capabilities: HarnessCapabilities,
  actions: ActionMetadata[],
  _stores: StoreMetadata[],
) {
  if (capabilities.frameControl) return true

  return actions.some((action) => ['advanceFrames', 'stepFrames', 'advance', 'step'].includes(action.name))
}

export function setHarnessMode(mode: HarnessMode) {
  return updateHarnessSessionState({ mode })
}

export function subscribeHarnessSession(listener: SessionListener) {
  const state = ensureHarnessState()
  state.sessionListeners.add(listener)
  listener(state.session)

  return () => {
    state.sessionListeners.delete(listener)
  }
}

export function getHarnessConfig(): HarnessRuntimeConfig {
  const win = getHarnessWindow()
  return win.__AI_HARNESS_CONFIG__ ?? (win.__AI_HARNESS_CONFIG__ = {})
}

export function updateHarnessConfig(config: HarnessRuntimeConfig) {
  Object.assign(getHarnessConfig(), config)
}

export function shouldAutoConnect() {
  const searchParam = new URL(window.location.href).searchParams.get('ai-harness')

  if (searchParam !== null) {
    const normalized = searchParam.trim().toLowerCase()
    return normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
  }

  return getHarnessConfig().autoConnect === true
}
