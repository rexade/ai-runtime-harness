import type { BrowserDriver } from '@ai-runtime-harness/browser-driver'
import type { RecordingHooks, RecordingSemanticSnapshot } from '@ai-runtime-harness/recorder'
import type { StoreSnapshot } from '@ai-runtime-harness/protocol'
import { Bridge } from './bridge'
import { BridgeRuntimeClient } from './runtime-client'

function normalizeStores(value: StoreSnapshot | StoreSnapshot[] | null) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

async function captureSemanticSnapshot(
  bridge: Bridge,
  runtime: BridgeRuntimeClient,
  browser: BrowserDriver,
): Promise<RecordingSemanticSnapshot | undefined> {
  if (!bridge.isConnected()) return undefined

  try {
    const [session, actions, stores, url] = await Promise.all([
      runtime.getSessionState(),
      runtime.getActions(),
      runtime.getStore(),
      browser.currentUrl(),
    ])

    return {
      session,
      actions,
      stores: normalizeStores(stores),
      url,
    }
  } catch {
    return undefined
  }
}

export function createRecordingHooks(
  bridge: Bridge,
  runtime: BridgeRuntimeClient,
  browser: BrowserDriver,
): RecordingHooks {
  return {
    async captureBefore(context) {
      if (context.tool.startsWith('recording.')) return {}
      return {
        semanticBefore: await captureSemanticSnapshot(bridge, runtime, browser),
      }
    },
    async captureAfter(context) {
      const semanticAfter = await captureSemanticSnapshot(bridge, runtime, browser)

      if (!bridge.isConnected()) {
        return {
          semanticAfter,
          screenshotPath: extractScreenshotPath(context.result),
        }
      }

      try {
        const [consoleEvents, networkEvents, errors] = await Promise.all([
          runtime.getConsole(),
          runtime.getNetwork(),
          runtime.getErrors(),
        ])

        return {
          semanticAfter,
          deltas: {
            console: consoleEvents,
            network: networkEvents,
            errors,
          },
          screenshotPath: extractScreenshotPath(context.result),
        }
      } catch {
        return {
          semanticAfter,
          screenshotPath: extractScreenshotPath(context.result),
        }
      }
    },
  }
}

function extractScreenshotPath(result: unknown) {
  if (result && typeof result === 'object' && 'path' in result && typeof result.path === 'string') {
    return result.path
  }

  return undefined
}
