import type { HarnessAction, HarnessRuntimeConfig } from './harness-state'
import { ensureHarnessState, updateHarnessConfig } from './harness-state'
import { initializeHarnessRuntime } from './runtime'

export function registerHarnessStore(
  name: string,
  getState: () => unknown,
  setState?: (patch: unknown) => void,
  dispatch?: (action: unknown) => void,
) {
  ensureHarnessState().stores.register(name, getState, setState, dispatch)
}

export function registerHarnessAction(name: string, fn: HarnessAction) {
  ensureHarnessState().actions[name] = fn
}

export function enableHarnessConnection(config: HarnessRuntimeConfig = {}) {
  updateHarnessConfig({ ...config, autoConnect: true })
  initializeHarnessRuntime().connect?.()
}
