import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Bridge } from '../bridge'
import { HarnessSessionManager } from '../session-state'
import { registerBrowserDriverTools } from './browser-driver'

type ToolRegistry = Record<string, { handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }> }>

describe('registerBrowserDriverTools', () => {
  it('records browser-driver provenance for click actions', async () => {
    const bridge = new Bridge()
    bridge.setConnection({
      send() {},
    })

    const browser = {
      async attach() {
        return { url: 'http://localhost', headless: false, sessionId: 'session-1', attached: true, cdpUrl: 'http://127.0.0.1:9222' }
      },
      async open() {
        return { url: 'http://localhost', headless: false, sessionId: 'session-1' }
      },
      async screenshot() {
        return { path: 'proof.png', url: 'http://localhost', sessionId: 'session-1' }
      },
      async click(selector: string) {
        return { clicked: selector }
      },
      async press(key: string) {
        return { key }
      },
      async close() {
        return undefined
      },
    }

    const runtime = {
      getManifest: vi.fn(async () => ({
        runtime: 'browser' as const,
        surfaceId: 'dashboard',
        surfaceName: 'Aether Atlas Dashboard',
        surfaceType: 'dashboard' as const,
        protocolVersion: '0.1.0',
        runtimeVersion: '1.0.0',
        sessionId: 'session-1',
        readiness: 'ready' as const,
        current: true,
        stores: [],
        affordances: [],
        capabilities: {
          dom: true,
          reactTree: true,
          stores: true,
          console: true,
          network: true,
          errors: true,
          screenshots: true,
          browserInput: true,
          frameControl: false,
        },
      })),
      setSessionState: vi.fn(async () => undefined),
    }

    const session = new HarnessSessionManager()
    const recorder = {
      async record(_tool: string, _args: Record<string, unknown>, fn: () => Promise<unknown>) {
        return await fn()
      },
    }
    const server = new McpServer({ name: 'test', version: '0.1.0' })

    registerBrowserDriverTools(server, bridge, browser as never, runtime as never, session, recorder as never)

    const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools
    await tools['browser.click'].handler({ selector: '#launch' })

    expect(runtime.getManifest).toHaveBeenCalled()
    expect(runtime.setSessionState).toHaveBeenCalledWith(expect.objectContaining({
      lastAction: expect.objectContaining({
        name: 'browser.click',
        source: 'browser-driver',
        detail: '#launch',
        surfaceId: 'dashboard',
        surfaceType: 'dashboard',
      }),
    }))
    expect(session.getOverlay().lastAction).toMatchObject({
      name: 'browser.click',
      source: 'browser-driver',
      detail: '#launch',
    })
  })
})
