import type {
  HarnessRequest,
  HarnessResponse,
  HarnessActionSource,
  HarnessSurfaceType,
  RuntimeError,
} from '@ai-runtime-harness/protocol'
import type { DomModule } from './dom'
import type { ConsoleCapture } from './console'
import type { NetworkCapture } from './network'
import type { ReactReader } from './react'
import {
  assertHarnessActionAvailable,
  buildHarnessManifest,
  dispatchHarnessStoreAction,
  ensureHarnessState,
  getHarnessAffordances,
  getHarnessSurfaceConfig,
  getHarnessStoreSnapshot,
  getHarnessStoreSnapshots,
  listHarnessSurfaces,
  selectHarnessSurface,
  setHarnessStoreState,
  updateHarnessSessionState,
} from './harness-state'

export interface Modules {
  dom: DomModule
  console: ConsoleCapture
  network: NetworkCapture
  react: ReactReader
}

export interface ConnectionOptions {
  onClose?: () => void
  onConnecting?: () => void
  onError?: (error: Event | Error) => void
  onOpen?: () => void
  url?: string
}

export class CommandDispatcher {
  constructor(private mods: Modules) {}

  async dispatch(req: HarnessRequest): Promise<HarnessResponse> {
    try {
      const result = await this.handle(req)
      return { id: req.id, ok: true, result }
    } catch (error) {
      return { id: req.id, ok: false, error: this.toErrorMessage(error) }
    }
  }

  private async handle(req: HarnessRequest): Promise<unknown> {
    const payload = this.asRecord(req.payload)

    switch (req.type) {
      case 'GET_DOM':
        return this.mods.dom.getTree(this.asOptionalString(payload?.selector))
      case 'GET_REACT_TREE':
        return this.mods.react.getTree()
      case 'GET_STORE':
        return payload?.name
          ? getHarnessStoreSnapshot(String(payload.name), this.asOptionalString(payload?.surfaceId))
          : getHarnessStoreSnapshots(this.asOptionalString(payload?.surfaceId))
      case 'GET_ACTIONS':
        return getHarnessAffordances(this.asOptionalString(payload?.surfaceId))
      case 'GET_MANIFEST':
        return buildHarnessManifest(this.asOptionalString(payload?.surfaceId))
      case 'LIST_SURFACES':
        return listHarnessSurfaces()
      case 'SELECT_SURFACE': {
        const surfaceId = this.requireString(payload, 'surfaceId')
        selectHarnessSurface(surfaceId)
        return buildHarnessManifest(surfaceId)
      }
      case 'GET_SESSION_STATE':
        return this.getGlobals().session
      case 'GET_CONSOLE':
        return this.mods.console.drain(this.asOptionalNumber(payload?.limit))
      case 'GET_NETWORK':
        return this.mods.network.drain(this.asOptionalNumber(payload?.limit))
      case 'GET_ERRORS':
        return this.getGlobals().errors ?? []
      case 'CLICK':
        return this.mods.dom.click(this.requireString(payload, 'selector'))
      case 'TYPE':
        return this.mods.dom.type(this.requireString(payload, 'selector'), this.requireString(payload, 'text'))
      case 'NAVIGATE':
        return this.mods.dom.navigate(this.requireString(payload, 'url'))
      case 'SCROLL':
        return this.mods.dom.scroll(this.requireString(payload, 'selector'), this.requireNumber(payload, 'amount'))
      case 'HOVER':
        return this.mods.dom.hover(this.requireString(payload, 'selector'))
      case 'MOCK_API':
        return this.mods.network.addMock(this.requireString(payload, 'pattern'), payload?.response)
      case 'CALL_ACTION': {
        const actionName = this.requireString(payload, 'name')
        const surfaceId = this.asOptionalString(payload?.surfaceId)
        const action = assertHarnessActionAvailable(actionName, surfaceId)
        const surface = getHarnessSurfaceConfig(surfaceId)
        this.recordLastAction(
          action.metadata.name,
          this.classifyActionSource(action.metadata.kind, action.metadata.executionPath),
          this.describeValue(payload?.args),
          surface.id,
          surface.name,
          surface.type,
        )
        return await action.fn(payload?.args)
      }
      case 'SET_STORE_STATE': {
        const storeName = this.requireString(payload, 'name')
        const surfaceId = this.asOptionalString(payload?.surfaceId)
        const surface = getHarnessSurfaceConfig(surfaceId)
        this.recordLastAction(
          'set_store_state',
          'debug-mutation',
          `${storeName} ${this.describeValue(payload?.patch)}`.trim(),
          surface.id,
          surface.name,
          surface.type,
        )
        return setHarnessStoreState(storeName, payload?.patch, surfaceId)
      }
      case 'DISPATCH_STORE_ACTION': {
        const storeName = this.requireString(payload, 'name')
        const surfaceId = this.asOptionalString(payload?.surfaceId)
        const surface = getHarnessSurfaceConfig(surfaceId)
        this.recordLastAction(
          'dispatch_store_action',
          'debug-mutation',
          `${storeName} ${this.describeValue(payload?.action)}`.trim(),
          surface.id,
          surface.name,
          surface.type,
        )
        return dispatchHarnessStoreAction(storeName, payload?.action, surfaceId)
      }
      case 'SET_SESSION_STATE':
        return updateHarnessSessionState(this.requireRecord(payload, 'patch'))
      default:
        throw new Error(`Unknown command: ${req.type}`)
    }
  }

  private getGlobals() {
    return ensureHarnessState()
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    return undefined
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
  }

  private asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined
  }

  private requireString(payload: Record<string, unknown> | undefined, key: string): string {
    const value = payload?.[key]
    if (typeof value !== 'string') throw new Error(`Missing string payload field: ${key}`)
    return value
  }

  private requireNumber(payload: Record<string, unknown> | undefined, key: string): number {
    const value = payload?.[key]
    if (typeof value !== 'number') throw new Error(`Missing numeric payload field: ${key}`)
    return value
  }

  private requireRecord(payload: Record<string, unknown> | undefined, key: string): Record<string, unknown> {
    const value = payload?.[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Missing object payload field: ${key}`)
    }
    return value as Record<string, unknown>
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error)
  }

  private classifyActionSource(kind: string, executionPath: string): HarnessActionSource {
    if (kind === 'debug' || kind === 'mutation' || executionPath === 'state-mutation') {
      return 'debug-mutation'
    }

    return 'semantic-affordance'
  }

  private describeValue(value: unknown) {
    if (value === undefined) return ''

    const serialized = JSON.stringify(value)
    if (!serialized) return ''

    return serialized.length > 140 ? `${serialized.slice(0, 137)}...` : serialized
  }

  private recordLastAction(
    name: string,
    source: HarnessActionSource,
    detail: string,
    surfaceId: string,
    surfaceName: string,
    surfaceType: HarnessSurfaceType,
  ) {
    updateHarnessSessionState({
      lastAction: {
        name,
        source,
        detail: detail || undefined,
        surfaceId,
        surfaceName,
        surfaceType,
        timestamp: Date.now(),
      },
    })
  }
}

export function connectToServer(dispatcher: CommandDispatcher, options: ConnectionOptions = {}) {
  const url = options.url ?? 'ws://localhost:7777'

  const connect = () => {
    options.onConnecting?.()
    const ws = new WebSocket(url)

    ws.onopen = () => {
      options.onOpen?.()
    }

    ws.onmessage = async (event) => {
      const request = JSON.parse(String(event.data)) as HarnessRequest
      const response = await dispatcher.dispatch(request)
      ws.send(JSON.stringify(response))
    }

    ws.onerror = (event) => {
      options.onError?.(event)
    }

    ws.onclose = () => {
      options.onClose?.()
      window.setTimeout(connect, 2000)
    }
  }

  connect()
}
