import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const dogfoodRoot = 'C:/Users/henri/projects/demo_phone_application'
const surfaceId = 'dashboard'
const appUrl = `http://localhost:8081/?ai-harness=1&surface=${surfaceId}`
const baseUrl = 'http://localhost:8081'
const mcpCwd = `${harnessRoot}/packages/mcp-server`

const reviewScenes = [
  { scene: 'overview', name: 'dashboard-review-overview' },
  { scene: 'heat', name: 'dashboard-review-heat' },
  { scene: 'night', name: 'dashboard-review-night' },
  { scene: 'manual', name: 'dashboard-review-manual' },
]

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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function selectDashboardState(stores) {
  const match = (stores ?? []).find((store) => {
    if (!isRecord(store) || !isRecord(store.state)) return false
    return typeof store.state.focusRegion === 'string'
      && typeof store.state.orbitMode === 'string'
      && typeof store.state.alertLevel === 'string'
  })

  if (!match) {
    throw new Error('Unable to discover the dashboard state from the runtime observation.')
  }

  return match.state
}

function requireAffordances(affordances, requiredNames) {
  const available = new Set((affordances ?? []).map((action) => action.name))
  const missing = requiredNames.filter((name) => !available.has(name))

  if (missing.length > 0) {
    throw new Error(`Dashboard surface is missing required affordances: ${missing.join(', ')}`)
  }
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

  client = new Client({ name: 'dashboard-ui-review', version: '0.1.0' })
  await client.connect(transport)

  const opened = await callTool(client, 'browser.open', {
    url: appUrl,
    headless: true,
    width: 1540,
    height: 1600,
  })

  const ready = await callTool(client, 'session.wait_until_ready', {
    surfaceId,
    timeoutMs: 60_000,
    pollIntervalMs: 500,
  })
  const surfaces = await callTool(client, 'session.list_surfaces')
  const selected = await callTool(client, 'session.select_surface', { surfaceId })
  const manifest = await callTool(client, 'session.get_manifest')
  const actions = await callTool(client, 'explorer.get_affordances')
  requireAffordances(actions, ['reset', 'loadReviewScene'])
  await callTool(client, 'explorer.call_action', { name: 'reset' })
  const captures = []

  for (const item of reviewScenes) {
    await callTool(client, 'explorer.call_action', {
      name: 'loadReviewScene',
      args: { scene: item.scene },
    })
    await delay(250)
    const observation = await callTool(client, 'explorer.observe')
    const state = selectDashboardState(observation.stores)
    const screenshot = await callTool(client, 'browser.screenshot', {
      name: item.name,
      selector: '#dashboard-stage',
    })
    captures.push({
      scene: item.scene,
      focusRegion: state.focusRegion,
      orbitMode: state.orbitMode,
      alertLevel: state.alertLevel,
      autopilot: state.autopilot,
      screenshot: screenshot.path,
    })
  }

  console.log(JSON.stringify({
    opened,
    surfaces,
    selected: {
      surfaceId: selected.surfaceId,
      surfaceType: selected.surfaceType,
    },
    ready: {
      surfaceName: ready.surfaceName,
      surfaceType: ready.surfaceType,
      readiness: ready.readiness,
    },
    manifest: {
      surfaceName: manifest.surfaceName,
      surfaceType: manifest.surfaceType,
      stores: manifest.stores.map((store) => store.name),
    },
    actions: actions.map((action) => action.name),
    captures,
  }, null, 2))
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
