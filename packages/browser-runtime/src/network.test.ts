import { describe, it, expect, beforeEach } from 'vitest'
import { NetworkCapture } from './network'

describe('NetworkCapture', () => {
  let capture: NetworkCapture

  beforeEach(() => {
    capture = new NetworkCapture()
  })

  it('registers and matches a mock by URL substring', () => {
    capture.addMock('/api/user', { id: 1 })
    const result = capture.getMock('/api/user')
    expect(result.found).toBe(true)
    if (result.found) expect(result.response).toEqual({ id: 1 })
  })

  it('returns not-found for unmatched URL', () => {
    const result = capture.getMock('/api/other')
    expect(result.found).toBe(false)
  })

  it('logs a network event', () => {
    capture.logEvent({ url: '/api/data', method: 'GET', status: 200, duration: 42, timestamp: Date.now() })
    const events = capture.drain()
    expect(events).toHaveLength(1)
    expect(events[0].url).toBe('/api/data')
  })
})
