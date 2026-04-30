import { describe, it, expect } from 'vitest'
import type { HarnessRequest, HarnessResponse } from './messages'

describe('HarnessRequest', () => {
  it('accepts a GET_DOM request shape', () => {
    const req: HarnessRequest = { id: 'abc', type: 'GET_DOM', payload: { selector: 'button' } }
    expect(req.type).toBe('GET_DOM')
  })

  it('accepts a CLICK request shape', () => {
    const req: HarnessRequest = { id: 'xyz', type: 'CLICK', payload: { selector: '#submit' } }
    expect(req.type).toBe('CLICK')
  })
})

describe('HarnessResponse', () => {
  it('accepts an ok response', () => {
    const res: HarnessResponse = { id: 'abc', ok: true, result: { tag: 'div' } }
    expect(res.ok).toBe(true)
  })

  it('accepts an error response', () => {
    const res: HarnessResponse = { id: 'abc', ok: false, error: 'Element not found' }
    expect(res.ok).toBe(false)
  })
})
