import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NetworkCapture } from './network'

describe('NetworkCapture', () => {
  let capture: NetworkCapture

  beforeEach(() => {
    capture = new NetworkCapture()
  })

  it('registers and matches a mock by exact URL', () => {
    capture.addMock('/api/user', { id: 1 })
    expect(capture.getMock('/api/user')).toEqual({ id: 1 })
  })

  it('returns null for unmatched URL', () => {
    expect(capture.getMock('/api/other')).toBeNull()
  })

  it('logs a network event', () => {
    capture.logEvent({ url: '/api/data', method: 'GET', status: 200, duration: 42, timestamp: Date.now() })
    const events = capture.drain()
    expect(events).toHaveLength(1)
    expect(events[0].url).toBe('/api/data')
  })
})
