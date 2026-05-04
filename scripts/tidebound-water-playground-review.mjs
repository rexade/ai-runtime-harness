import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exampleRoot = path.resolve(harnessRoot, 'examples/tidebound-harbor')
const baseUrl = 'http://127.0.0.1:5190'
const mcpCwd = path.resolve(harnessRoot, 'packages/mcp-server')
const outDir = path.resolve(harnessRoot, '.art-review/water-playground')

const captures = [
  { name: 'pg-calm-baseline',     query: '?preset=calm&debug=0' },
  { name: 'pg-storm-baseline',    query: '?preset=storm&debug=0' },
  { name: 'pg-calm-debug-height', query: '?preset=calm&debug=1' },
  { name: 'pg-calm-debug-shore',  query: '?preset=calm&debug=2' },
  { name: 'pg-calm-debug-ripple', query: '?preset=calm&debug=3' },
  { name: 'pg-storm-debug-shore', query: '?preset=storm&debug=2' },
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

function parseToolText(result) {
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
  const parsed = parseToolText(result)

  if (result.isError) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed))
  }

  return parsed
}

let devServer
let transport
let client

try {
  if (!(await isReady(baseUrl))) {
    devServer = shell('npm.cmd run dev -- --host 127.0.0.1', exampleRoot, {
      BROWSER: 'none',
    })
    await waitFor(baseUrl)
  }

  transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx/esm', 'src/index.ts'],
    cwd: mcpCwd,
    stderr: 'inherit',
  })

  client = new Client({ name: 'tidebound-water-playground-review', version: '0.1.0' })
  await client.connect(transport)

  mkdirSync(outDir, { recursive: true })
  const manifest = []

  for (const capture of captures) {
    await callTool(client, 'browser.open', {
      url: `${baseUrl}/playground.html${capture.query}`,
      headless: true,
      width: 960,
      height: 660,
    })
    await delay(1500)
    const shot = await callTool(client, 'browser.screenshot', { name: capture.name })

    manifest.push({
      name: capture.name,
      query: capture.query,
      screenshot: shot.path,
    })
  }

  writeFileSync(path.resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify({ captures: manifest }, null, 2))
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
