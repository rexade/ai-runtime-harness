import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dogfoodAppRoot = resolve(repoRoot, '..', 'demo_phone_application')
const appUrl = 'http://localhost:8081'
const demoUrl = `${appUrl}/?ai-harness=1`
const mcpCwd = join(repoRoot, 'packages', 'mcp-server')
const proofDir = join(repoRoot, '.proof')

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

async function waitForHttp(url, timeoutMs = 60_000) {
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await callTool(client, 'app.get_store', { name: 'player' })

    if (result && typeof result === 'object' && typeof result.state?.x === 'number') {
      return result
    }

    await delay(500)
  }

  throw new Error('Harness never became ready for the platformer app')
}

async function captureStage(page, path) {
  const stage = page.locator('#game-stage')
  await stage.screenshot({ path })
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

  await mkdir(proofDir, { recursive: true })

  const tempRoot = join(tmpdir(), `ai-runtime-harness-platformer-demo-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })

  let devServer = null
  let browser = null
  let context = null
  let page = null
  let transport = null

  try {
    const devServerRunning = await isHttpReady(appUrl)

    if (!devServerRunning) {
      devServer = shellCommand('npx.cmd expo start --web --port 8081', dogfoodAppRoot)
      await waitForHttp(appUrl)
    }

    browser = await chromium.launch({
      executablePath: browserPath,
      headless: true,
    })
    context = await browser.newContext({
      viewport: { width: 1280, height: 1400 },
    })
    page = await context.newPage()
    await page.goto(demoUrl, { waitUntil: 'domcontentloaded' })
    await page.locator('#run-harness-demo').waitFor({ state: 'visible', timeout: 30_000 })

    transport = new StdioClientTransport({
      command: 'node',
      args: ['--import', 'tsx/esm', 'src/index.ts'],
      cwd: mcpCwd,
      stderr: 'inherit',
    })

    const client = new Client({ name: 'platformer-harness-demo', version: '0.2.0' })
    await client.connect(transport)
    await waitForHarness(client)

    const beforePath = join(proofDir, 'platformer-visible-1-before.png')
    const movePath = join(proofDir, 'platformer-visible-2-move.png')
    const jumpPath = join(proofDir, 'platformer-visible-3-jump.png')
    const goalPath = join(proofDir, 'platformer-visible-4-goal.png')
    const wonPath = join(proofDir, 'platformer-visible-5-won.png')

    await captureStage(page, beforePath)

    const demoPromise = callTool(client, 'app.call_action', { name: 'runHarnessDemo' })

    await delay(3_200)
    await captureStage(page, movePath)

    await delay(1_100)
    await captureStage(page, jumpPath)

    await delay(900)
    await captureStage(page, goalPath)

    const demoResult = await demoPromise
    await delay(250)
    await captureStage(page, wonPath)

    const runStatusDom = await callTool(client, 'app.get_dom', { selector: '#run-status' })
    const demoStepDom = await callTool(client, 'app.get_dom', { selector: '#demo-step' })
    const errors = await callTool(client, 'app.get_errors')
    const consoleEvents = await callTool(client, 'app.get_console', { limit: 10 })

    printSection(
      'Visual Proof',
      JSON.stringify({
        screenshots: {
          before: beforePath,
          move: movePath,
          jump: jumpPath,
          goal: goalPath,
          won: wonPath,
        },
        runStatusText: runStatusDom.text,
        demoBannerText: demoStepDom.text,
        finalPlayer: demoResult.player,
        finalRun: demoResult.run,
        consoleEvents,
        errors,
      }, null, 2),
    )
  } finally {
    await transport?.close().catch(() => {})
    await page?.close().catch(() => {})
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    if (devServer) await killProcessTree(devServer)
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
