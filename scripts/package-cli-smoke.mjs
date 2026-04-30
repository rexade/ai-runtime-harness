import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const playgroundRoot = 'C:/Users/henri/projects/ai-harness-playground'
const playgroundUrl = 'http://127.0.0.1:4173'
const plainUrl = 'http://127.0.0.1:4181'

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

async function main() {
  let playgroundServer
  let plainServer
  let packDir
  let installDir
  let stageDir

  try {
    if (!(await isReady(playgroundUrl))) {
      playgroundServer = shell('npm.cmd run dev', playgroundRoot)
      await waitFor(playgroundUrl)
    }

    packDir = await mkdtemp(path.join(os.tmpdir(), 'ai-harness-pack-'))
    installDir = await mkdtemp(path.join(os.tmpdir(), 'ai-harness-install-'))
    stageDir = await mkdtemp(path.join(os.tmpdir(), 'ai-harness-stage-'))

    await run(process.execPath, ['scripts/stage-cli-package.mjs', '--out', stageDir], harnessRoot)
    await run(commandFor('corepack'), ['pnpm', 'pack', '--pack-destination', packDir], stageDir)
    const packedFiles = (await readdir(packDir)).filter((file) => file.endsWith('.tgz'))
    assert(packedFiles.length === 1, `Expected one packed tarball. Received ${packedFiles.join(', ')}`)
    const tarballPath = path.join(packDir, packedFiles[0])

    await writeFile(path.join(installDir, 'package.json'), JSON.stringify({
      name: 'ai-harness-package-smoke',
      private: true,
      type: 'module',
    }, null, 2))

    await run(commandFor('npm'), ['install', tarballPath], installDir)

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
    plainServer.listen(4181, '127.0.0.1')
    await once(plainServer, 'listening')

    const attach = JSON.parse((await run(commandFor('npx'), [
      '--no-install',
      'ai-runtime-harness',
      'attach',
      playgroundUrl,
      '--surface',
      'game',
      '--headless',
      '--json',
      '--timeout',
      '15000',
    ], installDir)).stdout)

    assert(attach.mode === 'harness-runtime', `Expected harness-runtime mode. Received ${attach.mode}`)
    assert(attach.selectedSurfaceId === 'game', `Expected selected surface game. Received ${attach.selectedSurfaceId}`)
    assert(
      JSON.stringify(attach.surfaces.map((surface) => surface.surfaceId).sort()) === JSON.stringify(['dashboard', 'form', 'game', 'network']),
      `Unexpected surfaces from packaged CLI: ${JSON.stringify(attach.surfaces)}`,
    )

    const degraded = JSON.parse((await run(commandFor('npx'), [
      '--no-install',
      'ai-runtime-harness',
      'attach',
      plainUrl,
      '--headless',
      '--json',
      '--timeout',
      '3000',
    ], installDir)).stdout)

    assert(degraded.mode === 'degraded-browser-only', `Expected degraded browser mode. Received ${degraded.mode}`)
    assert(
      degraded.degradedCapabilities?.includes('browser.get_dom')
      && degraded.degradedCapabilities?.includes('browser.get_accessibility_tree')
      && degraded.degradedCapabilities?.includes('browser.type'),
      `Unexpected degraded capabilities from packaged CLI: ${JSON.stringify(degraded.degradedCapabilities)}`,
    )

    console.log(JSON.stringify({
      tarball: path.basename(tarballPath),
      packagedAttach: {
        selectedSurfaceId: attach.selectedSurfaceId,
        surfaces: attach.surfaces.map((surface) => surface.surfaceId),
        affordances: attach.affordances.map((affordance) => affordance.name),
      },
      degraded: {
        mode: degraded.mode,
        domRoot: degraded.degradedDomRoot,
        accessibility: degraded.degradedAccessibilityRole,
      },
    }, null, 2))
  } finally {
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
