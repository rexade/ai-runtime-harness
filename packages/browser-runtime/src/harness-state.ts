import type { RuntimeError } from '@ai-runtime-harness/protocol'
import { StoresModule } from './stores'

export type HarnessAction = (args: unknown) => unknown | Promise<unknown>

export interface HarnessRuntimeConfig {
  autoConnect?: boolean
  url?: string
}

export interface HarnessState {
  stores: StoresModule
  actions: Record<string, HarnessAction>
  errors: RuntimeError[]
  initialized: boolean
  connect?: () => void
}

export type HarnessWindow = Window & {
  __AI_HARNESS__?: HarnessState
  __AI_HARNESS_CONFIG__?: HarnessRuntimeConfig
}

export function getHarnessWindow(): HarnessWindow {
  return window as HarnessWindow
}

export function ensureHarnessState(): HarnessState {
  const win = getHarnessWindow()

  if (!win.__AI_HARNESS__) {
    win.__AI_HARNESS__ = {
      stores: new StoresModule(),
      actions: {},
      errors: [],
      initialized: false,
    }
  }

  return win.__AI_HARNESS__
}

export function recordHarnessError(error: RuntimeError) {
  const state = ensureHarnessState()
  state.errors.push(error)
  if (state.errors.length > 100) state.errors.shift()
}

export function getHarnessConfig(): HarnessRuntimeConfig {
  const win = getHarnessWindow()
  return win.__AI_HARNESS_CONFIG__ ?? (win.__AI_HARNESS_CONFIG__ = {})
}

export function updateHarnessConfig(config: HarnessRuntimeConfig) {
  Object.assign(getHarnessConfig(), config)
}

export function shouldAutoConnect() {
  const searchParam = new URL(window.location.href).searchParams.get('ai-harness')

  if (searchParam !== null) {
    const normalized = searchParam.trim().toLowerCase()
    return normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
  }

  return getHarnessConfig().autoConnect === true
}
