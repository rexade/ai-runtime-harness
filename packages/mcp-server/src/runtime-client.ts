import type {
  ActionMetadata,
  ComponentSnapshot,
  ConsoleEvent,
  DomSnapshot,
  HarnessSurfaceManifest,
  HarnessSurfaceSummary,
  HarnessSessionState,
  NetworkEvent,
  RuntimeError,
  StoreSnapshot,
} from '@ai-runtime-harness/protocol'
import { Bridge } from './bridge'

export class BridgeRuntimeClient {
  constructor(private readonly bridge: Bridge) {}

  getDom(selector?: string) {
    return this.bridge.request('GET_DOM', { selector }) as Promise<DomSnapshot | null>
  }

  getReactTree(component?: string) {
    return this.bridge.request('GET_REACT_TREE', { component }) as Promise<ComponentSnapshot[] | unknown>
  }

  getStore(name?: string, surfaceId?: string) {
    return this.bridge.request('GET_STORE', { name, surfaceId }) as Promise<StoreSnapshot | StoreSnapshot[] | null>
  }

  getSessionState() {
    return this.bridge.request('GET_SESSION_STATE') as Promise<HarnessSessionState>
  }

  getConsole(limit?: number) {
    return this.bridge.request('GET_CONSOLE', { limit }) as Promise<ConsoleEvent[]>
  }

  getNetwork(limit?: number) {
    return this.bridge.request('GET_NETWORK', { limit }) as Promise<NetworkEvent[]>
  }

  getErrors() {
    return this.bridge.request('GET_ERRORS') as Promise<RuntimeError[]>
  }

  getActions(surfaceId?: string) {
    return this.bridge.request('GET_ACTIONS', { surfaceId }) as Promise<ActionMetadata[]>
  }

  listSurfaces() {
    return this.bridge.request('LIST_SURFACES') as Promise<HarnessSurfaceSummary[]>
  }

  selectSurface(surfaceId: string) {
    return this.bridge.request('SELECT_SURFACE', { surfaceId }) as Promise<HarnessSurfaceManifest>
  }

  getManifest(surfaceId?: string) {
    return this.bridge.request('GET_MANIFEST', { surfaceId }) as Promise<HarnessSurfaceManifest>
  }

  callAction(name: string, args?: unknown, surfaceId?: string) {
    return this.bridge.request('CALL_ACTION', { name, args, surfaceId })
  }

  async setStoreState(name: string, patch: unknown, surfaceId?: string) {
    await this.bridge.request('SET_STORE_STATE', { name, patch, surfaceId })
  }

  async setSessionState(patch: Partial<HarnessSessionState>) {
    await this.bridge.request('SET_SESSION_STATE', { patch })
  }
}
