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

  client = new Client({ name: 'finish-platformer-level', version: '0.1.0' })
  await client.connect(transport)

  await callTool(client, 'browser.open', { url: appUrl, headless: true })
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
  requireAffordances(affordances, ['reset', 'movePlayer', 'teleportPlayer'])

  await callTool(client, 'explorer.call_action', { name: 'reset' })
  const afterMove = await callTool(client, 'explorer.call_action', {
    name: 'movePlayer',
    args: { direction: 'right', steps: 3 },
  })
  const afterCoinShot = await callTool(client, 'browser.screenshot', {
    name: 'platformer-after-coin',
  })
  const afterWin = await callTool(client, 'explorer.call_action', {
    name: 'teleportPlayer',
    args: { x: 9, y: 2 },
  })
  const finalShot = await callTool(client, 'browser.screenshot', {
    name: 'platformer-finished-level',
  })
  const finalObservation = await callTool(client, 'explorer.observe')

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
    afterMove,
    afterCoinShot,
    afterWin,
    finalShot,
    finalObservation,
  }, null, 2))
} finally {
  await client?.close().catch(() => {})
  await transport?.close().catch(() => {})
  await kill(devServer)
}
