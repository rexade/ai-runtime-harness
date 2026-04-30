import type { Recorder } from '@ai-runtime-harness/recorder'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Bridge } from '../bridge'
import { BridgeRuntimeClient } from '../runtime-client'
import { HarnessSessionManager } from '../session-state'
import { ok } from './shared'

export function registerRecordingTools(
  server: McpServer,
  bridge: Bridge,
  runtime: BridgeRuntimeClient,
  session: HarnessSessionManager,
  recorder: Recorder,
) {
  server.registerTool('recording.start', {
    inputSchema: {
      label: z.string().optional(),
    },
  }, async ({ label }) => {
    const artifact = recorder.start(label)
    session.update({ recording: true, mode: 'recording' })
    if (bridge.isConnected()) {
      await runtime.setSessionState(session.getOverlay())
    }
    return ok(artifact)
  })

  server.registerTool('recording.status', {}, async () => {
    return ok(recorder.status())
  })

  server.registerTool('recording.stop', {
    inputSchema: {
      save: z.boolean().optional(),
    },
  }, async ({ save }) => {
    const result = await recorder.stop({ save })
    session.update({ recording: false, mode: 'explorer' })
    if (bridge.isConnected()) {
      await runtime.setSessionState(session.getOverlay())
    }
    return ok(result)
  })
}
