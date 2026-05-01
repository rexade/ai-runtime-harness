import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const playgroundRoot = 'C:/Users/henri/projects/ai-harness-playground'
const playgroundUrl = 'http://127.0.0.1:4173'
const plainUrl = 'http://127.0.0.1:4182'

function commandFor(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
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

function run(command, args, cwd, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...envOverrides,
      },
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(`Command failed with exit code ${code}\nCMD: ${command} ${args.join(' ')}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`))
    })
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function kill(child) {
  if (!child?.pid) return

  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    })

    killer.once('exit', resolve)
    killer.once('error', resolve)
  })
}

function armHarnessUrl(url, surfaceId) {
  const nextUrl = new URL(url)
  nextUrl.searchParams.set('ai-harness', '1')
  if (surfaceId) {
    nextUrl.searchParams.set('surface', surfaceId)
  }
  return nextUrl.toString()
}

function parseToolText(result) {
  const content = Array.isArray(result.content) ? result.content : []
  const text = content
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')

  if (text.length === 0 && 'toolResult' in result) {
    return result.toolResult
  }

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

async function waitForRuntime(client, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastStatus = null

  while (Date.now() < deadline) {
    lastStatus = await callTool(client, 'session.status')
    if (lastStatus.connected === true) {
      return lastStatus
    }
    await delay(250)
  }

  return lastStatus
}

function pickStore(stores, name) {
  if (!Array.isArray(stores)) return null
  return stores.find((store) => store.name === name) ?? stores[0] ?? null
}

function summarizeStoreState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return state
  }

  const summary = {}
  for (const [key, value] of Object.entries(state)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value
      continue
    }

    if (Array.isArray(value)) {
      summary[key] = `[Array(${value.length})]`
      continue
    }

    summary[key] = '[Object]'
  }

  return summary
}

function summarizeTopLevelChanges(before, after) {
  const beforeRecord = before && typeof before === 'object' && !Array.isArray(before) ? before : {}
  const afterRecord = after && typeof after === 'object' && !Array.isArray(after) ? after : {}
  const keys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]))
  const changes = []

  for (const key of keys) {
    const beforeValue = JSON.stringify(beforeRecord[key])
    const afterValue = JSON.stringify(afterRecord[key])
    if (beforeValue === afterValue) continue
    changes.push(`${key}: ${beforeValue} -> ${afterValue}`)
  }

  return changes.slice(0, 8)
}

async function main() {
  let playgroundServer
  let plainServer
  let packDir
  let installDir
  let stageDir
  let client
  let transport

  try {
    if (!(await isReady(playgroundUrl))) {
      playgroundServer = shell('npm.cmd run dev', playgroundRoot)
      await waitFor(playgroundUrl)
    }

    packDir = await mkdtemp(path.join(os.tmpdir(), 'ai-harness-agent-pack-'))
    installDir = await mkdtemp(path.join(os.tmpdir(), 'ai-harness-agent-install-'))
    stageDir = await mkdtemp(path.join(os.tmpdir(), 'ai-harness-agent-stage-'))

    await run(process.execPath, ['scripts/stage-cli-package.mjs', '--out', stageDir], harnessRoot)
    await run(commandFor('corepack'), ['pnpm', 'pack', '--pack-destination', packDir], stageDir)
    const packedFiles = (await readdir(packDir)).filter((file) => file.endsWith('.tgz'))
    assert(packedFiles.length === 1, `Expected one packed tarball. Received ${packedFiles.join(', ')}`)
    const tarballPath = path.join(packDir, packedFiles[0])

    await writeFile(path.join(installDir, 'package.json'), JSON.stringify({
      name: 'ai-harness-agent-loop',
      private: true,
      type: 'module',
    }, null, 2))

    await run(commandFor('npm'), ['install', tarballPath], installDir)

    const attach = JSON.parse((await run(commandFor('npx'), [
      '--no-install',
      'ai-runtime-harness',
      'attach',
      playgroundUrl,
      '--surface',
      'dashboard',
      '--headless',
      '--json',
      '--timeout',
      '15000',
    ], installDir)).stdout)

    assert(attach.mode === 'harness-runtime', `Expected harness-runtime mode. Received ${attach.mode}`)

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(installDir, 'node_modules/ai-runtime-harness/dist/mcp-server.js')],
      cwd: installDir,
      stderr: 'ignore',
    })

    client = new Client({ name: 'ai-harness-agent-usage-smoke', version: '0.1.0' })
    await client.connect(transport)

    await callTool(client, 'browser.open', {
      url: armHarnessUrl(playgroundUrl, 'dashboard'),
      headless: true,
      width: 1500,
      height: 1200,
    })

    const statusAfterOpen = await waitForRuntime(client)
    assert(statusAfterOpen?.connected === true, `Expected a connected runtime. Received ${JSON.stringify(statusAfterOpen)}`)

    await callTool(client, 'session.wait_until_ready', {
      surfaceId: 'dashboard',
      timeoutMs: 15_000,
      pollIntervalMs: 250,
    })

    const surfaces = await callTool(client, 'session.list_surfaces')
    assert(
      JSON.stringify(surfaces.map((surface) => surface.surfaceId).sort()) === JSON.stringify(['dashboard', 'form', 'game', 'network']),
      `Unexpected surface list: ${JSON.stringify(surfaces)}`,
    )

    const manifest = await callTool(client, 'session.select_surface', { surfaceId: 'dashboard' })
    const affordances = await callTool(client, 'explorer.get_affordances', { surfaceId: 'dashboard' })
    const beforeObservation = await callTool(client, 'explorer.observe', { surfaceId: 'dashboard' })
    const beforeScreenshot = await callTool(client, 'explorer.screenshot', { name: 'agent-loop-dashboard-before' })
    const beforeStore = pickStore(beforeObservation.stores, manifest.stores[0]?.name ?? 'dashboard')

    assert(
      affordances.some((affordance) => affordance.name === 'setRegion'),
      `Expected dashboard affordances to include setRegion. Received ${JSON.stringify(affordances)}`,
    )

    await callTool(client, 'explorer.call_action', {
      surfaceId: 'dashboard',
      name: 'setRegion',
      args: { region: 'lagoon' },
    })

    const afterObservation = await callTool(client, 'explorer.observe', { surfaceId: 'dashboard' })
    const afterScreenshot = await callTool(client, 'explorer.screenshot', { name: 'agent-loop-dashboard-after' })
    const afterStore = pickStore(afterObservation.stores, manifest.stores[0]?.name ?? 'dashboard')

    assert(beforeStore, `Expected a dashboard store before action. Received ${JSON.stringify(beforeObservation.stores)}`)
    assert(afterStore, `Expected a dashboard store after action. Received ${JSON.stringify(afterObservation.stores)}`)
    assert(afterStore.state?.region === 'lagoon', `Expected region to change to lagoon. Received ${JSON.stringify(afterStore.state)}`)

    plainServer = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html>
<html>
  <body>
    <main id="plain-app">
      <h1>Plain Browser App</h1>
      <input id="plain-input" value="" />
      <button id="plain-button">Click me</button>
    </main>
  </body>
</html>`)
    })
    plainServer.listen(4182, '127.0.0.1')
    await once(plainServer, 'listening')

    await callTool(client, 'browser.open', {
      url: plainUrl,
      headless: true,
      width: 1200,
      height: 900,
    })

    const degradedStatus = await waitForRuntime(client, 3_000)
    const degradedDom = await callTool(client, 'browser.get_dom', { selector: 'body' })
    const degradedA11y = await callTool(client, 'browser.get_accessibility_tree', {})

    await callTool(client, 'browser.close', {})
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
    client = null
    transport = null

    console.log(JSON.stringify({
      packagedAttach: {
        mode: attach.mode,
        selectedSurfaceId: attach.selectedSurfaceId,
        surfaces: attach.surfaces.map((surface) => surface.surfaceId),
      },
      agentLoop: {
        selectedSurfaceId: manifest.surfaceId,
        surfaceName: manifest.surfaceName,
        affordances: affordances.map((affordance) => affordance.name),
        beforeStore: {
          name: beforeStore.name,
          state: summarizeStoreState(beforeStore.state),
        },
        afterStore: {
          name: afterStore.name,
          state: summarizeStoreState(afterStore.state),
        },
        changed: summarizeTopLevelChanges(beforeStore.state, afterStore.state),
        lastAction: afterObservation.session?.lastAction ?? null,
        screenshots: {
          before: beforeScreenshot.path,
          after: afterScreenshot.path,
        },
      },
      degraded: {
        connected: degradedStatus?.connected ?? false,
        mode: degradedStatus?.connected ? 'unexpected-runtime' : 'degraded-browser-only',
        domRoot: degradedDom?.tag ?? null,
        accessibilityRoot: degradedA11y?.role ?? null,
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
    plainServer?.close()
    await kill(playgroundServer)

    if (packDir) {
      await rm(packDir, { recursive: true, force: true })
    }
    if (installDir) {
      await rm(installDir, { recursive: true, force: true })
    }
    if (stageDir) {
      await rm(stageDir, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
