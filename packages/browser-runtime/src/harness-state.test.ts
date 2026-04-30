import { beforeEach, describe, expect, it } from 'vitest'
import {
  assertHarnessActionAvailable,
  buildHarnessManifest,
  ensureHarnessState,
  getHarnessConfig,
  getCurrentHarnessSurfaceId,
  getOrCreateHarnessSurface,
  selectHarnessSurface,
  shouldAutoConnect,
  subscribeHarnessSession,
  updateHarnessConfig,
  updateHarnessSessionState,
  updateHarnessSurface,
} from './harness-state'

type HarnessWindow = Window & {
  __AI_HARNESS__?: unknown
  __AI_HARNESS_CONFIG__?: unknown
}

describe('harness state', () => {
  beforeEach(() => {
    const win = window as HarnessWindow
    win.__AI_HARNESS__ = undefined
    win.__AI_HARNESS_CONFIG__ = undefined
    window.history.replaceState({}, '', '/')
  })

  it('creates a shared harness state with a default surface registry', () => {
    const state = ensureHarnessState()

    expect(state.errors).toEqual([])
    expect(state.initialized).toBe(false)
    expect(state.session.mode).toBe('explorer')
    expect(state.session.selectedSurfaceId).toBe('default')
    expect(state.session.selectedSurfaceType).toBe('app')
    expect(state.session.lastAction).toBeNull()
    expect(state.currentSurfaceId).toBe('default')
    expect(state.surfaces.default.readiness).toBe('booting')
    expect(state.surfaces.default.stores.getAll()).toEqual([])
    expect(state.surfaces.default.actions).toEqual({})
  })

  it('notifies session subscribers when session state changes', () => {
    window.history.replaceState({}, '', '/?ai-harness-session=session-123')
    const seen: string[] = []

    const unsubscribe = subscribeHarnessSession((session) => {
      seen.push(`${session.sessionId}:${session.recording}:${session.mode}`)
    })

    updateHarnessSessionState({ recording: true, mode: 'recording' })
    unsubscribe()

    expect(seen[0]).toContain('session-123')
    expect(seen[1]).toBe('session-123:true:recording')
  })

  it('does not auto-connect by default', () => {
    expect(shouldAutoConnect()).toBe(false)
  })

  it('auto-connects when enabled by config', () => {
    updateHarnessConfig({ autoConnect: true })

    expect(getHarnessConfig().autoConnect).toBe(true)
    expect(shouldAutoConnect()).toBe(true)
  })

  it('auto-connects when ai-harness query flag is present', () => {
    window.history.replaceState({}, '', '/?ai-harness=1')

    expect(shouldAutoConnect()).toBe(true)
  })

  it('treats explicit false query values as disabled', () => {
    window.history.replaceState({}, '', '/?ai-harness=false')
    updateHarnessConfig({ autoConnect: true })

    expect(shouldAutoConnect()).toBe(false)
  })

  it('builds a manifest from a surface-local store and action registry', () => {
    updateHarnessSurface('dashboard', {
      name: 'Aether Atlas Dashboard',
      type: 'dashboard',
      runtimeVersion: '1.0.0',
      readiness: 'ready',
    })

    const dashboard = getOrCreateHarnessSurface('dashboard')
    dashboard.stores.register('dashboard', () => ({ focusRegion: 'North Atlantic' }))
    dashboard.actions.ping = {
      fn: () => true,
      metadata: {
        name: 'ping',
        kind: 'system',
        safety: 'normal',
        executionPath: 'system',
        description: 'Ping the surface.',
      },
    }

    expect(getCurrentHarnessSurfaceId()).toBe('dashboard')

    const manifest = buildHarnessManifest('dashboard')

    expect(manifest.surfaceId).toBe('dashboard')
    expect(manifest.surfaceName).toBe('Aether Atlas Dashboard')
    expect(manifest.surfaceType).toBe('dashboard')
    expect(manifest.runtimeVersion).toBe('1.0.0')
    expect(manifest.readiness).toBe('ready')
    expect(manifest.current).toBe(true)
    expect(manifest.stores).toEqual([
      {
        name: 'dashboard',
        mutable: false,
        dispatchable: false,
      },
    ])
    expect(manifest.affordances).toEqual([
      {
        name: 'ping',
        kind: 'system',
        safety: 'normal',
        executionPath: 'system',
        description: 'Ping the surface.',
      },
    ])
    expect(ensureHarnessState().session.selectedSurfaceId).toBe('dashboard')
    expect(ensureHarnessState().session.selectedSurfaceName).toBe('Aether Atlas Dashboard')
  })

  it('allows duplicate local action names across surfaces and resolves them by selection', async () => {
    updateHarnessSurface('dashboard', {
      name: 'Dashboard',
      type: 'dashboard',
      runtimeVersion: '1.0.0',
      readiness: 'ready',
    })
    updateHarnessSurface('platformer', {
      name: 'Platformer',
      type: 'game',
      runtimeVersion: '1.0.0',
      readiness: 'ready',
    })

    const dashboard = getOrCreateHarnessSurface('dashboard')
    const platformer = getOrCreateHarnessSurface('platformer')

    dashboard.actions.reset = {
      fn: async () => 'dashboard-reset',
      metadata: {
        name: 'reset',
        kind: 'debug',
        safety: 'debug-only',
        executionPath: 'semantic-action',
        description: 'Reset the dashboard.',
      },
    }

    platformer.actions.reset = {
      fn: async () => 'platformer-reset',
      metadata: {
        name: 'reset',
        kind: 'debug',
        safety: 'debug-only',
        executionPath: 'semantic-action',
        description: 'Reset the platformer.',
      },
    }

    expect(() => buildHarnessManifest()).toThrow('Surface selection is ambiguous')

    expect(await assertHarnessActionAvailable('reset', 'dashboard').fn(undefined)).toBe('dashboard-reset')
    expect(await assertHarnessActionAvailable('reset', 'platformer').fn(undefined)).toBe('platformer-reset')

    selectHarnessSurface('platformer')
    expect(await assertHarnessActionAvailable('reset').fn(undefined)).toBe('platformer-reset')
    expect(ensureHarnessState().session.selectedSurfaceId).toBe('platformer')
    expect(ensureHarnessState().session.selectedSurfaceType).toBe('game')
  })
})
