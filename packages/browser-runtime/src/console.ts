// packages/browser-runtime/src/console.ts
import type { ConsoleEvent } from '@ai-runtime-harness/protocol'

type ConsoleFn = (...args: unknown[]) => void

export class ConsoleCapture {
  private events: ConsoleEvent[] = []
  private originals: Partial<Record<ConsoleEvent['level'], ConsoleFn>> = {}

  install() {
    const levels: ConsoleEvent['level'][] = ['log', 'warn', 'error', 'info']
    for (const level of levels) {
      this.originals[level] = console[level].bind(console)
      console[level] = (...args: unknown[]) => {
        this.events.push({ level, args, timestamp: Date.now() })
        this.originals[level]!(...args)
      }
    }
  }

  uninstall() {
    for (const [level, fn] of Object.entries(this.originals) as [ConsoleEvent['level'], ConsoleFn][]) {
      if (fn) console[level] = fn
    }
    this.originals = {}
  }

  drain(limit = 100): ConsoleEvent[] {
    const slice = this.events.splice(0, limit)
    return slice
  }
}
