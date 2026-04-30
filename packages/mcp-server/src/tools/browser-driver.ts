import type { BrowserDriver } from '@ai-runtime-harness/browser-driver'
import type { HarnessActionSource, HarnessSurfaceManifest } from '@ai-runtime-harness/protocol'
import type { Recorder } from '@ai-runtime-harness/recorder'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Bridge } from '../bridge'
import { BridgeRuntimeClient } from '../runtime-client'
import { HarnessSessionManager } from '../session-state'
import { ok } from './shared'

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

export function registerBrowserDriverTools(
  server: McpServer,
  bridge: Bridge,
  browser: BrowserDriver,
  runtime: BridgeRuntimeClient,
  session: HarnessSessionManager,
  recorder: Recorder,
) {
  server.registerTool('browser.attach', {
    inputSchema: {
      cdpUrl: z.string().optional(),
      targetUrl: z.string().optional(),
    },
  }, async ({ cdpUrl, targetUrl }) => {
    const result = await recorder.record(
      'browser.attach',
      { cdpUrl, targetUrl },
      () => browser.attach({ cdpUrl, targetUrl }),
    )

    session.update({
      sessionId: result.sessionId,
      recording: false,
      mode: 'explorer',
      lastAction: null,
    })
    if (bridge.isConnected()) {
      await runtime.setSessionState(session.getOverlay())
    }

    return ok(result)
  })

  server.registerTool('browser.open', {
    inputSchema: {
      url: z.string(),
      headless: z.boolean().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    },
  }, async ({ url, headless, width, height }) => {
    const result = await recorder.record(
      'browser.open',
      { url, headless, width, height },
      () => browser.open(url, { headless, width, height }),
    )

    session.update({
      sessionId: result.sessionId,
      recording: false,
      mode: 'explorer',
      lastAction: null,
    })
    if (bridge.isConnected()) {
      await runtime.setSessionState(session.getOverlay())
    }

    return ok(result)
  })

  server.registerTool('browser.screenshot', {
    inputSchema: {
      name: z.string().optional(),
      selector: z.string().optional(),
    },
  }, async ({ name, selector }) => {
    const result = await recorder.record(
      'browser.screenshot',
      { name, selector },
      () => browser.screenshot({ name, selector }),
    )

    return ok(result)
  })

  server.registerTool('browser.get_dom', {
    inputSchema: {
      selector: z.string().optional(),
    },
  }, async ({ selector }) => {
    const result = await recorder.record(
      'browser.get_dom',
      { selector },
      () => browser.getDom(selector),
    )

    return ok(result)
  })

  server.registerTool('browser.get_accessibility_tree', {
    inputSchema: {
      selector: z.string().optional(),
    },
  }, async ({ selector }) => {
    const result = await recorder.record(
      'browser.get_accessibility_tree',
      { selector },
      () => browser.getAccessibilityTree(selector),
    )

    return ok(result)
  })

  server.registerTool('browser.click', {
    inputSchema: {
      selector: z.string(),
    },
  }, async ({ selector }) => {
    const result = await recorder.record(
      'browser.click',
      { selector },
      () => browser.click(selector),
      { replayable: true },
    )

    await pushLastAction(bridge, runtime, session, {
      name: 'browser.click',
      source: 'browser-driver',
      detail: selector,
    })

    return ok(result)
  })

  server.registerTool('browser.type', {
    inputSchema: {
      selector: z.string(),
      text: z.string(),
    },
  }, async ({ selector, text }) => {
    const result = await recorder.record(
      'browser.type',
      { selector, text },
      () => browser.type(selector, text),
      { replayable: true },
    )

    await pushLastAction(bridge, runtime, session, {
      name: 'browser.type',
      source: 'browser-driver',
      detail: `${selector} (${text.length} chars)`,
    })

    return ok(result)
  })

  server.registerTool('browser.press', {
    inputSchema: {
      key: z.string(),
    },
  }, async ({ key }) => {
    const result = await recorder.record(
      'browser.press',
      { key },
      () => browser.press(key),
      { replayable: true },
    )

    await pushLastAction(bridge, runtime, session, {
      name: 'browser.press',
      source: 'browser-driver',
      detail: key,
    })

    return ok(result)
  })

  server.registerTool('browser.close', {}, async () => {
    await browser.close()
    session.reset()
    if (bridge.isConnected()) {
      await runtime.setSessionState(session.getOverlay())
    }
    return ok({ closed: true })
  })
}
