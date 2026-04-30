import { describe, expect, it } from 'vitest'
import { armAttachUrl, parseCliArgs, resolveDefaultSurface } from './index'

describe('parseCliArgs', () => {
  it('parses attach options and defaults', () => {
    const parsed = parseCliArgs(['attach', 'http://localhost:4173', '--surface', 'game', '--headless', '--json', '--screenshot', '--timeout', '9000'])

    expect(parsed).toEqual({
      command: 'attach',
      url: 'http://localhost:4173',
      surfaceId: 'game',
      headless: true,
      json: true,
      screenshot: true,
      timeoutMs: 9000,
    })
  })

  it('shows help when no command is provided', () => {
    expect(parseCliArgs([])).toEqual({ command: 'help' })
  })
})

describe('armAttachUrl', () => {
  it('adds the harness and surface query params', () => {
    const armed = armAttachUrl('http://localhost:4173/app?mode=demo', 'network')
    const url = new URL(armed)

    expect(url.searchParams.get('ai-harness')).toBe('1')
    expect(url.searchParams.get('surface')).toBe('network')
    expect(url.searchParams.get('mode')).toBe('demo')
  })
})

describe('resolveDefaultSurface', () => {
  it('prefers the requested surface', () => {
    expect(resolveDefaultSurface([
      { surfaceId: 'dashboard', current: false },
      { surfaceId: 'game', current: true },
    ], 'network')).toBe('network')
  })

  it('falls back to the current surface', () => {
    expect(resolveDefaultSurface([
      { surfaceId: 'dashboard', current: false },
      { surfaceId: 'game', current: true },
    ])).toBe('game')
  })

  it('returns null when multiple surfaces exist without a current selection', () => {
    expect(resolveDefaultSurface([
      { surfaceId: 'dashboard', current: false },
      { surfaceId: 'game', current: false },
    ])).toBeNull()
  })
})
