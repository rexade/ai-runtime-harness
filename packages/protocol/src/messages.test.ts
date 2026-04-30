import { describe, it, expect } from 'vitest'
import type { HarnessRequest, HarnessResponse } from './messages'

describe('HarnessRequest', () => {
  it('accepts a GET_DOM request shape', () => {
    const req: HarnessRequest = { id: 'abc', type: 'GET_DOM', payload: { selector: 'button' } }
    expect(req.type).toBe('GET_DOM')
  })

  it('accepts a GET_ACTIONS request shape', () => {
    const req: HarnessRequest = { id: 'def', type: 'GET_ACTIONS' }
    expect(req.type).toBe('GET_ACTIONS')
  })

  it('accepts a SET_SESSION_STATE request shape', () => {
    const req: HarnessRequest = {
      id: 'ghi',
      type: 'SET_SESSION_STATE',
      payload: { patch: { recording: true, mode: 'recording' } },
    }
    expect(req.type).toBe('SET_SESSION_STATE')
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
