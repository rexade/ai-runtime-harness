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
