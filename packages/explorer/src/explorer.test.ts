import { describe, expect, it, vi } from 'vitest'
import { Explorer, type ExplorerBrowserDriver, type ExplorerRuntimeClient } from './explorer'

function makeRuntime(overrides: Partial<ExplorerRuntimeClient> = {}): ExplorerRuntimeClient {
  return {
    async getDom() {
      return { tag: 'div', attrs: {}, children: [] }
    },
    async getReactTree() {
      return []
    },
    async getStore(name?: string) {
      if (!name) {
        return [{ name: 'run', state: { nested: { count: 1 }, tick: 0 }, mutable: true }]
      }

      return { name: 'run', state: { nested: { count: 1 }, tick: 0 }, mutable: true }
    },
    async getManifest() {
      return {
        runtime: 'browser',
        surfaceId: 'test-surface',
        surfaceName: 'Test Surface',
        surfaceType: 'app',
        protocolVersion: '0.1.0',
        runtimeVersion: '0.1.0',
        sessionId: 'session-1',
        readiness: 'ready',
        current: true,
        stores: [{ name: 'run', mutable: true, dispatchable: false }],
        affordances: [],
        capabilities: {
          dom: true,
          reactTree: true,
          stores: true,
          console: true,
          network: true,
          errors: true,
          screenshots: true,
          browserInput: true,
          frameControl: true,
        },
      }
    },
    async getSessionState() {
      return {
        sessionId: 'session-1',
        connection: 'connected',
        recording: false,
        mode: 'explorer',
        selectedSurfaceId: 'test-surface',
        selectedSurfaceName: 'Test Surface',
        selectedSurfaceType: 'app',
        lastAction: null,
        updatedAt: 1,
      }
    },
    async getConsole() {
      return []
    },
    async getNetwork() {
      return []
    },
    async getErrors() {
      return []
    },
    async getActions() {
      return [
        {
          name: 'stepFrames',
          kind: 'system',
          safety: 'normal',
          executionPath: 'system',
          description: 'Advance one frame.',
        },
        {
          name: 'jump',
          kind: 'player',
          safety: 'normal',
          executionPath: 'game-input',
          description: 'Jump.',
        },
      ]
    },
    async callAction(name: string, args?: unknown) {
      return { name, args }
    },
    async setStoreState() {},
    ...overrides,
  }
}

function makeBrowser(overrides: Partial<ExplorerBrowserDriver> = {}): ExplorerBrowserDriver {
  return {
    async open(url: string) {
      return { url, headless: true, sessionId: 'session-1' }
    },
    async screenshot(options = {}) {
      return { path: options.name ?? 'proof.png', url: 'http://localhost', sessionId: 'session-1' }
    },
    async click(selector: string) {
      return { selector }
    },
    async press(key: string) {
      return { key }
    },
    async currentUrl() {
      return 'http://localhost'
    },
    ...overrides,
  }
}

describe('Explorer', () => {
  it('aggregates a runtime observation', async () => {
    const explorer = new Explorer(makeRuntime(), makeBrowser())
    const observation = await explorer.observe()

    expect(observation.actions.map((action) => action.name)).toEqual(['stepFrames', 'jump'])
    expect(observation.session?.sessionId).toBe('session-1')
    expect(observation.url).toBe('http://localhost')
    expect(observation.stores?.[0].name).toBe('run')
  })

  it('uses discovered frame-advance actions instead of guessing blindly', async () => {
    const callAction = vi.fn(async (name: string, args?: unknown) => ({ name, args }))
    const explorer = new Explorer(makeRuntime({ callAction }), makeBrowser())

    await explorer.advanceFrames(3)

    expect(callAction).toHaveBeenCalledWith('stepFrames', { count: 3 }, undefined)
  })

  it('mutates only registered mutable store paths', async () => {
    const setStoreState = vi.fn(async () => {})
    const explorer = new Explorer(makeRuntime({ setStoreState }), makeBrowser())

    await explorer.mutate('run.nested.count', 4)

    expect(setStoreState).toHaveBeenCalledWith('run', {
      nested: {
        count: 4,
      },
    }, undefined)
  })
})
