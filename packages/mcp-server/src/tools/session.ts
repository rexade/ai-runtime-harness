import { setTimeout as delay } from 'node:timers/promises'
import type { BrowserDriver } from '@ai-runtime-harness/browser-driver'
import type {
  HarnessReadinessState,
  HarnessSurfaceManifest,
  HarnessSurfaceSummary,
  HarnessSurfaceType,
} from '@ai-runtime-harness/protocol'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Bridge } from '../bridge'
import { BridgeRuntimeClient } from '../runtime-client'
import { HarnessSessionManager } from '../session-state'
import { ok } from './shared'

interface SessionStatus {
  connected: boolean
  ready: boolean
  sessionId: string | null
  surfaceName: string | null
  surfaceType: HarnessSurfaceType | null
  readiness: HarnessReadinessState | 'disconnected'
  currentSurfaceId: string | null
  browser: ReturnType<BrowserDriver['currentSession']>
  surfaces?: HarnessSurfaceSummary[]
  manifest?: HarnessSurfaceManifest
  error?: string
}

async function getSessionStatus(
  bridge: Bridge,
  runtime: BridgeRuntimeClient,
  browser: BrowserDriver,
  session: HarnessSessionManager,
  surfaceId?: string,
): Promise<SessionStatus> {
  const browserSession = browser.currentSession()
  const overlay = session.getOverlay()

  if (!bridge.isConnected()) {
    return {
      connected: false,
      ready: false,
      sessionId: overlay.sessionId ?? browserSession.sessionId,
      surfaceName: null,
      surfaceType: null,
      readiness: 'disconnected',
      currentSurfaceId: null,
      browser: browserSession,
    }
  }

  try {
    const surfaces = await runtime.listSurfaces()
    const manifest = await runtime.getManifest(surfaceId)
    return {
      connected: true,
      ready: manifest.readiness === 'ready',
      sessionId: manifest.sessionId,
      surfaceName: manifest.surfaceName,
      surfaceType: manifest.surfaceType,
      readiness: manifest.readiness,
      currentSurfaceId: surfaces.find((surface) => surface.current)?.surfaceId ?? null,
      browser: browserSession,
      surfaces,
      manifest,
    }
  } catch (error) {
    let surfaces: HarnessSurfaceSummary[] | undefined

    try {
      surfaces = await runtime.listSurfaces()
    } catch {}

    return {
      connected: true,
      ready: false,
      sessionId: overlay.sessionId ?? browserSession.sessionId,
      surfaceName: null,
      surfaceType: null,
      readiness: 'booting',
      currentSurfaceId: surfaces?.find((surface) => surface.current)?.surfaceId ?? null,
      browser: browserSession,
      surfaces,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function registerSessionTools(
  server: McpServer,
  bridge: Bridge,
  runtime: BridgeRuntimeClient,
  browser: BrowserDriver,
  session: HarnessSessionManager,
) {
  server.registerTool('session.status', {}, async () => {
    return ok(await getSessionStatus(bridge, runtime, browser, session))
  })

  server.registerTool('session.list_surfaces', {}, async () => {
    if (!bridge.isConnected()) {
      throw new Error('No browser-connected runtime is available. Open the app with the harness armed first.')
    }

    return ok(await runtime.listSurfaces())
  })

  server.registerTool('session.select_surface', {
    inputSchema: {
      surfaceId: z.string(),
    },
  }, async ({ surfaceId }) => {
    if (!bridge.isConnected()) {
      throw new Error('No browser-connected runtime is available. Open the app with the harness armed first.')
    }

    return ok(await runtime.selectSurface(surfaceId))
  })

  server.registerTool('session.get_manifest', {
    inputSchema: {
      surfaceId: z.string().optional(),
    },
  }, async ({ surfaceId }) => {
    if (!bridge.isConnected()) {
      throw new Error('No browser-connected runtime is available. Open the app with the harness armed first.')
    }

    return ok(await runtime.getManifest(surfaceId))
  })

  server.registerTool('session.wait_until_ready', {
    inputSchema: {
      surfaceId: z.string().optional(),
      timeoutMs: z.number().optional(),
      pollIntervalMs: z.number().optional(),
    },
  }, async ({ surfaceId, timeoutMs, pollIntervalMs }) => {
    const timeout = timeoutMs ?? 30_000
    const interval = pollIntervalMs ?? 250
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
      const status = await getSessionStatus(bridge, runtime, browser, session, surfaceId)

      if (status.ready) {
        return ok(status)
      }

      if (status.error && (
        status.error.includes('Surface selection is ambiguous')
        || (surfaceId && status.error.includes(`Surface '${surfaceId}' is not registered`))
      )) {
        throw new Error(status.error)
      }

      if (status.readiness === 'error') {
        throw new Error(status.error ?? 'Harness surface reported an error while becoming ready.')
      }

      await delay(interval)
    }

    const status = await getSessionStatus(bridge, runtime, browser, session, surfaceId)
    throw new Error(
      `Timed out waiting for a ready harness surface. Last status: ${JSON.stringify({
        connected: status.connected,
        ready: status.ready,
        readiness: status.readiness,
        currentSurfaceId: status.currentSurfaceId,
        surfaceName: status.surfaceName,
        sessionId: status.sessionId,
        error: status.error,
      })}`,
    )
  })
}
