import type { ReplayRunner } from '@ai-runtime-harness/replay'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Bridge } from '../bridge'
import { BridgeRuntimeClient } from '../runtime-client'
import { HarnessSessionManager } from '../session-state'
import { ok } from './shared'

export function registerReplayTools(
  server: McpServer,
  bridge: Bridge,
  runtime: BridgeRuntimeClient,
  session: HarnessSessionManager,
  replay: ReplayRunner,
) {
  server.registerTool('replay.run', {
    inputSchema: {
      path: z.string(),
      captureScreenshots: z.boolean().optional(),
    },
  }, async ({ path, captureScreenshots }) => {
    session.update({ recording: false, mode: 'replay' })
    if (bridge.isConnected()) {
      await runtime.setSessionState(session.getOverlay())
    }

    const artifact = await replay.load(path)
    const result = await replay.runArtifact(artifact, { captureScreenshots })

    session.update({ mode: 'explorer' })
    if (bridge.isConnected()) {
      await runtime.setSessionState(session.getOverlay())
    }

    return ok(result)
  })
}
