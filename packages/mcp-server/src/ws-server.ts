import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import type { HarnessResponse } from '@ai-runtime-harness/protocol'
import { Bridge } from './bridge'

export function startWsServer(bridge: Bridge, port = 7777): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port })

    wss.once('error', reject)

    wss.once('listening', () => {
      console.error(`[AI Harness] WebSocket server listening on ws://localhost:${port}`)
      resolve(wss)
    })

    wss.on('connection', (ws: WebSocket) => {
      console.error('[AI Harness] Browser connected')
      bridge.setConnection(ws)

      ws.on('message', (data: RawData) => {
        const message = JSON.parse(data.toString()) as HarnessResponse
        bridge.resolve(message)
      })

      ws.on('close', () => {
        console.error('[AI Harness] Browser disconnected')
        bridge.clearConnection(ws)
      })
    })
  })
}
