import type { BrowserOpenOptions, BrowserOpenResult, BrowserScreenshotResult } from '@ai-runtime-harness/browser-driver'
import type {
  ActionMetadata,
  ComponentSnapshot,
  ConsoleEvent,
  DomSnapshot,
  HarnessSurfaceManifest,
  HarnessSessionState,
  NetworkEvent,
  Observation,
  RuntimeError,
  StoreSnapshot,
} from '@ai-runtime-harness/protocol'

export interface ExplorerRuntimeClient {
  getDom(selector?: string): Promise<DomSnapshot | null>
  getReactTree(component?: string): Promise<ComponentSnapshot[] | unknown>
  getStore(name?: string, surfaceId?: string): Promise<StoreSnapshot | StoreSnapshot[] | null>
  getManifest(surfaceId?: string): Promise<HarnessSurfaceManifest>
  getSessionState(): Promise<HarnessSessionState>
  getConsole(limit?: number): Promise<ConsoleEvent[]>
  getNetwork(limit?: number): Promise<NetworkEvent[]>
  getErrors(): Promise<RuntimeError[]>
  getActions(surfaceId?: string): Promise<ActionMetadata[]>
  callAction(name: string, args?: unknown, surfaceId?: string): Promise<unknown>
  setStoreState(name: string, patch: unknown, surfaceId?: string): Promise<void>
}

export interface ExplorerBrowserDriver {
  open(url: string, options?: BrowserOpenOptions): Promise<BrowserOpenResult>
  screenshot(options?: { name?: string; selector?: string }): Promise<BrowserScreenshotResult>
  click(selector: string): Promise<unknown>
  press(key: string): Promise<unknown>
  currentUrl(): Promise<string | null>
}

export interface ExplorerObservation extends Observation {
  actions: ActionMetadata[]
  url?: string | null
}

function isStoreArray(value: StoreSnapshot | StoreSnapshot[] | null): value is StoreSnapshot[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeNestedPatch(current: unknown, segments: string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = segments
  if (!head) throw new Error('State path is empty.')

  if (rest.length === 0) {
    return { [head]: value }
  }

  const currentRecord = isRecord(current) ? current : {}
  const currentChild = currentRecord[head]
  const childPatch = mergeNestedPatch(currentChild, rest, value)

  return {
    [head]: isRecord(currentChild)
      ? { ...currentChild, ...childPatch }
      : childPatch,
  }
}

export class Explorer {
  constructor(
    private readonly runtime: ExplorerRuntimeClient,
    private readonly browser: ExplorerBrowserDriver,
  ) {}

  async open(url: string, options?: BrowserOpenOptions) {
    return this.browser.open(url, options)
  }

  async observe(selector?: string, surfaceId?: string): Promise<ExplorerObservation> {
    const [actions, session, url, dom, components, stores, network, consoleEvents, errors] = await Promise.all([
      this.getActions(surfaceId),
      this.runtime.getSessionState(),
      this.browser.currentUrl(),
      this.runtime.getDom(selector),
      this.runtime.getReactTree(),
      this.listStores(surfaceId),
      this.runtime.getNetwork(),
      this.runtime.getConsole(),
      this.runtime.getErrors(),
    ])

    return {
      runtime: 'browser',
      time: Date.now(),
      actions,
      session,
      url,
      dom: dom ?? undefined,
      components: Array.isArray(components) ? (components as ComponentSnapshot[]) : undefined,
      stores,
      network,
      console: consoleEvents,
      errors,
    }
  }

  async getActions(surfaceId?: string) {
    return this.runtime.getActions(surfaceId)
  }

  async getAffordances(surfaceId?: string) {
    return this.runtime.getManifest(surfaceId).then((manifest) => manifest.affordances)
  }

  async getManifest(surfaceId?: string) {
    return this.runtime.getManifest(surfaceId)
  }

  async getStore(name?: string, surfaceId?: string) {
    return this.runtime.getStore(name, surfaceId)
  }

  async getDom(selector?: string) {
    return this.runtime.getDom(selector)
  }

  async getReactTree(component?: string) {
    return this.runtime.getReactTree(component)
  }

  async callAction(name: string, args?: unknown, surfaceId?: string) {
    return this.runtime.callAction(name, args, surfaceId)
  }

  async screenshot(name?: string) {
    return this.browser.screenshot({ name })
  }

  async click(selector: string) {
    return this.browser.click(selector)
  }

  async press(key: string) {
    return this.browser.press(key)
  }

  async advanceFrames(count: number, surfaceId?: string) {
    const actions = await this.getActions(surfaceId)
    const actionName = ['advanceFrames', 'stepFrames', 'advance', 'step']
      .find((candidate) => actions.some((action) => action.name === candidate))

    if (!actionName) {
      throw new Error('No frame-advance action is registered. Tried advanceFrames, stepFrames, advance, and step.')
    }

    return this.callAction(actionName, { count }, surfaceId)
  }

  async mutate(path: string, value: unknown, surfaceId?: string) {
    const segments = path.split('.').filter(Boolean)
    if (segments.length === 0) {
      throw new Error('Mutation path cannot be empty.')
    }

    const [storeName, ...statePath] = segments
    const store = await this.runtime.getStore(storeName, surfaceId)

    if (!store || isStoreArray(store)) {
      throw new Error(`Store not found: ${storeName}`)
    }

    if (!store.mutable) {
      throw new Error(`Store '${storeName}' is not registered as mutable.`)
    }

    if (statePath.length === 0) {
      if (!isRecord(value)) {
        throw new Error('Top-level store mutations require an object patch.')
      }
      await this.runtime.setStoreState(storeName, value, surfaceId)
      return this.runtime.getStore(storeName, surfaceId)
    }

    const patch = mergeNestedPatch(store.state, statePath, value)
    await this.runtime.setStoreState(storeName, patch, surfaceId)
    return this.runtime.getStore(storeName, surfaceId)
  }

  private async listStores(surfaceId?: string) {
    const stores = await this.runtime.getStore(undefined, surfaceId)
    if (!stores) return []
    return Array.isArray(stores) ? stores : [stores]
  }
}
