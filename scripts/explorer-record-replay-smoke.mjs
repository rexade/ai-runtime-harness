import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const dogfoodRoot = 'C:/Users/henri/projects/demo_phone_application'
const appUrl = 'http://localhost:8081/?ai-harness=1'
const baseUrl = 'http://localhost:8081'
const mcpCwd = `${harnessRoot}/packages/mcp-server`

function shell(command, cwd) {
  return spawn('powershell.exe', ['-Command', command], {
    cwd,
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
    devServer = shell('npx.cmd expo start --web --port 8081', dogfoodRoot)
    await waitFor(baseUrl)
  }

  transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx/esm', 'src/index.ts'],
    cwd: mcpCwd,
    stderr: 'inherit',
  })

  client = new Client({ name: 'explorer-record-replay-smoke', version: '0.1.0' })
  await client.connect(transport)

  const opened = await callTool(client, 'browser.open', { url: appUrl, headless: true })
  await waitForRuntime(client)

  const actions = await callTool(client, 'explorer.get_actions')
  const initial = await callTool(client, 'explorer.observe')
  const started = await callTool(client, 'recording.start', { label: 'explorer-smoke' })
  const moved = await callTool(client, 'explorer.call_action', {
    name: 'movePlayer',
    args: { direction: 'right', steps: 1 },
  })
  const stepped = await callTool(client, 'explorer.advance_frames', { count: 1 })
  const shot = await callTool(client, 'browser.screenshot', { name: 'explorer-smoke-after-step' })
  const stopped = await callTool(client, 'recording.stop', {})
  const replay = await callTool(client, 'replay.run', {
    path: stopped.path,
    captureScreenshots: true,
  })
  const final = await callTool(client, 'explorer.observe')

  console.log(JSON.stringify({
    opened,
    actions,
    recordingStarted: started.id,
    moved,
    stepped,
    screenshot: shot,
    recordingPath: stopped.path,
    replay,
    initialSummary: {
      url: initial.url,
      actions: initial.actions,
      stores: initial.stores?.map((store) => store.name),
    },
    finalSummary: {
      url: final.url,
      stores: final.stores?.map((store) => store.name),
      errors: final.errors,
    },
  }, null, 2))
} finally {
  await client?.close().catch(() => {})
  await transport?.close().catch(() => {})
  await kill(devServer)
}
