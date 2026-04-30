import { describe, expect, it } from 'vitest'
import { BrowserDriver, resolveBrowserExecutable, sanitizeArtifactName } from './driver'

describe('browser driver helpers', () => {
  it('prefers BROWSER_PATH when it exists', () => {
    const resolved = resolveBrowserExecutable(
      { BROWSER_PATH: '/custom/browser' },
      (path) => path === '/custom/browser',
    )

    expect(resolved).toBe('/custom/browser')
  })

  it('sanitizes screenshot names for file output', () => {
    expect(sanitizeArtifactName('Before / After #1')).toBe('before-after-1')
  })

  it('reports an idle session before the browser is opened', () => {
    const driver = new BrowserDriver({ executablePath: '/custom/browser' })

    expect(driver.currentSession()).toEqual({
      sessionId: null,
      url: null,
      headless: null,
      open: false,
      attached: false,
    })
  })
})
