import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appUrl = 'http://localhost:5173'
const demoUrl = `${appUrl}/?ai-harness=1`
const mcpCwd = join(repoRoot, 'packages', 'mcp-server')

function shellCommand(command, cwd) {
  if (process.platform === 'win32') {
    return spawn('powershell.exe', ['-Command', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  return spawn('sh', ['-lc', command], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function detectBrowserPath() {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH

  if (process.platform === 'win32') {
    const candidates = [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ]

    return candidates.find((candidate) => existsSync(candidate)) ?? null
  }

  return null
}

function killProcessTree(child) {
  if (!child?.pid) return Promise.resolve()

  if (process.platform === 'win32') {
    return new Promise((resolvePromise) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      })

      killer.once('exit', () => resolvePromise())
      killer.once('error', () => resolvePromise())
    })
  }

  child.kill('SIGTERM')
  return Promise.resolve()
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return
    await delay(500)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function isPortBusy(port) {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })

    socket.once('connect', () => {
      socket.destroy()
      resolvePromise(true)
    })

    socket.once('error', () => {
      resolvePromise(false)
    })
  })
}

function parseToolText(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
  const value = parseToolText(text)

  if (result.isError) {
    throw new Error(typeof value === 'string' ? value : JSON.stringify(value))
  }

  return value
}

async function waitForHarness(client) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await callTool(client, 'app.get_store', { name: 'tasks' })

    if (result && typeof result === 'object' && Array.isArray(result.state?.tasks)) {
      return result
    }

    await delay(500)
  }

  throw new Error('Harness never became ready')
}

function printSection(title, value) {
  console.log(`\n${title}`)
  console.log(value)
}

async function main() {
  if (await isPortBusy(7777)) {
    throw new Error('Port 7777 is already in use. Stop the existing harness server and rerun the demo.')
  }

  const browserPath = detectBrowserPath()
  if (!browserPath) {
    throw new Error('No supported browser found. Set BROWSER_PATH to a Chromium browser executable.')
  }

  const tempRoot = join(tmpdir(), `ai-runtime-harness-demo-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })

  let devServer = null
  let browser = null
  let transport = null

  try {
    const devServerRunning = await isHttpReady(appUrl)

    if (!devServerRunning) {
      devServer = shellCommand('corepack pnpm --dir examples/react-dashboard dev', repoRoot)
      await waitForHttp(appUrl)
    }

    browser = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(tempRoot, 'browser-profile')}`,
      demoUrl,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    transport = new StdioClientTransport({
      command: 'node',
      args: ['--import', 'tsx/esm', 'src/index.ts'],
      cwd: mcpCwd,
      stderr: 'inherit',
    })

    const client = new Client({ name: 'harness-demo', version: '0.1.0' })
    await client.connect(transport)

    const initialStore = await waitForHarness(client)

    const mockedTasks = {
      tasks: [
        { id: 101, text: 'Investigate checkout timeout', done: false },
        { id: 102, text: 'Replay failed webhook payload', done: false },
        { id: 103, text: 'Prepare rollback comms', done: false },
      ],
    }

    await callTool(client, 'app.mock_api', {
      pattern: '/api/tasks',
      response: mockedTasks,
    })

    const syncedStore = await callTool(client, 'app.call_action', { name: 'syncTasks' })
    const networkEvents = await callTool(client, 'app.get_network', { limit: 10 })

    await callTool(client, 'app.call_action', { name: 'markAllDone' })
    const completedStore = await callTool(client, 'app.get_store', { name: 'tasks' })

    await callTool(client, 'app.call_action', { name: 'clearCompleted' })
    const emptiedStore = await callTool(client, 'app.get_store', { name: 'tasks' })

    await callTool(client, 'app.set_store_state', {
      name: 'tasks',
      patch: {
        errorMessage: 'Injected incident from the harness',
        syncStatus: 'error',
      },
    })

    const statusDom = await callTool(client, 'app.get_dom', { selector: '#sync-status' })
    const reactTree = await callTool(client, 'app.get_react_tree')
    const consoleEvents = await callTool(client, 'app.get_console', { limit: 10 })
    const errors = await callTool(client, 'app.get_errors')

    printSection('Harness Demo', 'This demo avoids brittle click-through setup and operates on app semantics directly.')
    printSection('1. Initial store state', JSON.stringify({
      tasks: initialStore.state.tasks.map((task) => ({ text: task.text, done: task.done })),
      syncStatus: initialStore.state.syncStatus,
    }, null, 2))
    printSection('2. Mocked /api/tasks and called syncTasks()', JSON.stringify({
      syncedTasks: syncedStore.tasks.map((task) => task.text),
      syncStatus: syncedStore.syncStatus,
      lastSyncSource: syncedStore.lastSyncSource,
    }, null, 2))
    printSection('3. Network capture proves the mocked fetch happened', JSON.stringify(networkEvents, null, 2))
    printSection('4. Semantic action markAllDone() completed every task', JSON.stringify({
      tasks: completedStore.state.tasks.map((task) => ({ text: task.text, done: task.done })),
    }, null, 2))
    printSection('5. clearCompleted() removed the finished tasks without UI clicking', JSON.stringify({
      tasks: emptiedStore.state.tasks,
    }, null, 2))
    printSection('6. Direct store patch injected an incident banner into the UI', JSON.stringify({
      statusText: statusDom.text,
      statusAttrs: statusDom.attrs,
    }, null, 2))
    printSection('7. React tree snapshot shows component state without DevTools', JSON.stringify(reactTree, null, 2))
    printSection('8. Console and runtime error capture', JSON.stringify({ consoleEvents, errors }, null, 2))
  } finally {
    await transport?.close().catch(() => {})
    await killProcessTree(browser)
    if (devServer) await killProcessTree(devServer)
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
