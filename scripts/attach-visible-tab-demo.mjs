import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const dogfoodRoot = 'C:/Users/henri/projects/demo_phone_application'
const baseUrl = 'http://localhost:8081'
const appUrl = `${baseUrl}/?ai-harness=1`
const mcpCwd = `${harnessRoot}/packages/mcp-server`
const WINDOWS_BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

function resolveBrowserExecutable() {
  if (process.env.BROWSER_PATH && existsSync(process.env.BROWSER_PATH)) {
    return process.env.BROWSER_PATH
  }

  return WINDOWS_BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null
}

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

async function waitForCdp(port, timeoutMs = 30_000) {
  await waitFor(`http://127.0.0.1:${port}/json/version`, timeoutMs)
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a free local port.'))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
    server.once('error', reject)
  })
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
let browserProcess
let transport
let client
let profileDir

try {
  const browserExecutable = resolveBrowserExecutable()
  if (!browserExecutable) {
    throw new Error('No supported Chromium browser found. Set BROWSER_PATH to continue.')
  }

  if (!(await isReady(baseUrl))) {
    devServer = shell('npx.cmd expo start --web --port 8081', dogfoodRoot, {
      BROWSER: 'none',
      EXPO_NO_BROWSER: '1',
    })
    await waitFor(baseUrl)
  }

  profileDir = await mkdtemp(join(tmpdir(), 'ai-harness-attach-demo-'))
  const cdpPort = await getFreePort()
  browserProcess = spawn(browserExecutable, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    '--guest',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=EdgeFirstRunExperience,AutoImportAtFirstRun,SigninPromo,UserEducationExperience,msEdgeDefaultBrowserPrompt',
    '--start-maximized',
    `--app=${baseUrl}`,
  ], {
    stdio: 'ignore',
    windowsHide: false,
  })

  await waitForCdp(cdpPort)

  transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx/esm', 'src/index.ts'],
    cwd: mcpCwd,
    stderr: 'inherit',
  })

  client = new Client({ name: 'attach-visible-tab-demo', version: '0.1.0' })
  await client.connect(transport)

  const attached = await callTool(client, 'browser.attach', {
    cdpUrl: `http://127.0.0.1:${cdpPort}`,
    targetUrl: baseUrl,
  })

  const opened = await callTool(client, 'browser.open', {
    url: appUrl,
  })
  await waitForRuntime(client)

  console.log(JSON.stringify({
    phase: 'attached',
    note: 'Attached to the visible guest app window. Holding for 8 seconds before starting the in-app demo.',
    attach: attached,
    open: opened,
  }, null, 2))

  await delay(8000)

  await callTool(client, 'browser.open', {
    url: opened.url,
  })
  await waitForRuntime(client)

  const demo = await callTool(client, 'explorer.call_action', {
    name: 'runHarnessDemo',
  })

  const screenshot = await callTool(client, 'browser.screenshot', {
    name: 'attach-visible-tab-demo',
  })
  const observation = await callTool(client, 'explorer.observe')

  console.log(JSON.stringify({
    phase: 'complete',
    note: 'The demo has finished in the attached visible browser tab. Holding that window open for 30 seconds before cleanup.',
    screenshot,
    finalPlayer: observation.stores?.find((store) => store.name === 'player')?.state,
    finalRun: observation.stores?.find((store) => store.name === 'run')?.state,
    session: observation.session,
    demo,
  }, null, 2))

  await delay(30000)
} finally {
  await client?.close().catch(() => {})
  await transport?.close().catch(() => {})
  await kill(browserProcess)
  await kill(devServer)
  if (profileDir) {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {})
  }
}
