import type { HarnessRequest, HarnessResponse, RuntimeError } from '@ai-runtime-harness/protocol'
import type { DomModule } from './dom'
import type { ConsoleCapture } from './console'
import type { NetworkCapture } from './network'
import type { ReactReader } from './react'
import type { StoresModule } from './stores'

type HarnessAction = (args: unknown) => unknown | Promise<unknown>

interface HarnessGlobals {
  actions?: Record<string, HarnessAction>
  errors?: RuntimeError[]
}

interface HarnessWindow extends Window {
  __AI_HARNESS__?: HarnessGlobals
}

export interface Modules {
  dom: DomModule
  console: ConsoleCapture
  network: NetworkCapture
  react: ReactReader
  stores: StoresModule
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
        return payload?.name ? this.mods.stores.get(String(payload.name)) : this.mods.stores.getAll()
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
        const action = this.getGlobals().actions?.[actionName]
        if (!action) throw new Error(`Action not registered: ${actionName}`)
        return await action(payload?.args)
      }
      case 'SET_STORE_STATE':
        return this.mods.stores.setState(this.requireString(payload, 'name'), payload?.patch)
      case 'DISPATCH_STORE_ACTION':
        return this.mods.stores.dispatch(this.requireString(payload, 'name'), payload?.action)
      default:
        throw new Error(`Unknown command: ${req.type}`)
    }
  }

  private getGlobals(): HarnessGlobals {
    const win = window as HarnessWindow
    return win.__AI_HARNESS__ ?? {}
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

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error)
  }
}

export function connectToServer(dispatcher: CommandDispatcher, url = 'ws://localhost:7777') {
  const connect = () => {
    const ws = new WebSocket(url)

    ws.onmessage = async (event) => {
      const request = JSON.parse(String(event.data)) as HarnessRequest
      const response = await dispatcher.dispatch(request)
      ws.send(JSON.stringify(response))
    }

    ws.onclose = () => {
      window.setTimeout(connect, 2000)
    }
  }

  connect()
}
