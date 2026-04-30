import { beforeEach, describe, expect, it } from 'vitest'
import { ensureHarnessState, getHarnessConfig, shouldAutoConnect, updateHarnessConfig } from './harness-state'

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

  it('creates a shared harness state with a stores registry', () => {
    const state = ensureHarnessState()

    expect(state.stores).toBeDefined()
    expect(state.actions).toEqual({})
    expect(state.errors).toEqual([])
    expect(state.initialized).toBe(false)
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
})
