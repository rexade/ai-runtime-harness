import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const dogfoodRoot = 'C:/Users/henri/projects/demo_phone_application'
const surfaceId = 'platformer'
const appUrl = `http://localhost:8081/?ai-harness=1&surface=${surfaceId}`
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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function selectRunState(stores) {
  const match = (stores ?? []).find((store) => {
    if (!isRecord(store) || !isRecord(store.state)) return false
    return typeof store.state.status === 'string'
      && typeof store.state.demoStep === 'string'
      && typeof store.state.tick === 'number'
  })

  if (!match) {
    throw new Error('Unable to discover the platformer run state from the runtime observation.')
  }

  return match.state
}

function selectPlayerState(stores) {
  const match = (stores ?? []).find((store) => {
    if (!isRecord(store) || !isRecord(store.state)) return false
    return typeof store.state.x === 'number'
      && typeof store.state.y === 'number'
      && typeof store.state.coins === 'number'
  })

  if (!match) {
    throw new Error('Unable to discover the platformer player state from the runtime observation.')
  }

  return match.state
}

function requireAffordances(affordances, requiredNames) {
  const available = new Set((affordances ?? []).map((action) => action.name))
  const missing = requiredNames.filter((name) => !available.has(name))

  if (missing.length > 0) {
    throw new Error(`Platformer surface is missing required affordances: ${missing.join(', ')}`)
  }
}

function requirePlatformerSurface(manifest) {
  if (manifest?.surfaceType !== 'game') {
    throw new Error(
      `Expected a platformer/game debug surface, but attached to ${manifest?.surfaceName ?? 'unknown'} (${manifest?.surfaceType ?? 'unknown'}).`,
    )
  }
}

async function captureState(client, label) {
  const [observation, screenshot, latestEvent] = await Promise.all([
    callTool(client, 'explorer.observe'),
    callTool(client, 'browser.screenshot', {
      name: `ui-review-${label}`,
      selector: '#game-stage',
    }),
    callTool(client, 'explorer.get_dom', { selector: '#latest-event' }),
  ])

  return {
    label,
    screenshot: screenshot.path,
    run: selectRunState(observation.stores),
    player: selectPlayerState(observation.stores),
    latestEvent: latestEvent?.text,
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

  client = new Client({ name: 'platformer-ui-review', version: '0.1.0' })
  await client.connect(transport)

  await callTool(client, 'browser.open', { url: appUrl, headless: true, width: 1440, height: 1600 })
  const ready = await callTool(client, 'session.wait_until_ready', {
    surfaceId,
    timeoutMs: 60_000,
    pollIntervalMs: 500,
  })
  const surfaces = await callTool(client, 'session.list_surfaces')
  const selected = await callTool(client, 'session.select_surface', { surfaceId })
  const manifest = await callTool(client, 'session.get_manifest')
  const affordances = await callTool(client, 'explorer.get_affordances')
  requirePlatformerSurface(manifest)
  requireAffordances(affordances, ['reset', 'movePlayer', 'jump', 'runHarnessDemo'])

  const states = []

  await callTool(client, 'explorer.call_action', { name: 'reset' })
  states.push(await captureState(client, 'idle'))

  await callTool(client, 'explorer.call_action', { name: 'reset' })
  await callTool(client, 'explorer.call_action', {
    name: 'movePlayer',
    args: { direction: 'right', steps: 3 },
  })
  states.push(await captureState(client, 'shard'))

  await callTool(client, 'explorer.call_action', { name: 'reset' })
  await callTool(client, 'explorer.call_action', {
    name: 'movePlayer',
    args: { direction: 'right', steps: 3 },
  })
  await callTool(client, 'explorer.call_action', { name: 'jump' })
  states.push(await captureState(client, 'jump'))

  await callTool(client, 'explorer.call_action', { name: 'reset' })
  await callTool(client, 'explorer.call_action', { name: 'runHarnessDemo' })
  states.push(await captureState(client, 'won'))

  console.log(JSON.stringify({
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
    affordances: affordances.map((action) => action.name),
    states,
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
