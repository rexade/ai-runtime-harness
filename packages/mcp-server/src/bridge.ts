import { randomUUID } from 'crypto'
import type { HarnessRequest, HarnessResponse, RequestType } from '@ai-runtime-harness/protocol'

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export interface BrowserSocket {
  send: (data: string) => void
}

export class Bridge {
  private pending = new Map<string, Pending>()
  private connection: BrowserSocket | null = null

  setConnection(ws: BrowserSocket) {
    if (this.connection && this.connection !== ws) {
      this.rejectPending(new Error('Browser connection replaced'))
    }
    this.connection = ws
  }

  clearConnection(connection?: BrowserSocket, error = new Error('Browser disconnected')) {
    if (connection && this.connection !== connection) return
    this.connection = null
    this.rejectPending(error)
  }

  isConnected(): boolean {
    return this.connection !== null
  }

  async request(type: RequestType, payload?: unknown): Promise<unknown> {
    if (!this.connection) throw new Error('No browser connected')

    const id = randomUUID()
    const request: HarnessRequest = { id, type, payload }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`Request timeout: ${type}`))
      }, 10_000)

      this.pending.set(id, { resolve, reject, timeoutId })

      try {
        this.connection?.send(JSON.stringify(request))
      } catch (error) {
        clearTimeout(timeoutId)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  resolve(message: HarnessResponse) {
    const pending = this.pending.get(message.id)
    if (!pending) return

    this.pending.delete(message.id)
    clearTimeout(pending.timeoutId)

    if (message.ok) pending.resolve(message.result)
    else pending.reject(new Error(message.error ?? 'Unknown error'))
  }

  private rejectPending(error: Error) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
      this.pending.delete(id)
    }
  }
}
