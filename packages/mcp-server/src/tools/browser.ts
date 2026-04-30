import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Bridge } from '../bridge'

function textResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  }
}

function notConnected() {
  return textResult('No browser connected. Open your dev server first.')
}

function ok(result: unknown) {
  return textResult(JSON.stringify(result ?? null, null, 2))
}

export function registerBrowserTools(server: McpServer, bridge: Bridge) {
  server.registerTool('app.get_dom', {
    inputSchema: { selector: z.string().optional() },
  }, async ({ selector }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_DOM', { selector }))
  })

  server.registerTool('app.get_react_tree', {
    inputSchema: { component: z.string().optional() },
  }, async ({ component }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_REACT_TREE', { component }))
  })

  server.registerTool('app.get_store', {
    inputSchema: { name: z.string().optional() },
  }, async ({ name }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_STORE', { name }))
  })

  server.registerTool('app.get_console', {
    inputSchema: { limit: z.number().optional() },
  }, async ({ limit }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_CONSOLE', { limit }))
  })

  server.registerTool('app.get_network', {
    inputSchema: { limit: z.number().optional() },
  }, async ({ limit }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_NETWORK', { limit }))
  })

  server.registerTool('app.get_errors', {}, async () => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_ERRORS'))
  })

  server.registerTool('app.click', {
    inputSchema: { selector: z.string() },
  }, async ({ selector }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('CLICK', { selector })
    return ok({ clicked: selector })
  })

  server.registerTool('app.type', {
    inputSchema: { selector: z.string(), text: z.string() },
  }, async ({ selector, text }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('TYPE', { selector, text })
    return ok({ typed: text, into: selector })
  })

  server.registerTool('app.navigate', {
    inputSchema: { url: z.string() },
  }, async ({ url }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('NAVIGATE', { url })
    return ok({ navigated: url })
  })

  server.registerTool('app.scroll', {
    inputSchema: { selector: z.string(), amount: z.number() },
  }, async ({ selector, amount }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('SCROLL', { selector, amount })
    return ok({ scrolled: selector, amount })
  })

  server.registerTool('app.hover', {
    inputSchema: { selector: z.string() },
  }, async ({ selector }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('HOVER', { selector })
    return ok({ hovered: selector })
  })

  server.registerTool('app.mock_api', {
    inputSchema: { pattern: z.string(), response: z.unknown() },
  }, async ({ pattern, response }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('MOCK_API', { pattern, response })
    return ok({ mocked: pattern })
  })

  server.registerTool('app.call_action', {
    inputSchema: { name: z.string(), args: z.unknown().optional() },
  }, async ({ name, args }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('CALL_ACTION', { name, args }))
  })

  server.registerTool('app.set_store_state', {
    inputSchema: { name: z.string(), patch: z.record(z.unknown()) },
  }, async ({ name, patch }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('SET_STORE_STATE', { name, patch })
    return ok({ updated: name })
  })

  server.registerTool('app.dispatch_store_action', {
    inputSchema: { name: z.string(), action: z.unknown() },
  }, async ({ name, action }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('DISPATCH_STORE_ACTION', { name, action })
    return ok({ dispatched: name })
  })
}
