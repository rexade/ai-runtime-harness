import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const playgroundRoot = 'C:/Users/henri/projects/ai-harness-playground'
const playgroundUrl = 'http://127.0.0.1:4173'
const plainUrl = 'http://127.0.0.1:4180'

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

function runNodeScript(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
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

      reject(new Error(`Command failed with exit code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`))
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  let playgroundServer
  let plainServer

  try {
    if (!(await isReady(playgroundUrl))) {
      playgroundServer = shell('npm.cmd run dev', playgroundRoot)
      await waitFor(playgroundUrl)
    }

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
    plainServer.listen(4180, '127.0.0.1')
    await once(plainServer, 'listening')

    const playgroundAttach = JSON.parse((await runNodeScript([
      'bin/ai-harness.mjs',
      'attach',
      playgroundUrl,
      '--headless',
      '--json',
      '--timeout',
      '15000',
    ], harnessRoot)).stdout)

    assert(playgroundAttach.mode === 'harness-runtime', `Expected harness runtime mode. Received ${playgroundAttach.mode}`)
    assert(
      JSON.stringify(playgroundAttach.surfaces.map((surface) => surface.surfaceId).sort()) === JSON.stringify(['dashboard', 'form', 'game', 'network']),
      `Unexpected surfaces: ${JSON.stringify(playgroundAttach.surfaces)}`,
    )

    const gameAttach = JSON.parse((await runNodeScript([
      'bin/ai-harness.mjs',
      'attach',
      playgroundUrl,
      '--surface',
      'game',
      '--headless',
      '--json',
      '--timeout',
      '15000',
    ], harnessRoot)).stdout)

    assert(gameAttach.selectedSurfaceId === 'game', `Expected selected surface to be game. Received ${gameAttach.selectedSurfaceId}`)
    assert(gameAttach.manifest?.surfaceType === 'game', `Expected manifest surface type game. Received ${gameAttach.manifest?.surfaceType}`)
    assert(
      gameAttach.affordances?.some((affordance) => affordance.name === 'moveRight'),
      `Expected game affordances to include moveRight. Received ${JSON.stringify(gameAttach.affordances)}`,
    )

    const degradedAttach = JSON.parse((await runNodeScript([
      'bin/ai-harness.mjs',
      'attach',
      plainUrl,
      '--headless',
      '--json',
      '--timeout',
      '3000',
    ], harnessRoot)).stdout)

    assert(degradedAttach.mode === 'degraded-browser-only', `Expected degraded mode. Received ${degradedAttach.mode}`)
    assert(
      degradedAttach.degradedCapabilities?.includes('browser.get_dom')
      && degradedAttach.degradedCapabilities?.includes('browser.get_accessibility_tree')
      && degradedAttach.degradedCapabilities?.includes('browser.type'),
      `Unexpected degraded capabilities: ${JSON.stringify(degradedAttach.degradedCapabilities)}`,
    )

    console.log(JSON.stringify({
      playground: {
        surfaces: playgroundAttach.surfaces.map((surface) => surface.surfaceId),
      },
      selectedGame: {
        selectedSurfaceId: gameAttach.selectedSurfaceId,
        affordances: gameAttach.affordances.map((affordance) => affordance.name),
      },
      degraded: {
        mode: degradedAttach.mode,
        domRoot: degradedAttach.degradedDomRoot,
        accessibility: degradedAttach.degradedAccessibilityRole,
      },
    }, null, 2))
  } finally {
    plainServer?.close()
    await kill(playgroundServer)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
