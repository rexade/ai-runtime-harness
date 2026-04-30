import { describe, expect, it } from 'vitest'
import { aiHarness } from './index'

describe('aiHarness vite plugin', () => {
  it('returns a plugin with the correct name', () => {
    const plugin = aiHarness()
    expect(plugin.name).toBe('ai-runtime-harness')
  })

  it('only applies in serve mode', () => {
    const plugin = aiHarness()
    expect(plugin.apply).toBe('serve')
  })

  it('injects a script tag into HTML', () => {
    const plugin = aiHarness()
    const transformIndexHtml = plugin.transformIndexHtml as (() => Array<{ tag: string; attrs: Record<string, string> }>) | undefined
    const result = transformIndexHtml?.()
    expect(Array.isArray(result)).toBe(true)
    expect(result?.[0].tag).toBe('script')
    expect(result?.[0].attrs.src).toBe('/@ai-harness/runtime.js')
  })

  it('serves a runtime bootstrap module', () => {
    const plugin = aiHarness()
    const configureServer = plugin.configureServer as ((server: {
      middlewares: {
        use: (
          path: string,
          handler: (_req: unknown, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }) => void,
        ) => void
      }
    }) => void) | undefined
    const handlers: Record<string, (_req: unknown, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }) => void> = {}
    let contentType = ''
    let body = ''

    configureServer?.({
      middlewares: {
        use(path: string, handler: (_req: unknown, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }) => void) {
          handlers[path] = handler
        },
      },
    })

    handlers['/@ai-harness/runtime.js']?.({}, {
      setHeader(name, value) {
        if (name === 'Content-Type') contentType = value
      },
      end(value) {
        body = value
      },
    })

    expect(contentType).toBe('application/javascript')
    expect(body).toContain('/@fs/')
    expect(body).toContain('browser-runtime/src/index.ts')
  })
})
