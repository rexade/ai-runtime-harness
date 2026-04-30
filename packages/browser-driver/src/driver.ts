import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'

const WINDOWS_BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

const UNIX_BROWSER_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

const DEFAULT_LAUNCH_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-features=EdgeFirstRunExperience,AutoImportAtFirstRun,SigninPromo,UserEducationExperience,msEdgeDefaultBrowserPrompt',
]

export interface BrowserOpenOptions {
  headless?: boolean
  width?: number
  height?: number
}

export interface BrowserAttachOptions {
  cdpUrl?: string
  targetUrl?: string
}

export interface BrowserScreenshotOptions {
  name?: string
  selector?: string
  outputDir?: string
  fileName?: string
}

export interface BrowserOpenResult {
  url: string
  headless: boolean
  sessionId: string
}

export interface BrowserAttachResult extends BrowserOpenResult {
  attached: true
  cdpUrl: string
}

export interface BrowserScreenshotResult {
  path: string
  url: string
  sessionId: string | null
}

export interface BrowserSessionInfo {
  sessionId: string | null
  url: string | null
  headless: boolean | null
  open: boolean
  attached: boolean
}

const DEFAULT_CDP_URL = 'http://127.0.0.1:9222'

export function sanitizeArtifactName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'capture'
}

export function resolveBrowserExecutable(
  env: Record<string, string | undefined> = process.env,
  exists: (path: string) => boolean = existsSync,
) {
  if (env.BROWSER_PATH && exists(env.BROWSER_PATH)) {
    return env.BROWSER_PATH
  }

  const candidates = process.platform === 'win32'
    ? WINDOWS_BROWSER_CANDIDATES
    : UNIX_BROWSER_CANDIDATES

  return candidates.find((candidate) => exists(candidate)) ?? null
}

function createTimestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function createSessionId() {
  return `explorer-${randomUUID().slice(0, 8)}`
}

function injectSessionId(url: string, sessionId: string) {
  const nextUrl = new URL(url)
  nextUrl.searchParams.set('ai-harness-session', sessionId)
  return nextUrl.toString()
}

function readSessionId(url: string) {
  try {
    return new URL(url).searchParams.get('ai-harness-session')
  } catch {
    return null
  }
}

function selectAttachedPage(contexts: BrowserContext[], targetUrl?: string) {
  const pages = contexts.flatMap((context) => context.pages())

  if (targetUrl) {
    const exactMatch = pages.find((page) => page.url() === targetUrl)
    if (exactMatch) return exactMatch

    const prefixMatch = pages.find((page) => page.url().startsWith(targetUrl))
    if (prefixMatch) return prefixMatch

    const partialMatch = pages.find((page) => page.url().includes(targetUrl))
    if (partialMatch) return partialMatch
  }

  return pages.length > 0 ? pages[pages.length - 1] : null
}

export class BrowserDriver {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private readonly artifactRoot: string
  private readonly executablePath?: string
  private sessionId: string | null = null
  private headless: boolean | null = null
  private attached = false

  constructor(options: { artifactRoot?: string; executablePath?: string } = {}) {
    this.artifactRoot = resolve(options.artifactRoot ?? process.env.AI_HARNESS_ARTIFACT_DIR ?? process.cwd(), '.ai-harness')
    this.executablePath = options.executablePath
  }

  async attach(options: BrowserAttachOptions = {}): Promise<BrowserAttachResult> {
    await this.close()

    const cdpUrl = options.cdpUrl ?? DEFAULT_CDP_URL
    this.browser = await chromium.connectOverCDP(cdpUrl)
    this.attached = true
    this.headless = false

    const contexts = this.browser.contexts()
    const selectedPage = selectAttachedPage(contexts, options.targetUrl)
    const context = selectedPage?.context() ?? contexts[0] ?? await this.browser.newContext()
    const page = selectedPage ?? context.pages()[0] ?? await context.newPage()

    this.context = context
    this.page = page
    this.sessionId = readSessionId(page.url()) ?? createSessionId()

    await page.bringToFront()

    return {
      url: page.url(),
      headless: false,
      sessionId: this.sessionId,
      attached: true,
      cdpUrl,
    }
  }

  async open(url: string, options: BrowserOpenOptions = {}): Promise<BrowserOpenResult> {
    const page = await this.ensurePage(options)
    this.sessionId ??= createSessionId()
    this.headless = this.attached ? false : (options.headless ?? false)

    const sessionUrl = injectSessionId(url, this.sessionId)
    await page.goto(sessionUrl, { waitUntil: 'domcontentloaded' })
    await page.bringToFront()

    return {
      url: page.url(),
      headless: this.headless,
      sessionId: this.sessionId,
    }
  }

  async screenshot(options: BrowserScreenshotOptions = {}): Promise<BrowserScreenshotResult> {
    const page = this.requirePage()
    const screenshotsDir = resolve(options.outputDir ?? join(this.artifactRoot, 'screenshots'))
    await mkdir(screenshotsDir, { recursive: true })

    const fileName = options.fileName
      ?? `${createTimestampId()}-${sanitizeArtifactName(options.name ?? 'browser')}.png`
    const path = join(screenshotsDir, fileName)

    if (options.selector) {
      await page.locator(options.selector).screenshot({ path })
    } else {
      await page.screenshot({ path, fullPage: true })
    }

    return {
      path,
      url: page.url(),
      sessionId: this.sessionId,
    }
  }

  async click(selector: string) {
    const page = this.requirePage()
    await page.locator(selector).click()
    return {
      clicked: selector,
      url: page.url(),
      sessionId: this.sessionId,
    }
  }

  async press(key: string) {
    const page = this.requirePage()
    await page.keyboard.press(key)
    return {
      key,
      url: page.url(),
      sessionId: this.sessionId,
    }
  }

  async currentUrl() {
    return this.page?.url() ?? null
  }

  currentSession(): BrowserSessionInfo {
    return {
      sessionId: this.sessionId,
      url: this.page?.url() ?? null,
      headless: this.headless,
      open: Boolean(this.page) && !this.page!.isClosed(),
      attached: this.attached,
    }
  }

  async close() {
    if (!this.attached) {
      await this.page?.close().catch(() => {})
      await this.context?.close().catch(() => {})
    }
    await this.browser?.close().catch(() => {})
    this.page = null
    this.context = null
    this.browser = null
    this.sessionId = null
    this.headless = null
    this.attached = false
  }

  private async ensurePage(options: BrowserOpenOptions) {
    if (!this.browser) {
      const executablePath = this.executablePath ?? resolveBrowserExecutable()
      if (!executablePath) {
        throw new Error('No supported Chromium browser found. Set BROWSER_PATH to continue.')
      }

      this.browser = await chromium.launch({
        executablePath,
        headless: options.headless ?? false,
        args: DEFAULT_LAUNCH_ARGS,
      })
      this.attached = false
    }

    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: {
          width: options.width ?? 1440,
          height: options.height ?? 1200,
        },
      })
    }

    if (!this.page || this.page.isClosed()) {
      this.page = this.context.pages()[0] ?? await this.context.newPage()
    }

    return this.page
  }

  private requirePage() {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Browser page is not open. Call browser.open(url) first.')
    }

    return this.page
  }
}
