// packages/browser-runtime/src/network.ts
import type { NetworkEvent } from '@ai-runtime-harness/protocol'

interface MockEntry {
  pattern: string
  response: unknown
}

export class NetworkCapture {
  private events: NetworkEvent[] = []
  private mocks: MockEntry[] = []
  private originalFetch?: typeof window.fetch

  addMock(pattern: string, response: unknown) {
    this.mocks = this.mocks.filter(m => m.pattern !== pattern)
    this.mocks.push({ pattern, response })
  }

  getMock(url: string): { found: false } | { found: true; response: unknown } {
    const match = this.mocks.find(m => url.includes(m.pattern))
    return match !== undefined ? { found: true, response: match.response } : { found: false }
  }

  logEvent(event: NetworkEvent) {
    this.events.push(event)
    if (this.events.length > 500) this.events.shift()
  }

  drain(limit = 50): NetworkEvent[] {
    return this.events.splice(0, limit)
  }

  installFetchInterceptor() {
    if (this.originalFetch) return // already installed
    this.originalFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const mockResult = this.getMock(url)
      if (mockResult.found) {
        const mock = mockResult.response
        this.logEvent({ url, method: init?.method ?? 'GET', status: 200, duration: 0, responseBody: mock, timestamp: Date.now() })
        return new Response(JSON.stringify(mock), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      const start = Date.now()
      const res = await this.originalFetch!(input, init)
      this.logEvent({ url, method: init?.method ?? 'GET', status: res.status, duration: Date.now() - start, timestamp: Date.now() })
      return res
    }
  }

  uninstallFetchInterceptor() {
    if (this.originalFetch) window.fetch = this.originalFetch
    this.originalFetch = undefined
  }
}
