import type { Explorer } from '@ai-runtime-harness/explorer'
import type { HarnessActionSource, HarnessSurfaceManifest } from '@ai-runtime-harness/protocol'
import type { Recorder } from '@ai-runtime-harness/recorder'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Bridge } from '../bridge'
import { BridgeRuntimeClient } from '../runtime-client'
import { HarnessSessionManager } from '../session-state'
import { notConnected, ok } from './shared'

async function readCurrentSurface(
  bridge: Bridge,
  runtime: BridgeRuntimeClient,
): Promise<HarnessSurfaceManifest | null> {
  if (!bridge.isConnected()) return null

  try {
    return await runtime.getManifest()
  } catch {
    return null
  }
}

async function pushLastAction(
  bridge: Bridge,
  runtime: BridgeRuntimeClient,
  session: HarnessSessionManager,
  input: {
    name: string
    source: HarnessActionSource
    detail?: string
  },
) {
  const surface = await readCurrentSurface(bridge, runtime)

  session.update({
    lastAction: {
      name: input.name,
      source: input.source,
      detail: input.detail,
      surfaceId: surface?.surfaceId ?? null,
      surfaceName: surface?.surfaceName ?? null,
      surfaceType: surface?.surfaceType ?? null,
      timestamp: Date.now(),
    },
  })

  if (bridge.isConnected()) {
    await runtime.setSessionState(session.getOverlay())
  }
}

export function registerExplorerTools(
  server: McpServer,
  bridge: Bridge,
  explorer: Explorer,
  recorder: Recorder,
  runtime: BridgeRuntimeClient,
  session: HarnessSessionManager,
) {
  server.registerTool('explorer.observe', {
    inputSchema: {
      selector: z.string().optional(),
      surfaceId: z.string().optional(),
    },
  }, async ({ selector, surfaceId }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.observe',
      { selector, surfaceId },
      () => explorer.observe(selector, surfaceId),
    )
    return ok(result)
  })

  server.registerTool('explorer.get_actions', {
    inputSchema: {
      surfaceId: z.string().optional(),
    },
  }, async ({ surfaceId }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.get_actions',
      { surfaceId },
      () => explorer.getActions(surfaceId),
    )
    return ok(result)
  })

  server.registerTool('explorer.get_affordances', {
    inputSchema: {
      surfaceId: z.string().optional(),
    },
  }, async ({ surfaceId }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.get_affordances',
      { surfaceId },
      () => explorer.getAffordances(surfaceId),
    )
    return ok(result)
  })

  server.registerTool('explorer.get_store', {
    inputSchema: {
      name: z.string().optional(),
      surfaceId: z.string().optional(),
    },
  }, async ({ name, surfaceId }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.get_store',
      { name, surfaceId },
      () => explorer.getStore(name, surfaceId),
    )
    return ok(result)
  })

  server.registerTool('explorer.get_dom', {
    inputSchema: {
      selector: z.string().optional(),
    },
  }, async ({ selector }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.get_dom',
      { selector },
      () => explorer.getDom(selector),
    )
    return ok(result)
  })

  server.registerTool('explorer.get_react_tree', {
    inputSchema: {
      component: z.string().optional(),
    },
  }, async ({ component }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.get_react_tree',
      { component },
      () => explorer.getReactTree(component),
    )
    return ok(result)
  })

  server.registerTool('explorer.call_action', {
    inputSchema: {
      name: z.string(),
      args: z.unknown().optional(),
      surfaceId: z.string().optional(),
    },
  }, async ({ name, args, surfaceId }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.call_action',
      { name, args, surfaceId },
      () => explorer.callAction(name, args, surfaceId),
      { replayable: true },
    )
    return ok(result)
  })

  server.registerTool('explorer.screenshot', {
    inputSchema: {
      name: z.string().optional(),
    },
  }, async ({ name }) => {
    const result = await recorder.record(
      'explorer.screenshot',
      { name },
      () => explorer.screenshot(name),
    )
    return ok(result)
  })

  server.registerTool('explorer.click', {
    inputSchema: {
      selector: z.string(),
    },
  }, async ({ selector }) => {
    const result = await recorder.record(
      'explorer.click',
      { selector },
      () => explorer.click(selector),
      { replayable: true },
    )
    await pushLastAction(bridge, runtime, session, {
      name: 'explorer.click',
      source: 'browser-driver',
      detail: selector,
    })
    return ok(result)
  })

  server.registerTool('explorer.press', {
    inputSchema: {
      key: z.string(),
    },
  }, async ({ key }) => {
    const result = await recorder.record(
      'explorer.press',
      { key },
      () => explorer.press(key),
      { replayable: true },
    )
    await pushLastAction(bridge, runtime, session, {
      name: 'explorer.press',
      source: 'browser-driver',
      detail: key,
    })
    return ok(result)
  })

  server.registerTool('explorer.advance_frames', {
    inputSchema: {
      count: z.number(),
      surfaceId: z.string().optional(),
    },
  }, async ({ count, surfaceId }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.advance_frames',
      { count, surfaceId },
      () => explorer.advanceFrames(count, surfaceId),
      { replayable: true },
    )
    return ok(result)
  })

  server.registerTool('explorer.mutate', {
    inputSchema: {
      path: z.string(),
      value: z.unknown(),
      surfaceId: z.string().optional(),
    },
  }, async ({ path, value, surfaceId }) => {
    if (!bridge.isConnected()) return notConnected()
    const result = await recorder.record(
      'explorer.mutate',
      { path, value, surfaceId },
      () => explorer.mutate(path, value, surfaceId),
      { replayable: true },
    )
    return ok(result)
  })
}
