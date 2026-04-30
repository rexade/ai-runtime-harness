import { DomModule } from './dom'
import { ConsoleCapture } from './console'
import { NetworkCapture } from './network'
import { ReactReader } from './react'
import { CommandDispatcher, connectToServer } from './ws-client'
import { ensureHarnessState, getHarnessConfig, recordHarnessError } from './harness-state'

export function initializeHarnessRuntime() {
  const state = ensureHarnessState()
  if (state.initialized) return state
  state.initialized = true

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
    stores: state.stores,
  })

  let connectionStarted = false

  state.connect = () => {
    if (connectionStarted) return
    connectionStarted = true

    const url = getHarnessConfig().url ?? 'ws://localhost:7777'
    connectToServer(dispatcher, {
      url,
      onOpen: () => {
        console.log(`[AI Harness] connected to ${url}`)
      },
    })
  }

  return state
}
