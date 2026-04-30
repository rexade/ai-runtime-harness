import type { RuntimeError } from '@ai-runtime-harness/protocol'
import { DomModule } from './dom'
import { ConsoleCapture } from './console'
import { NetworkCapture } from './network'
import { ReactReader } from './react'
import { StoresModule } from './stores'
import { CommandDispatcher, connectToServer } from './ws-client'

type HarnessAction = (args: unknown) => unknown | Promise<unknown>

interface HarnessState {
  stores: StoresModule
  actions: Record<string, HarnessAction>
  errors: RuntimeError[]
  initialized: boolean
}

type HarnessWindow = Window & {
  __AI_HARNESS__?: HarnessState
}

function getHarnessWindow(): HarnessWindow {
  return window as HarnessWindow
}

function ensureHarnessState(): HarnessState {
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

function recordError(error: RuntimeError) {
  const state = ensureHarnessState()
  state.errors.push(error)
  if (state.errors.length > 100) state.errors.shift()
}

function initializeHarnessRuntime() {
  const state = ensureHarnessState()
  if (state.initialized) return
  state.initialized = true

  const dom = new DomModule()
  const consoleCapture = new ConsoleCapture()
  const networkCapture = new NetworkCapture()
  const reactReader = new ReactReader()

  window.addEventListener('error', (event) => {
    recordError({
      message: event.message,
      source: event.filename,
      line: event.lineno,
      col: event.colno,
      timestamp: Date.now(),
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
    recordError({
      message: reason,
      timestamp: Date.now(),
    })
  })

  consoleCapture.install()
  networkCapture.installFetchInterceptor()
  reactReader.install()

  const dispatcher = new CommandDispatcher({
    dom,
    console: consoleCapture,
    network: networkCapture,
    react: reactReader,
    stores: state.stores,
  })

  connectToServer(dispatcher)
  console.log('[AI Harness] connected to ws://localhost:7777')
}

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

if (typeof window !== 'undefined') {
  initializeHarnessRuntime()
}
