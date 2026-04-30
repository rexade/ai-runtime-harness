import { describe, expect, it } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { BrowserSessionInfo } from '@ai-runtime-harness/browser-driver'
import { Bridge } from '../bridge'
import { BridgeRuntimeClient } from '../runtime-client'
import { HarnessSessionManager } from '../session-state'
import { registerSessionTools } from './session'

type ToolRegistry = Record<string, { handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }> }>

function createBrowser(session: Partial<BrowserSessionInfo> = {}) {
  return {
    currentSession() {
      return {
        sessionId: null,
        url: null,
        headless: null,
        open: false,
        attached: false,
        ...session,
      }
    },
  } as const
}

function surface(surfaceId: string, surfaceName: string, surfaceType: 'dashboard' | 'game', current = false) {
  return {
    surfaceId,
    surfaceName,
    surfaceType,
    readiness: 'ready' as const,
    current,
  }
}

function manifest(surfaceId: string, surfaceName: string, surfaceType: 'dashboard' | 'game', current = false) {
  return {
    runtime: 'browser' as const,
    surfaceId,
    surfaceName,
    surfaceType,
    protocolVersion: '0.1.0',
    runtimeVersion: '1.0.0',
    sessionId: 'explorer-123',
    readiness: 'ready' as const,
    current,
    stores: [{ name: surfaceType === 'dashboard' ? 'dashboard' : 'run', mutable: true, dispatchable: false }],
    affordances: [{ name: 'reset', kind: 'debug' as const, safety: 'debug-only' as const, executionPath: 'semantic-action' as const, description: 'Reset.' }],
    capabilities: {
      dom: true,
      reactTree: true,
      stores: true,
      console: true,
      network: true,
      errors: true,
      screenshots: true,
      browserInput: true,
      frameControl: true,
    },
  }
}

describe('registerSessionTools', () => {
  it('returns a disconnected status before the runtime is attached', async () => {
    const bridge = new Bridge()
    const runtime = new BridgeRuntimeClient(bridge)
    const browser = createBrowser()
    const session = new HarnessSessionManager()
    const server = new McpServer({ name: 'test', version: '0.1.0' })

    registerSessionTools(server, bridge, runtime, browser as never, session)

    const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools
    const result = await tools['session.status'].handler({})
    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.connected).toBe(false)
    expect(parsed.ready).toBe(false)
    expect(parsed.readiness).toBe('disconnected')
  })

  it('waits until the runtime reports a ready manifest', async () => {
    const bridge = new Bridge()
    const runtime = new BridgeRuntimeClient(bridge)
    const browser = createBrowser({ sessionId: 'explorer-123', open: true })
    const session = new HarnessSessionManager()
    const server = new McpServer({ name: 'test', version: '0.1.0' })

    const mockWs = {
      send(message: string) {
        const request = JSON.parse(message)
        bridge.resolve({
          id: request.id,
          ok: true,
          result: request.type === 'LIST_SURFACES'
            ? [surface('dashboard', 'Aether Atlas Dashboard', 'dashboard', true)]
            : manifest('dashboard', 'Aether Atlas Dashboard', 'dashboard', true),
        })
      },
    }

    bridge.setConnection(mockWs)
    registerSessionTools(server, bridge, runtime, browser as never, session)

    const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools
    const result = await tools['session.wait_until_ready'].handler({ timeoutMs: 1000, pollIntervalMs: 10 })
    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.ready).toBe(true)
    expect(parsed.manifest.surfaceName).toBe('Aether Atlas Dashboard')
    expect(parsed.manifest.surfaceType).toBe('dashboard')
  })

  it('selects a surface explicitly', async () => {
    const bridge = new Bridge()
    const runtime = new BridgeRuntimeClient(bridge)
    const browser = createBrowser({ sessionId: 'explorer-123', open: true })
    const session = new HarnessSessionManager()
    const server = new McpServer({ name: 'test', version: '0.1.0' })

    const mockWs = {
      send(message: string) {
        const request = JSON.parse(message)
        bridge.resolve({
          id: request.id,
          ok: true,
          result: request.type === 'SELECT_SURFACE'
            ? manifest('platformer', 'Platformer Proving Ground', 'game', true)
            : [surface('dashboard', 'Aether Atlas Dashboard', 'dashboard', false), surface('platformer', 'Platformer Proving Ground', 'game', true)],
        })
      },
    }

    bridge.setConnection(mockWs)
    registerSessionTools(server, bridge, runtime, browser as never, session)

    const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools
    const result = await tools['session.select_surface'].handler({ surfaceId: 'platformer' })
    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.surfaceId).toBe('platformer')
    expect(parsed.current).toBe(true)
    expect(parsed.surfaceType).toBe('game')
  })

  it('fails fast when a requested surface is not registered', async () => {
    const bridge = new Bridge()
    const runtime = new BridgeRuntimeClient(bridge)
    const browser = createBrowser({ sessionId: 'explorer-456', open: true })
    const session = new HarnessSessionManager()
    const server = new McpServer({ name: 'test', version: '0.1.0' })

    const mockWs = {
      send(message: string) {
        const request = JSON.parse(message)
        bridge.resolve({
          id: request.id,
          ok: request.type !== 'GET_MANIFEST',
          error: request.type === 'GET_MANIFEST'
            ? "Surface 'platformer' is not registered."
            : undefined,
          result: request.type === 'LIST_SURFACES'
            ? [surface('dashboard', 'Aether Atlas Dashboard', 'dashboard', true)]
            : undefined,
        })
      },
    }

    bridge.setConnection(mockWs)
    registerSessionTools(server, bridge, runtime, browser as never, session)

    const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools

    await expect(
      tools['session.wait_until_ready'].handler({ surfaceId: 'platformer', timeoutMs: 1000, pollIntervalMs: 10 }),
    ).rejects.toThrow("Surface 'platformer' is not registered.")
  })

  it('fails fast when no surface is selected and multiple surfaces exist', async () => {
    const bridge = new Bridge()
    const runtime = new BridgeRuntimeClient(bridge)
    const browser = createBrowser({ sessionId: 'explorer-789', open: true })
    const session = new HarnessSessionManager()
    const server = new McpServer({ name: 'test', version: '0.1.0' })

    const mockWs = {
      send(message: string) {
        const request = JSON.parse(message)
        bridge.resolve({
          id: request.id,
          ok: request.type !== 'GET_MANIFEST',
          error: request.type === 'GET_MANIFEST'
            ? 'Surface selection is ambiguous. Available surfaces: dashboard, platformer. Pass surfaceId explicitly or call session.select_surface(surfaceId).'
            : undefined,
          result: request.type === 'LIST_SURFACES'
            ? [
                surface('dashboard', 'Aether Atlas Dashboard', 'dashboard', false),
                surface('platformer', 'Platformer Proving Ground', 'game', false),
              ]
            : undefined,
        })
      },
    }

    bridge.setConnection(mockWs)
    registerSessionTools(server, bridge, runtime, browser as never, session)

    const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools

    await expect(
      tools['session.wait_until_ready'].handler({ timeoutMs: 1000, pollIntervalMs: 10 }),
    ).rejects.toThrow('Surface selection is ambiguous.')
  })
})
