import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConsoleCapture } from './console'

describe('ConsoleCapture', () => {
  let capture: ConsoleCapture

  beforeEach(() => {
    capture = new ConsoleCapture()
  })

  afterEach(() => {
    capture.uninstall()
  })

  it('captures log calls', () => {
    capture.install()
    console.log('hello', 42)
    const events = capture.drain()
    expect(events).toHaveLength(1)
    expect(events[0].level).toBe('log')
    expect(events[0].args).toEqual(['hello', 42])
  })

  it('drain clears the buffer', () => {
    capture.install()
    console.warn('test')
    capture.drain()
    expect(capture.drain()).toHaveLength(0)
  })
})
