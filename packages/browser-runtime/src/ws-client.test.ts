import { describe, expect, it } from 'vitest'
import type { RuntimeError } from '@ai-runtime-harness/protocol'
import { CommandDispatcher } from './ws-client'
import { DomModule } from './dom'
import { ConsoleCapture } from './console'
import { NetworkCapture } from './network'
import { ReactReader } from './react'
import { StoresModule } from './stores'

type HarnessWindow = Window & {
  __AI_HARNESS__?: {
    actions?: Record<string, (args: unknown) => unknown>
    errors?: RuntimeError[]
  }
}

function makeModules() {
  return {
    dom: new DomModule(),
    console: new ConsoleCapture(),
    network: new NetworkCapture(),
    react: new ReactReader(),
    stores: new StoresModule(),
  }
}

describe('CommandDispatcher', () => {
  it('handles GET_CONSOLE command', async () => {
    const mods = makeModules()
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '1', type: 'GET_CONSOLE' })
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.result)).toBe(true)
  })

  it('handles GET_STORE command', async () => {
    const mods = makeModules()
    mods.stores.register('app', () => ({ user: 'henri' }))
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '2', type: 'GET_STORE', payload: { name: 'app' } })
    expect(result.ok).toBe(true)
    expect((result.result as { state: unknown }).state).toEqual({ user: 'henri' })
  })

  it('handles SET_STORE_STATE command', async () => {
    const mods = makeModules()
    let state = { count: 0 }
    mods.stores.register('counter', () => state, (patch) => {
      state = { ...state, ...(patch as Record<string, unknown>) }
    })

    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({
      id: '3',
      type: 'SET_STORE_STATE',
      payload: { name: 'counter', patch: { count: 2 } },
    })

    expect(result.ok).toBe(true)
    expect(mods.stores.get('counter')?.state).toEqual({ count: 2 })
  })

  it('returns DOM snapshots for GET_DOM', async () => {
    const mods = makeModules()
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '4', type: 'GET_DOM' })
    expect(result.ok).toBe(true)
  })

  it('returns error response on thrown exception', async () => {
    const mods = makeModules()
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '5', type: 'CLICK', payload: { selector: '#nonexistent' } })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('calls registered harness actions', async () => {
    const mods = makeModules()
    ;(window as HarnessWindow).__AI_HARNESS__ = {
      actions: {
        ping: (args) => ({ ok: true, args }),
      },
      errors: [],
    }

    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({
      id: '6',
      type: 'CALL_ACTION',
      payload: { name: 'ping', args: { value: 1 } },
    })

    expect(result.ok).toBe(true)
    expect(result.result).toEqual({ ok: true, args: { value: 1 } })
  })

  it('returns captured errors', async () => {
    const mods = makeModules()
    ;(window as HarnessWindow).__AI_HARNESS__ = {
      actions: {},
      errors: [{ message: 'boom', timestamp: 1 }],
    }

    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '7', type: 'GET_ERRORS' })

    expect(result.ok).toBe(true)
    expect(result.result).toEqual([{ message: 'boom', timestamp: 1 }])
  })
})
