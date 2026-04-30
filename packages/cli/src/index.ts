#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

interface AttachOptions {
  command: 'attach'
  url: string
  surfaceId?: string
  headless: boolean
  json: boolean
  screenshot: boolean
  timeoutMs: number
}

type CliParseResult = AttachOptions | { command: 'help' }

interface HarnessSurfaceSummary {
  surfaceId: string
  surfaceName: string
  surfaceType: string
  readiness: string
  readinessMessage?: string
  current: boolean
}

interface HarnessManifestSummary {
  runtime: 'browser'
  surfaceId: string
  surfaceName: string
  surfaceType: string
  protocolVersion: string
  runtimeVersion: string
  appVersion?: string
  framework?: string
  sessionId: string | null
  readiness: string
  readinessMessage?: string
  current: boolean
  stores: Array<{ name: string; mutable: boolean; dispatchable: boolean }>
  affordances: Array<{
    name: string
    kind: string
    safety: string
    executionPath: string
    description: string
  }>
  capabilities: Record<string, boolean>
}

interface SessionStatusResult {
  connected: boolean
  ready: boolean
  sessionId: string | null
  surfaceName: string | null
  surfaceType: string | null
  readiness: string
  currentSurfaceId: string | null
  browser: {
    sessionId: string | null
    url: string | null
    headless: boolean | null
    open: boolean
    attached: boolean
  }
  surfaces?: HarnessSurfaceSummary[]
  manifest?: HarnessManifestSummary
  error?: string
}

interface AttachResult {
  mode: 'harness-runtime' | 'degraded-browser-only'
  url: string
  browser: {
    sessionId: string | null
    headless: boolean | null
    open: boolean
    attached: boolean
  }
  runtimeDetected: boolean
  surfaces: HarnessSurfaceSummary[]
  selectedSurfaceId: string | null
  manifest?: HarnessManifestSummary
  affordances?: HarnessManifestSummary['affordances']
  screenshotPath?: string
  degradedCapabilities?: string[]
  degradedDomRoot?: string | null
  degradedAccessibilityRole?: string | null
  notes: string[]
}

const DEFAULT_TIMEOUT_MS = 5_000

function usage() {
  return [
    'Usage: ai-harness attach <url> [options]',
    '',
    'Options:',
    '  --surface <id>     Select a specific harness surface after attach.',
    '  --headless         Run the browser in headless mode.',
    '  --screenshot       Capture a screenshot after attach.',
    '  --json             Print machine-readable JSON and exit.',
    '  --timeout <ms>     How long to wait for the harness runtime or ready surface.',
  ].join('\n')
}

export function parseCliArgs(argv: string[]): CliParseResult {
  const [command, ...rest] = argv

  if (!command || command === '--help' || command === '-h') {
    return { command: 'help' }
  }

  if (command !== 'attach') {
    throw new Error(`Unknown command '${command}'.\n\n${usage()}`)
  }

  const url = rest[0]
  if (!url || url.startsWith('-')) {
    throw new Error(`attach requires a URL.\n\n${usage()}`)
  }

  let surfaceId: string | undefined
  let headless = false
  let json = false
  let screenshot = false
  let timeoutMs = DEFAULT_TIMEOUT_MS

  for (let index = 1; index < rest.length; index += 1) {
    const arg = rest[index]

    if (arg === '--surface') {
      surfaceId = rest[index + 1]
      index += 1
      if (!surfaceId) {
        throw new Error('--surface requires a value.')
      }
      continue
    }

    if (arg === '--timeout') {
      const next = rest[index + 1]
      index += 1
      timeoutMs = Number(next)
      if (!next || Number.isNaN(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout requires a positive number of milliseconds.')
      }
      continue
    }

    if (arg === '--headless') {
      headless = true
      continue
    }

    if (arg === '--json') {
      json = true
      continue
    }

    if (arg === '--screenshot') {
      screenshot = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      return { command: 'help' }
    }

    throw new Error(`Unknown option '${arg}'.\n\n${usage()}`)
  }

  return {
    command: 'attach',
    url,
    surfaceId,
    headless,
    json,
    screenshot,
    timeoutMs,
  }
}

export function armAttachUrl(url: string, surfaceId?: string) {
  const nextUrl = new URL(url)
  nextUrl.searchParams.set('ai-harness', '1')

  if (surfaceId) {
    nextUrl.searchParams.set('surface', surfaceId)
  }

  return nextUrl.toString()
}

export function resolveDefaultSurface(
  surfaces: Array<{ surfaceId: string; current: boolean }>,
  requestedSurfaceId?: string,
) {
  if (requestedSurfaceId) {
    return requestedSurfaceId
  }

  const currentSurface = surfaces.find((surface) => surface.current)
  if (currentSurface) {
    return currentSurface.surfaceId
  }

  if (surfaces.length === 1) {
    return surfaces[0].surfaceId
  }

  return null
}

function parseText(result: { content?: Array<Record<string, unknown>>; isError?: boolean } | Record<string, unknown>) {
  const content = Array.isArray((result as { content?: Array<Record<string, unknown>> }).content)
    ? (result as { content: Array<Record<string, unknown>> }).content
    : []
  const text = content
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text as string)
    .join('\n')

  if (text.length === 0 && 'toolResult' in result) {
    return (result as { toolResult: unknown }).toolResult
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function callTool<T>(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const parsed = parseText(result)

  if (result.isError) {
    throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed))
  }

  return parsed as T
}

function resolveRepoRoot() {
  return path.resolve(fileURLToPath(new URL('../../../', import.meta.url)))
}

function resolveMcpServerCommand() {
  const repoRoot = resolveRepoRoot()
  const sourceEntry = path.resolve(repoRoot, 'packages/mcp-server/src/index.ts')

  return {
    command: process.execPath,
    args: ['--import', 'tsx/esm', sourceEntry],
    cwd: path.resolve(repoRoot, 'packages/mcp-server'),
  }
}

async function waitForRuntimeConnection(client: Client, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastStatus: SessionStatusResult | null = null

  while (Date.now() < deadline) {
    lastStatus = await callTool<SessionStatusResult>(client, 'session.status')
    if (lastStatus.connected === true) {
      return lastStatus
    }

    await delay(250)
  }

  return lastStatus
}

async function waitForSurfacesReady(client: Client, timeoutMs: number, surfaceId?: string) {
  const deadline = Date.now() + timeoutMs
  let lastSurfaces: HarnessSurfaceSummary[] = []

  while (Date.now() < deadline) {
    const surfaces = await callTool<HarnessSurfaceSummary[]>(client, 'session.list_surfaces')
    lastSurfaces = surfaces

    if (surfaceId) {
      const target = surfaces.find((surface) => surface.surfaceId === surfaceId)
      if (!target) {
        throw new Error(`Surface '${surfaceId}' is not registered.`)
      }
      if (target.readiness === 'ready') {
        return surfaces
      }
    } else if (surfaces.length > 0 && surfaces.every((surface) => surface.readiness === 'ready')) {
      return surfaces
    }

    await delay(250)
  }

  return lastSurfaces
}

function summarizeDegradedDom(dom: unknown) {
  if (!dom || typeof dom !== 'object') return null

  const snapshot = dom as { tag?: string; id?: string; className?: string }
  const pieces = [snapshot.tag ?? 'unknown']
  if (snapshot.id) pieces.push(`#${snapshot.id}`)
  if (snapshot.className) {
    const classSuffix = snapshot.className
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((name) => `.${name}`)
      .join('')
    if (classSuffix) pieces.push(classSuffix)
  }

  return pieces.join('')
}

function summarizeAccessibility(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return null

  const node = snapshot as { role?: string; name?: string }
  return node.name ? `${node.role ?? 'unknown'}:${node.name}` : (node.role ?? null)
}

function printHumanReadable(result: AttachResult) {
  console.log(`Mode: ${result.mode}`)
  console.log(`URL: ${result.url}`)
  console.log(`Browser: ${result.browser.headless ? 'headless' : 'headful'} session ${result.browser.sessionId ?? 'pending'}`)

  if (result.screenshotPath) {
    console.log(`Screenshot: ${result.screenshotPath}`)
  }

  if (result.runtimeDetected) {
    console.log('Harness runtime: detected')

    if (result.surfaces.length > 0) {
      console.log('Surfaces:')
      for (const surface of result.surfaces) {
        const current = surface.current ? ' (current)' : ''
        console.log(`- ${surface.surfaceId} - ${surface.surfaceType} - ${surface.readiness}${current}`)
      }
    } else {
      console.log('Surfaces: none registered')
    }

    if (result.manifest) {
      console.log(`Selected surface: ${result.manifest.surfaceId} - ${result.manifest.surfaceType} - ${result.manifest.surfaceName}`)
      console.log(`Stores: ${result.manifest.stores.map((store) => store.name).join(', ') || 'none'}`)
      if (result.affordances && result.affordances.length > 0) {
        console.log('Affordances:')
        for (const affordance of result.affordances) {
          console.log(`- ${affordance.name} [${affordance.kind}/${affordance.executionPath}]`)
        }
      } else {
        console.log('Affordances: none')
      }
    } else if (result.notes.length > 0) {
      for (const note of result.notes) {
        console.log(note)
      }
    }

    return
  }

  console.log('Harness runtime: not detected, using degraded browser-only mode')
  if (result.degradedCapabilities && result.degradedCapabilities.length > 0) {
    console.log(`Browser-only capabilities: ${result.degradedCapabilities.join(', ')}`)
  }
  if (result.degradedDomRoot) {
    console.log(`DOM root: ${result.degradedDomRoot}`)
  }
  if (result.degradedAccessibilityRole) {
    console.log(`Accessibility root: ${result.degradedAccessibilityRole}`)
  }
}

async function runAttach(options: AttachOptions) {
  const server = resolveMcpServerCommand()
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    stderr: 'ignore',
  })
  const client = new Client({ name: 'ai-harness-cli', version: '0.1.0' })
  let result: AttachResult | null = null

  try {
    await client.connect(transport)

    const open = await callTool<{ url: string; headless: boolean; sessionId: string }>(client, 'browser.open', {
      url: armAttachUrl(options.url, options.surfaceId),
      headless: options.headless,
      width: 1500,
      height: 1200,
    })

    const browserStatus = await waitForRuntimeConnection(client, options.timeoutMs)

    result = {
      mode: browserStatus?.connected === true ? 'harness-runtime' : 'degraded-browser-only',
      url: open.url,
      browser: {
        sessionId: browserStatus?.browser.sessionId ?? open.sessionId,
        headless: browserStatus?.browser.headless ?? open.headless,
        open: browserStatus?.browser.open ?? true,
        attached: browserStatus?.browser.attached ?? false,
      },
      runtimeDetected: browserStatus?.connected === true,
      surfaces: [],
      selectedSurfaceId: null,
      notes: [],
    }

    if (browserStatus?.connected === true) {
      const surfaces = await waitForSurfacesReady(client, options.timeoutMs, options.surfaceId)
      result.surfaces = surfaces

      const resolvedSurfaceId = resolveDefaultSurface(surfaces, options.surfaceId)
      result.selectedSurfaceId = resolvedSurfaceId

      if (resolvedSurfaceId) {
        await callTool(client, 'session.wait_until_ready', {
          surfaceId: resolvedSurfaceId,
          timeoutMs: options.timeoutMs,
          pollIntervalMs: 250,
        })
        const manifest = await callTool<HarnessManifestSummary>(client, 'session.select_surface', {
          surfaceId: resolvedSurfaceId,
        })
        const affordances = await callTool<HarnessManifestSummary['affordances']>(client, 'explorer.get_affordances', {
          surfaceId: resolvedSurfaceId,
        })
        result.manifest = manifest
        result.affordances = affordances
      } else {
        result.notes.push('Multiple surfaces are available but none is selected. Pass --surface <id> to inspect a specific manifest and affordances.')
      }
    } else {
      result.degradedCapabilities = [
        'browser.get_dom',
        'browser.get_accessibility_tree',
        'browser.click',
        'browser.type',
        'browser.press',
        'browser.screenshot',
      ]
      const [dom, accessibility] = await Promise.all([
        callTool<unknown>(client, 'browser.get_dom', { selector: 'body' }),
        callTool<unknown>(client, 'browser.get_accessibility_tree', {}),
      ])
      result.degradedDomRoot = summarizeDegradedDom(dom)
      result.degradedAccessibilityRole = summarizeAccessibility(accessibility)
      if (options.surfaceId) {
        result.notes.push(`Requested surface '${options.surfaceId}' was ignored because no harness runtime was detected.`)
      }
    }

    if (options.screenshot) {
      const screenshot = await callTool<{ path: string }>(client, 'browser.screenshot', {
        name: options.surfaceId ? `attach-${options.surfaceId}` : 'attach',
      })
      result.screenshotPath = screenshot.path
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      printHumanReadable(result)
    }

    const shouldHoldOpen = !options.headless && !options.json
    if (shouldHoldOpen) {
      console.log('Session remains open. Press Ctrl+C to close.')
      await new Promise<void>((resolve) => {
        const stop = () => resolve()
        process.once('SIGINT', stop)
        process.once('SIGTERM', stop)
      })
    }

    return 0
  } finally {
    try {
      await callTool(client, 'browser.close', {})
    } catch {}

    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const parsed = parseCliArgs(argv)

    if (parsed.command === 'help') {
      console.log(usage())
      return 0
    }

    return await runAttach(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AI Harness] ${message}`)
    return 1
  }
}

const isMainModule = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false

if (isMainModule) {
  main().then((code) => {
    process.exit(code)
  })
}
