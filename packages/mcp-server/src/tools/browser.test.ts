import { describe, expect, it } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Bridge } from '../bridge'
import { registerBrowserTools } from './browser'

type ToolRegistry = Record<string, { handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }> }>

describe('registerBrowserTools', () => {
  it('returns a not-connected message until a browser is attached', async () => {
    const bridge = new Bridge()
    const server = new McpServer({ name: 'test', version: '0.1.0' })

    registerBrowserTools(server, bridge)

    const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools
    const result = await tools['app.get_dom'].handler({})

    expect(result.content[0].text).toContain('No browser connected')
  })

  it('app.get_console sends a GET_CONSOLE bridge request', async () => {
    const bridge = new Bridge()
    const sentMessages: string[] = []
    const mockWs = {
      send(message: string) {
        sentMessages.push(message)
        const request = JSON.parse(message)
        bridge.resolve({
          id: request.id,
          ok: true,
          result: [{ level: 'log', args: ['hello'], timestamp: 1 }],
        })
      },
    }

    bridge.setConnection(mockWs)

    const server = new McpServer({ name: 'test', version: '0.1.0' })
    registerBrowserTools(server, bridge)

    const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools
    const result = await tools['app.get_console'].handler({ limit: 5 })

    expect(JSON.parse(sentMessages[0]).type).toBe('GET_CONSOLE')
    expect(result.content[0].text).toContain('"level": "log"')
  })
})
