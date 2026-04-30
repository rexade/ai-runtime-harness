import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const harnessRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const dogfoodRoot = 'C:/Users/henri/projects/demo_phone_application'
const appUrl = 'http://localhost:8081/?ai-harness=1'
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

async function waitForDomText(client, selector, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const snapshot = await callTool(client, 'explorer.get_dom', { selector })
    const text = snapshot?.text ?? ''
    if (predicate(text)) {
      return text
    }
    await delay(250)
  }

  throw new Error(`Timed out waiting for DOM text at ${selector}`)
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

  client = new Client({ name: 'visible-explorer-session-smoke', version: '0.1.0' })
  await client.connect(transport)

  const opened = await callTool(client, 'browser.open', { url: appUrl, headless: true })
  await waitForRuntime(client)

  const initialObservation = await callTool(client, 'explorer.observe')
  const actions = await callTool(client, 'explorer.get_actions')
  const moveAction = actions.find((action) => action.name === 'movePlayer')
  const teleportAction = actions.find((action) => action.name === 'teleportPlayer')

  const connectionText = await waitForDomText(
    client,
    '#harness-connection',
    (text) => text.includes('CONNECTED'),
  )
  const sessionText = await waitForDomText(
    client,
    '#harness-session-id',
    (text) => text.includes(opened.sessionId),
  )

  const started = await callTool(client, 'recording.start', { label: 'visible-session-smoke' })
  const recordingText = await waitForDomText(
    client,
    '#harness-recording',
    (text) => text.includes('ON'),
  )
  const modeRecordingText = await waitForDomText(
    client,
    '#harness-mode',
    (text) => text.includes('RECORDING'),
  )

  const proof = await callTool(client, 'proof.capture_action', {
    label: 'visible-session-step',
    action: {
      type: 'call_action',
      name: 'movePlayer',
      args: { direction: 'right', steps: 1 },
    },
  })

  const stopped = await callTool(client, 'recording.stop', {})
  const recordingOffText = await waitForDomText(
    client,
    '#harness-recording',
    (text) => text.includes('OFF'),
  )
  const modeExplorerText = await waitForDomText(
    client,
    '#harness-mode',
    (text) => text.includes('EXPLORER'),
  )

  const proofArtifact = JSON.parse(await readFile(proof.path, 'utf8'))
  const finalObservation = await callTool(client, 'explorer.observe')

  console.log(JSON.stringify({
    browserSessionId: opened.sessionId,
    observeSession: initialObservation.session,
    banner: {
      connectionText,
      sessionText,
      recordingText,
      modeRecordingText,
      recordingOffText,
      modeExplorerText,
    },
    actionMetadata: {
      movePlayer: moveAction,
      teleportPlayer: teleportAction,
    },
    recording: {
      started: started.id,
      path: stopped.path,
    },
    proof: {
      id: proof.id,
      path: proof.path,
      beforeScreenshot: proof.beforeScreenshot,
      afterScreenshot: proof.afterScreenshot,
      changedStores: proofArtifact.semanticDelta.changedStores.map((store) => store.name),
      sessionChanged: proofArtifact.semanticDelta.sessionChanged,
    },
    finalSession: finalObservation.session,
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
