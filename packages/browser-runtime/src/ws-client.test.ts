import { describe, expect, it, beforeEach } from 'vitest'
import { CommandDispatcher } from './ws-client'
import { DomModule } from './dom'
import { ConsoleCapture } from './console'
import { NetworkCapture } from './network'
import { ReactReader } from './react'
import {
  ensureHarnessState,
  getOrCreateHarnessSurface,
  updateHarnessSurface,
} from './harness-state'

type HarnessWindow = Window & {
  __AI_HARNESS__?: unknown
}

function makeModules() {
  return {
    dom: new DomModule(),
    console: new ConsoleCapture(),
    network: new NetworkCapture(),
    react: new ReactReader(),
  }
}

describe('CommandDispatcher', () => {
  beforeEach(() => {
    ;(window as HarnessWindow).__AI_HARNESS__ = undefined
  })

  it('handles GET_CONSOLE command', async () => {
    const mods = makeModules()
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '1', type: 'GET_CONSOLE' })
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.result)).toBe(true)
  })

  it('handles GET_STORE command', async () => {
    updateHarnessSurface('app', {
      name: 'App',
      type: 'app',
      runtimeVersion: '1.0.0',
      readiness: 'ready',
    })
    getOrCreateHarnessSurface('app').stores.register('app', () => ({ user: 'henri' }))

    const dispatcher = new CommandDispatcher(makeModules())
    const result = await dispatcher.dispatch({ id: '2', type: 'GET_STORE', payload: { name: 'app', surfaceId: 'app' } })
    expect(result.ok).toBe(true)
    expect((result.result as { state: unknown }).state).toEqual({ user: 'henri' })
  })

  it('lists registered harness actions for the selected surface only', async () => {
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

    getOrCreateHarnessSurface('dashboard').actions.reset = {
      fn: () => true,
      metadata: {
        name: 'reset',
        kind: 'debug',
        safety: 'debug-only',
        executionPath: 'semantic-action',
        description: 'Reset dashboard',
      },
    }
    getOrCreateHarnessSurface('platformer').actions.reset = {
      fn: () => true,
      metadata: {
        name: 'reset',
        kind: 'debug',
        safety: 'debug-only',
        executionPath: 'semantic-action',
        description: 'Reset platformer',
      },
    }

    const dispatcher = new CommandDispatcher(makeModules())
    const ambiguous = await dispatcher.dispatch({ id: '2a', type: 'GET_ACTIONS' })
    expect(ambiguous.ok).toBe(false)
    expect(ambiguous.error).toContain('Surface selection is ambiguous')

    await dispatcher.dispatch({ id: '2b', type: 'SELECT_SURFACE', payload: { surfaceId: 'platformer' } })
    const selected = await dispatcher.dispatch({ id: '2c', type: 'GET_ACTIONS' })

    expect(selected.ok).toBe(true)
    expect(selected.result).toEqual([
      {
        name: 'reset',
        kind: 'debug',
        safety: 'debug-only',
        executionPath: 'semantic-action',
        description: 'Reset platformer',
      },
    ])
  })

  it('returns a surface manifest', async () => {
    updateHarnessSurface('dashboard', {
      name: 'Aether Atlas Dashboard',
      type: 'dashboard',
      runtimeVersion: '1.0.0',
      readiness: 'ready',
    })
    const surface = getOrCreateHarnessSurface('dashboard')
    surface.stores.register('dashboard', () => ({ focusRegion: 'North Atlantic' }))
    surface.actions.ping = {
      fn: () => true,
      metadata: {
        name: 'ping',
        kind: 'system',
        safety: 'normal',
        executionPath: 'system',
        description: 'Ping',
      },
    }

    const dispatcher = new CommandDispatcher(makeModules())
    const result = await dispatcher.dispatch({ id: '2d', type: 'GET_MANIFEST', payload: { surfaceId: 'dashboard' } })

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({
      surfaceType: 'dashboard',
      stores: [{ name: 'dashboard' }],
      affordances: [{ name: 'ping' }],
    })
  })

  it('handles SET_STORE_STATE command', async () => {
    let state = { count: 0 }
    updateHarnessSurface('counter-surface', {
      name: 'Counter',
      type: 'app',
      runtimeVersion: '1.0.0',
      readiness: 'ready',
    })
    getOrCreateHarnessSurface('counter-surface').stores.register('counter', () => state, (patch) => {
      state = { ...state, ...(patch as Record<string, unknown>) }
    })

    const dispatcher = new CommandDispatcher(makeModules())
    const result = await dispatcher.dispatch({
      id: '3',
      type: 'SET_STORE_STATE',
      payload: { name: 'counter', patch: { count: 2 }, surfaceId: 'counter-surface' },
    })

    expect(result.ok).toBe(true)
    expect(state).toEqual({ count: 2 })
  })

  it('returns DOM snapshots for GET_DOM', async () => {
    const dispatcher = new CommandDispatcher(makeModules())
    const result = await dispatcher.dispatch({ id: '4', type: 'GET_DOM' })
    expect(result.ok).toBe(true)
  })

  it('returns error response on thrown exception', async () => {
    const dispatcher = new CommandDispatcher(makeModules())
    const result = await dispatcher.dispatch({ id: '5', type: 'CLICK', payload: { selector: '#nonexistent' } })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('calls registered harness actions against the requested surface', async () => {
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

    getOrCreateHarnessSurface('dashboard').actions.reset = {
      fn: () => ({ ok: true, surface: 'dashboard' }),
      metadata: {
        name: 'reset',
        kind: 'debug',
        safety: 'debug-only',
        executionPath: 'semantic-action',
        description: 'Reset dashboard',
      },
    }
    getOrCreateHarnessSurface('platformer').actions.reset = {
      fn: (args) => ({ ok: true, surface: 'platformer', args }),
      metadata: {
        name: 'reset',
        kind: 'debug',
        safety: 'debug-only',
        executionPath: 'semantic-action',
        description: 'Reset platformer',
      },
    }

    const dispatcher = new CommandDispatcher(makeModules())
    const result = await dispatcher.dispatch({
      id: '6',
      type: 'CALL_ACTION',
      payload: { name: 'reset', args: { value: 1 }, surfaceId: 'platformer' },
    })

    expect(result.ok).toBe(true)
    expect(result.result).toEqual({ ok: true, surface: 'platformer', args: { value: 1 } })
    expect(ensureHarnessState().session.lastAction).toMatchObject({
      name: 'reset',
      source: 'debug-mutation',
      surfaceId: 'platformer',
      surfaceType: 'game',
    })
  })

  it('returns and updates runtime session state', async () => {
    const dispatcher = new CommandDispatcher(makeModules())

    const updated = await dispatcher.dispatch({
      id: '6b',
      type: 'SET_SESSION_STATE',
      payload: {
        patch: {
          sessionId: 'session-1',
          mode: 'recording',
          recording: true,
        },
      },
    })

    expect(updated.ok).toBe(true)

    const result = await dispatcher.dispatch({ id: '6c', type: 'GET_SESSION_STATE' })
    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({
      sessionId: 'session-1',
      mode: 'recording',
      recording: true,
    })
  })

  it('returns captured errors', async () => {
    ;(window as HarnessWindow).__AI_HARNESS__ = {
      errors: [{ message: 'boom', timestamp: 1 }],
    }

    const dispatcher = new CommandDispatcher(makeModules())
    const result = await dispatcher.dispatch({ id: '7', type: 'GET_ERRORS' })

    expect(result.ok).toBe(true)
    expect(result.result).toEqual([{ message: 'boom', timestamp: 1 }])
  })
})
