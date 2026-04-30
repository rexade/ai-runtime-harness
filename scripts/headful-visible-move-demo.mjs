import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const dogfoodRoot = 'C:/Users/henri/projects/demo_phone_application'
const appUrl = 'http://localhost:8081/?ai-harness=1'
const baseUrl = 'http://localhost:8081'
const mcpCwd = `${harnessRoot}/packages/mcp-server`

function shell(command, cwd, envOverrides = {}) {
  return spawn('powershell.exe', ['-Command', command], {
    cwd,
    env: {
      ...process.env,
      ...envOverrides,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  })
}

async function isReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isReady(url)) return
    await delay(500)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function kill(child) {
  if (!child?.pid) return Promise.resolve()

  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    })
    killer.once('exit', () => resolve())
    killer.once('error', () => resolve())
  })
}

function parseText(result) {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const parsed = parseText(result)
  if (result.isError) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed))
  }
  return parsed
}

async function waitForRuntime(client) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const store = await callTool(client, 'explorer.get_store', { name: 'run' })
      if (store && typeof store === 'object' && store.state) {
        return store
      }
    } catch {}

    await delay(500)
  }

  throw new Error('Runtime never connected to the harness.')
}

let devServer
let transport
let client

try {
  if (!(await isReady(baseUrl))) {
    devServer = shell('npx.cmd expo start --web --port 8081', dogfoodRoot, {
      BROWSER: 'none',
      EXPO_NO_BROWSER: '1',
    })
    await waitFor(baseUrl)
  }

  transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx/esm', 'src/index.ts'],
    cwd: mcpCwd,
    stderr: 'inherit',
  })

  client = new Client({ name: 'headful-visible-move-demo', version: '0.1.0' })
  await client.connect(transport)

  const opened = await callTool(client, 'browser.open', {
    url: appUrl,
    headless: false,
    width: 1280,
    height: 1200,
  })
  await waitForRuntime(client)

  await callTool(client, 'explorer.call_action', { name: 'resetRun' })
  const before = await callTool(client, 'explorer.observe' )

  console.log(JSON.stringify({
    phase: 'opened',
    sessionId: opened.sessionId,
    note: 'Visible browser window opened and brought to the front. Watching initial state for 5 seconds.',
    banner: before?.session,
  }, null, 2))

  await delay(5000)

  console.log(JSON.stringify({
    phase: 'demo-start',
    sessionId: opened.sessionId,
    note: 'Starting the in-app harness demo now. It flashes the player tile, runs right, lands on the shard, jumps, flashes the goal, and ends on WON.',
  }, null, 2))

  const demoResult = await callTool(client, 'explorer.call_action', {
    name: 'runHarnessDemo',
  })

  const screenshot = await callTool(client, 'browser.screenshot', {
    name: 'headful-visible-move-demo',
  })
  const finalObservation = await callTool(client, 'explorer.observe')

  console.log(JSON.stringify({
    phase: 'complete',
    sessionId: opened.sessionId,
    screenshot,
    demoResult,
    finalPlayer: finalObservation.stores?.find((store) => store.name === 'player')?.state,
    finalRun: finalObservation.stores?.find((store) => store.name === 'run')?.state,
    note: 'Holding the visible browser window open for 20 seconds before cleanup.',
  }, null, 2))

  await delay(20000)
} finally {
  try {
    if (client) {
      await callTool(client, 'browser.close', {})
    }
  } catch {}

  await client?.close().catch(() => {})
  await transport?.close().catch(() => {})
  await kill(devServer)
}
