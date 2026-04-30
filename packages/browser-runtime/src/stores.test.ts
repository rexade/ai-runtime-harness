import { beforeEach, describe, expect, it } from 'vitest'
import { StoresModule } from './stores'

describe('StoresModule', () => {
  let stores: StoresModule

  beforeEach(() => {
    stores = new StoresModule()
  })

  it('starts with no registered stores', () => {
    expect(stores.getAll()).toEqual([])
  })

  it('registers and reads a store', () => {
    let state = { count: 0 }
    stores.register('counter', () => state)
    const all = stores.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('counter')
    expect(all[0].state).toEqual({ count: 0 })
  })

  it('reads a single store by name', () => {
    stores.register('app', () => ({ user: 'henri' }))
    const snap = stores.get('app')
    expect(snap).not.toBeNull()
    expect(snap!.state).toEqual({ user: 'henri' })
  })

  it('patches store state via setState function', () => {
    let state = { count: 0 }
    stores.register('counter', () => state, (patch) => {
      state = { ...state, ...(patch as Record<string, unknown>) }
    })
    stores.setState('counter', { count: 5 })
    expect(stores.get('counter')!.state).toEqual({ count: 5 })
  })

  it('throws when setting state on a store without setter', () => {
    stores.register('readonly', () => ({}))
    expect(() => stores.setState('readonly', {})).toThrow("Store 'readonly' has no setState registered")
  })

  it('dispatches action via dispatch function', () => {
    const dispatched: unknown[] = []
    stores.register('redux', () => ({}), undefined, (action) => dispatched.push(action))
    stores.dispatch('redux', { type: 'INCREMENT' })
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toEqual({ type: 'INCREMENT' })
  })
})
