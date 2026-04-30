export type HarnessActionKind = 'player' | 'debug' | 'system' | 'mutation'
export type HarnessActionSafety = 'normal' | 'debug-only' | 'dangerous'
export type HarnessExecutionPath = 'visible-ui' | 'game-input' | 'semantic-action' | 'state-mutation' | 'system'

export interface SuccessCheck {
  type: string
  path?: string
  selector?: string
  expected?: unknown
  text?: string
  description?: string
}

export interface SuccessContract {
  checks: SuccessCheck[]
}

export interface ActionMetadata {
  name: string
  kind: HarnessActionKind
  safety: HarnessActionSafety
  executionPath: HarnessExecutionPath
  description: string
  provesUserFlow?: boolean
  argsSchema?: unknown
  successContract?: SuccessContract
}

export type BrowserAction =
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'navigate'; url: string }
  | { type: 'scroll'; selector: string; amount: number }
  | { type: 'hover'; selector: string }
  | { type: 'mock_api'; pattern: string; response: unknown }
  | { type: 'call_action'; name: string; args?: unknown }
  | { type: 'set_store_state'; name: string; patch: unknown }
  | { type: 'dispatch_store_action'; name: string; action: unknown }
