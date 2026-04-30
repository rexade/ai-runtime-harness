import { DomModule } from './dom'
import { ConsoleCapture } from './console'
import { NetworkCapture } from './network'
import { ReactReader } from './react'
import { CommandDispatcher, connectToServer } from './ws-client'
import {
  ensureHarnessState,
  getHarnessConfig,
  recordHarnessError,
  updateHarnessSessionState,
} from './harness-state'

export function initializeHarnessRuntime() {
  const state = ensureHarnessState()
  if (state.initialized) return state
  state.initialized = true
  updateHarnessSessionState({ connection: 'registered' })

  const dom = new DomModule()
  const consoleCapture = new ConsoleCapture()
  const networkCapture = new NetworkCapture()
  const reactReader = new ReactReader()

  window.addEventListener('error', (event) => {
    recordHarnessError({
      message: event.message,
      source: event.filename,
      line: event.lineno,
      col: event.colno,
      timestamp: Date.now(),
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
    recordHarnessError({
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
  })

  let connectionStarted = false

  state.connect = () => {
    if (connectionStarted) return
    connectionStarted = true

    const config = getHarnessConfig()
    const url = config.url ?? 'ws://localhost:7777'
    connectToServer(dispatcher, {
      url,
      onClose: () => {
        updateHarnessSessionState({ connection: 'closed' })
        config.onClose?.()
      },
      onConnecting: () => {
        updateHarnessSessionState({ connection: 'connecting' })
        config.onConnecting?.()
      },
      onError: (error) => {
        updateHarnessSessionState({ connection: 'error' })
        config.onError?.(error)
      },
      onOpen: () => {
        updateHarnessSessionState({ connection: 'connected' })
        config.onOpen?.()
        console.log(`[AI Harness] connected to ${url}`)
      },
    })
  }

  return state
}
