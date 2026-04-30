import type { Plugin } from 'vite'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export interface AiHarnessOptions {
  unsafeEval?: boolean
  networkCapture?: boolean
  consoleCapture?: boolean
}

export function aiHarness(_options: AiHarnessOptions = {}): Plugin {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const runtimeEntry = resolve(currentDir, '../../browser-runtime/src/index.ts').replace(/\\/g, '/')

  return {
    name: 'ai-runtime-harness',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/@ai-harness/runtime.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript')
        res.end(`import '/@fs/${runtimeEntry}'\n`)
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
