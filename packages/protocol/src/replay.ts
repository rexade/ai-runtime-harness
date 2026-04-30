import type { BrowserAction } from './action'

export interface ReplayStep {
  frame: number
  action: BrowserAction
}

export interface ReplaySession {
  id: string
  steps: ReplayStep[]
}
