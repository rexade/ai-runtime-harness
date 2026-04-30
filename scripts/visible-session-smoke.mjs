import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const dogfoodRoot = 'C:/Users/henri/projects/demo_phone_application'
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

function flattenText(node) {
  if (!node || typeof node !== 'object') return ''

  const direct = typeof node.text === 'string' ? node.text : ''
  const childText = Array.isArray(node.children)
    ? node.children.map(flattenText).filter(Boolean).join(' ')
    : ''

  return `${direct} ${childText}`.trim()
}

async function readBanner(client) {
  const [statusNode, sessionNode, surfaceNode, actionNode, detailNode] = await Promise.all([
    callTool(client, 'explorer.get_dom', { selector: '#harness-connection-status' }),
    callTool(client, 'explorer.get_dom', { selector: '#harness-session-id' }),
    callTool(client, 'explorer.get_dom', { selector: '#harness-selected-surface' }),
    callTool(client, 'explorer.get_dom', { selector: '#harness-last-action' }),
    callTool(client, 'explorer.get_dom', { selector: '#harness-last-action-detail' }),
  ])

  return {
    connection: flattenText(statusNode),
    sessionId: flattenText(sessionNode),
    surface: flattenText(surfaceNode),
    action: flattenText(actionNode),
    detail: flattenText(detailNode),
  }
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label} did not include '${expected}'. Received: ${text}`)
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

  client = new Client({ name: 'visible-session-smoke', version: '0.1.0' })
  await client.connect(transport)

  const dashboardUrl = `${baseUrl}/?ai-harness=1&surface=dashboard`
  const platformerUrl = `${baseUrl}/?ai-harness=1&surface=platformer`

  const dashboardOpen = await callTool(client, 'browser.open', {
    url: dashboardUrl,
    width: 1500,
    height: 1200,
  })
  await callTool(client, 'session.wait_until_ready', {
    surfaceId: 'dashboard',
    timeoutMs: 60_000,
    pollIntervalMs: 500,
  })
  await callTool(client, 'session.select_surface', { surfaceId: 'dashboard' })
  await callTool(client, 'explorer.call_action', {
    name: 'setFocusRegion',
    args: { region: 'Sahara Grid' },
  })
  await delay(500)
  const dashboardBanner = await readBanner(client)
  const dashboardShot = await callTool(client, 'browser.screenshot', {
    name: 'visible-session-dashboard',
    selector: '#dashboard-stage',
  })

  assertIncludes(dashboardBanner.connection, 'AI HARNESS CONNECTED', 'Dashboard banner connection')
  assertIncludes(dashboardBanner.surface, 'dashboard', 'Dashboard banner surface')
  assertIncludes(dashboardBanner.action, 'setFocusRegion', 'Dashboard banner action')
  assertIncludes(dashboardBanner.action, 'semantic affordance', 'Dashboard banner action source')

  const platformerOpen = await callTool(client, 'browser.open', {
    url: platformerUrl,
    width: 1500,
    height: 1200,
  })
  await callTool(client, 'session.wait_until_ready', {
    surfaceId: 'platformer',
    timeoutMs: 60_000,
    pollIntervalMs: 500,
  })
  await callTool(client, 'session.select_surface', { surfaceId: 'platformer' })
  await callTool(client, 'explorer.call_action', {
    name: 'movePlayer',
    args: { direction: 'right', steps: 1 },
  })
  await delay(500)
  const platformerBanner = await readBanner(client)
  const platformerObservation = await callTool(client, 'explorer.observe')
  const platformerShot = await callTool(client, 'browser.screenshot', {
    name: 'visible-session-platformer',
    selector: '#game-stage',
  })

  assertIncludes(platformerBanner.connection, 'AI HARNESS CONNECTED', 'Platformer banner connection')
  assertIncludes(platformerBanner.surface, 'platformer', 'Platformer banner surface')
  assertIncludes(platformerBanner.action, 'movePlayer', 'Platformer banner action')
  assertIncludes(platformerBanner.action, 'semantic affordance', 'Platformer banner action source')

  console.log(JSON.stringify({
    dashboard: {
      opened: dashboardOpen,
      banner: dashboardBanner,
      screenshot: dashboardShot.path,
    },
    platformer: {
      opened: platformerOpen,
      banner: platformerBanner,
      player: (platformerObservation.stores ?? []).find((store) => store.name === 'player')?.state,
      screenshot: platformerShot.path,
    },
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
