import { describe, expect, it } from 'vitest'
import type { HarnessResponse } from '@ai-runtime-harness/protocol'
import { Bridge } from './bridge'

describe('Bridge', () => {
  it('throws when no browser is connected', async () => {
    const bridge = new Bridge()
    await expect(bridge.request('GET_DOM')).rejects.toThrow('No browser connected')
  })

  it('resolves a pending request when response arrives', async () => {
    const bridge = new Bridge()
    const sentMessages: string[] = []
    const mockWs = { send: (message: string) => sentMessages.push(message) }
    bridge.setConnection(mockWs)

    const promise = bridge.request('GET_CONSOLE')

    const sent = JSON.parse(sentMessages[0])
    expect(sent.type).toBe('GET_CONSOLE')

    const response: HarnessResponse = { id: sent.id, ok: true, result: [] }
    bridge.resolve(response)

    const result = await promise
    expect(result).toEqual([])
  })

  it('rejects when response has ok=false', async () => {
    const bridge = new Bridge()
    const sentMessages: string[] = []
    const mockWs = { send: (message: string) => sentMessages.push(message) }
    bridge.setConnection(mockWs)

    const promise = bridge.request('CLICK', { selector: '#missing' })
    const sent = JSON.parse(sentMessages[0])

    bridge.resolve({ id: sent.id, ok: false, error: 'Element not found: #missing' })
    await expect(promise).rejects.toThrow('Element not found: #missing')
  })

  it('ignores resolve calls for unknown ids', () => {
    const bridge = new Bridge()
    expect(() => bridge.resolve({ id: 'unknown', ok: true, result: null })).not.toThrow()
  })
})
