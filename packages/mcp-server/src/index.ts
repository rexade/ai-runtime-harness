import { BrowserDriver } from '@ai-runtime-harness/browser-driver'
import { Explorer } from '@ai-runtime-harness/explorer'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Recorder } from '@ai-runtime-harness/recorder'
import { ReplayRunner } from '@ai-runtime-harness/replay'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pathToFileURL } from 'url'
import { Bridge } from './bridge'
import { ProofHelper } from './proof-helper'
import { createRecordingHooks } from './recording-hooks'
import { BridgeRuntimeClient } from './runtime-client'
import { HarnessSessionManager } from './session-state'
import { startWsServer } from './ws-server'
import { registerBrowserTools } from './tools/browser'
import { registerBrowserDriverTools } from './tools/browser-driver'
import { registerExplorerTools } from './tools/explorer'
import { registerProofTools } from './tools/proof'
import { registerRecordingTools } from './tools/recording'
import { registerReplayTools } from './tools/replay'
import { registerSessionTools } from './tools/session'

export async function main() {
  const bridge = new Bridge()
  const browser = new BrowserDriver()
  const runtime = new BridgeRuntimeClient(bridge)
  const explorer = new Explorer(runtime, browser)
  const session = new HarnessSessionManager()
  const recorder = new Recorder({
    hooks: createRecordingHooks(bridge, runtime, browser),
  })
  const replay = new ReplayRunner(explorer)
  const proof = new ProofHelper(explorer, browser, process.cwd())

  await startWsServer(bridge, 7777)

  const server = new McpServer({
    name: 'ai-runtime-harness',
    version: '0.1.0',
  })

  registerBrowserTools(server, bridge)
  registerBrowserDriverTools(server, bridge, browser, runtime, session, recorder)
  registerExplorerTools(server, bridge, explorer, recorder, runtime, session)
  registerSessionTools(server, bridge, runtime, browser, session)
  registerRecordingTools(server, bridge, runtime, session, recorder)
  registerReplayTools(server, bridge, runtime, session, replay)
  registerProofTools(server, proof)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('[AI Harness] MCP server ready. Configure in claude_code_settings.json.')
}

function isMainModule() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  main().catch((error) => {
    console.error('[AI Harness] Fatal error:', error)
    process.exit(1)
  })
}
