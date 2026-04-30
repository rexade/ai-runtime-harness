import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pathToFileURL } from 'url'
import { Bridge } from './bridge'
import { startWsServer } from './ws-server'
import { registerBrowserTools } from './tools/browser'

export async function main() {
  const bridge = new Bridge()

  await startWsServer(bridge, 7777)

  const server = new McpServer({
    name: 'ai-runtime-harness',
    version: '0.1.0',
  })

  registerBrowserTools(server, bridge)

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
