import type { Plugin } from 'vite'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export interface AiHarnessOptions {
  autoConnect?: boolean
  unsafeEval?: boolean
  networkCapture?: boolean
  consoleCapture?: boolean
  url?: string
}

export function aiHarness(options: AiHarnessOptions = {}): Plugin {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const runtimeEntry = resolve(currentDir, '../../browser-runtime/src/runtime-entry.ts').replace(/\\/g, '/')
  const runtimeConfig = JSON.stringify({
    autoConnect: options.autoConnect,
    url: options.url,
  }).replace(/</g, '\\u003c')

  return {
    name: 'ai-runtime-harness',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/@ai-harness/runtime.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript')
        res.end(
          `window.__AI_HARNESS_CONFIG__ = Object.assign(window.__AI_HARNESS_CONFIG__ ?? {}, ${runtimeConfig})\n` +
          `import '/@fs/${runtimeEntry}'\n`,
        )
      })
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/@ai-harness/runtime.js' },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
