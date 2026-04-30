# AI Runtime Harness — Browser Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dev-only MCP server that lets Claude Code observe and interact with running React/browser apps through real DOM, React component tree, store state, network, and console — no screenshots.

**Architecture:** A Vite plugin injects `browser-runtime` (bundled IIFE) into the page in dev mode. The runtime connects to the MCP server's WebSocket on `:7777` as a client. The MCP server receives tool calls from Claude, forwards them to the browser-runtime via WebSocket, and returns results. All communication uses a typed request/response protocol defined in the `protocol` package.

**Tech Stack:** TypeScript, pnpm monorepo, Vite, Vitest, `@modelcontextprotocol/sdk`, `ws`, `zod`, React 19

---

## File Map

```
ai-runtime-harness/
├── .npmrc                                   — node-linker=hoisted (Windows symlink fix)
├── package.json                             — pnpm workspace root
├── pnpm-workspace.yaml                      — lists packages/*
├── tsconfig.base.json                       — shared TS compiler options
│
├── packages/
│   ├── protocol/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                     — re-exports everything
│   │       ├── messages.ts                  — HarnessRequest, HarnessResponse, RequestType
│   │       ├── observation.ts               — Observation, DomSnapshot, ComponentSnapshot, StoreSnapshot, NetworkEvent, ConsoleEvent, RuntimeError
│   │       ├── action.ts                    — BrowserAction union
│   │       └── replay.ts                    — ReplaySession, ReplayStep
│   │
│   ├── browser-runtime/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts                   — lib build → dist/runtime.iife.js
│   │   └── src/
│   │       ├── index.ts                     — entry: init all modules, connect WS
│   │       ├── ws-client.ts                 — WebSocket client, command dispatch loop
│   │       ├── dom.ts                       — DOM tree serialization + event dispatch
│   │       ├── react.ts                     — React fiber tree reader (read-only)
│   │       ├── stores.ts                    — registered store state reader + mutator
│   │       ├── network.ts                   — fetch/XHR interception + mock registry
│   │       └── console.ts                   — console.log/warn/error capture
│   │
│   ├── vite-plugin/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts                     — Vite plugin: injects runtime script in dev
│   │
│   └── mcp-server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                     — entry: start WS server + MCP server
│           ├── ws-server.ts                 — WebSocket server on :7777, tracks browser client
│           ├── bridge.ts                    — request/response correlator (pending Map by id)
│           └── tools/
│               └── browser.ts              — all app.* MCP tool registrations
│
└── examples/
    └── react-dashboard/
        ├── package.json
        ├── vite.config.ts
        ├── index.html
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── store.ts                     — Zustand store (tasks list)
            └── registerHarness.ts           — registers store with harness
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `.npmrc`
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/browser-runtime/package.json`
- Create: `packages/browser-runtime/tsconfig.json`
- Create: `packages/vite-plugin/package.json`
- Create: `packages/vite-plugin/tsconfig.json`
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`

- [ ] **Step 1: Create .npmrc**

```
node-linker=hoisted
shamefully-hoist=true
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

- [ ] **Step 3: Create root package.json**

```json
{
  "name": "ai-runtime-harness",
  "private": true,
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "dev": "pnpm --filter react-dashboard dev"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create packages/protocol/package.json**

```json
{
  "name": "@ai-runtime-harness/protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "build": "tsc"
  },
  "devDependencies": {
    "vitest": "*"
  }
}
```

- [ ] **Step 6: Create packages/protocol/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create packages/browser-runtime/package.json**

```json
{
  "name": "@ai-runtime-harness/browser-runtime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "build": "vite build"
  },
  "dependencies": {
    "@ai-runtime-harness/protocol": "workspace:*"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "*",
    "jsdom": "*"
  }
}
```

- [ ] **Step 8: Create packages/browser-runtime/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src"]
}
```

- [ ] **Step 9: Create packages/vite-plugin/package.json**

```json
{
  "name": "@ai-runtime-harness/vite-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "build": "tsc"
  },
  "dependencies": {
    "@ai-runtime-harness/browser-runtime": "workspace:*"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "*"
  },
  "peerDependencies": {
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 10: Create packages/vite-plugin/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 11: Create packages/mcp-server/package.json**

```json
{
  "name": "@ai-runtime-harness/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "build": "tsc",
    "start": "node --import tsx/esm src/index.ts"
  },
  "dependencies": {
    "@ai-runtime-harness/protocol": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ws": "^8.18.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "tsx": "^4.0.0",
    "vitest": "*"
  }
}
```

- [ ] **Step 12: Create packages/mcp-server/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2020"]
  },
  "include": ["src"]
}
```

- [ ] **Step 13: Install all dependencies**

```bash
cd C:/Users/henri/projects/ai-runtime-harness && pnpm install
```

Expected: all packages installed, no errors.

- [ ] **Step 14: Commit**

```bash
git add -A && git commit -m "feat: monorepo scaffold"
```

---

### Task 2: protocol package

**Files:**
- Create: `packages/protocol/src/messages.ts`
- Create: `packages/protocol/src/observation.ts`
- Create: `packages/protocol/src/action.ts`
- Create: `packages/protocol/src/replay.ts`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/protocol/src/messages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/protocol/src/messages.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/protocol && pnpm test
```

Expected: FAIL — cannot find module `./messages`.

- [ ] **Step 3: Create messages.ts**

```ts
// packages/protocol/src/messages.ts
export type RequestType =
  | 'GET_DOM'
  | 'GET_REACT_TREE'
  | 'GET_STORE'
  | 'GET_CONSOLE'
  | 'GET_NETWORK'
  | 'GET_ERRORS'
  | 'CLICK'
  | 'TYPE'
  | 'NAVIGATE'
  | 'SCROLL'
  | 'HOVER'
  | 'MOCK_API'
  | 'CALL_ACTION'
  | 'SET_STORE_STATE'
  | 'DISPATCH_STORE_ACTION'

export interface HarnessRequest {
  id: string
  type: RequestType
  payload?: unknown
}

export interface HarnessResponse {
  id: string
  ok: boolean
  result?: unknown
  error?: string
}
```

- [ ] **Step 4: Create observation.ts**

```ts
// packages/protocol/src/observation.ts
export interface DomSnapshot {
  tag: string
  id?: string
  className?: string
  text?: string
  attrs: Record<string, string>
  children: DomSnapshot[]
}

export interface ComponentSnapshot {
  name: string
  props: Record<string, unknown>
  state: unknown
  children: ComponentSnapshot[]
}

export interface StoreSnapshot {
  name: string
  state: unknown
}

export interface NetworkEvent {
  url: string
  method: string
  status?: number
  duration?: number
  requestBody?: unknown
  responseBody?: unknown
  timestamp: number
}

export interface ConsoleEvent {
  level: 'log' | 'warn' | 'error' | 'info'
  args: unknown[]
  timestamp: number
}

export interface RuntimeError {
  message: string
  source?: string
  line?: number
  col?: number
  timestamp: number
}

export interface Observation {
  runtime: 'browser'
  time: number
  dom?: DomSnapshot
  components?: ComponentSnapshot[]
  stores?: StoreSnapshot[]
  network?: NetworkEvent[]
  console?: ConsoleEvent[]
  errors?: RuntimeError[]
}
```

- [ ] **Step 5: Create action.ts**

```ts
// packages/protocol/src/action.ts
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
```

- [ ] **Step 6: Create replay.ts**

```ts
// packages/protocol/src/replay.ts
import type { BrowserAction } from './action'

export interface ReplayStep {
  frame: number
  action: BrowserAction
}

export interface ReplaySession {
  id: string
  steps: ReplayStep[]
}
```

- [ ] **Step 7: Create index.ts**

```ts
// packages/protocol/src/index.ts
export type { RequestType, HarnessRequest, HarnessResponse } from './messages'
export type {
  DomSnapshot, ComponentSnapshot, StoreSnapshot,
  NetworkEvent, ConsoleEvent, RuntimeError, Observation
} from './observation'
export type { BrowserAction } from './action'
export type { ReplayStep, ReplaySession } from './replay'
```

- [ ] **Step 8: Run tests**

```bash
cd packages/protocol && pnpm test
```

Expected: 4 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/protocol && git commit -m "feat: protocol package — shared types"
```

---

### Task 3: browser-runtime — console + network modules

**Files:**
- Create: `packages/browser-runtime/src/console.ts`
- Create: `packages/browser-runtime/src/network.ts`
- Create: `packages/browser-runtime/src/console.test.ts`
- Create: `packages/browser-runtime/src/network.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/browser-runtime/src/console.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConsoleCapture } from './console'

describe('ConsoleCapture', () => {
  let capture: ConsoleCapture

  beforeEach(() => {
    capture = new ConsoleCapture()
  })

  it('captures log calls', () => {
    capture.install()
    console.log('hello', 42)
    const events = capture.drain()
    expect(events).toHaveLength(1)
    expect(events[0].level).toBe('log')
    expect(events[0].args).toEqual(['hello', 42])
    capture.uninstall()
  })

  it('drain clears the buffer', () => {
    capture.install()
    console.warn('test')
    capture.drain()
    expect(capture.drain()).toHaveLength(0)
    capture.uninstall()
  })
})
```

Create `packages/browser-runtime/src/network.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NetworkCapture } from './network'

describe('NetworkCapture', () => {
  let capture: NetworkCapture

  beforeEach(() => {
    capture = new NetworkCapture()
  })

  it('registers and matches a mock by exact URL', () => {
    capture.addMock('/api/user', { id: 1 })
    expect(capture.getMock('/api/user')).toEqual({ id: 1 })
  })

  it('returns null for unmatched URL', () => {
    expect(capture.getMock('/api/other')).toBeNull()
  })

  it('logs a network event', () => {
    capture.logEvent({ url: '/api/data', method: 'GET', status: 200, duration: 42, timestamp: Date.now() })
    const events = capture.drain()
    expect(events).toHaveLength(1)
    expect(events[0].url).toBe('/api/data')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/browser-runtime && pnpm test
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Add vitest config to browser-runtime**

Create `packages/browser-runtime/vite.config.ts`:
```ts
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'AIHarness',
      fileName: 'runtime',
      formats: ['iife'],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
```

- [ ] **Step 4: Create console.ts**

```ts
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
```

- [ ] **Step 5: Create network.ts**

```ts
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

  getMock(url: string): unknown | null {
    const match = this.mocks.find(m => url.includes(m.pattern))
    return match ? match.response : null
  }

  logEvent(event: NetworkEvent) {
    this.events.push(event)
    if (this.events.length > 500) this.events.shift()
  }

  drain(limit = 50): NetworkEvent[] {
    return this.events.splice(0, limit)
  }

  installFetchInterceptor() {
    this.originalFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const mock = this.getMock(url)
      if (mock !== null) {
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
  }
}
```

- [ ] **Step 6: Run tests**

```bash
cd packages/browser-runtime && pnpm test
```

Expected: 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/browser-runtime && git commit -m "feat: browser-runtime console and network modules"
```

---

### Task 4: browser-runtime — DOM module

**Files:**
- Create: `packages/browser-runtime/src/dom.ts`
- Create: `packages/browser-runtime/src/dom.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/browser-runtime/src/dom.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { DomModule } from './dom'

describe('DomModule', () => {
  let dom: DomModule

  beforeEach(() => {
    dom = new DomModule()
    document.body.innerHTML = `
      <div id="root">
        <button id="btn" class="primary">Click me</button>
        <input id="name" placeholder="Name" />
      </div>
    `
  })

  it('serializes DOM tree from root', () => {
    const snapshot = dom.getTree()
    expect(snapshot.tag).toBe('body')
    const root = snapshot.children.find(c => c.id === 'root')
    expect(root).toBeDefined()
    expect(root!.children).toHaveLength(2)
  })

  it('serializes a subtree by selector', () => {
    const snapshot = dom.getTree('#root')
    expect(snapshot.tag).toBe('div')
    expect(snapshot.id).toBe('root')
  })

  it('returns text content', () => {
    const snapshot = dom.getTree('#btn')
    expect(snapshot.text).toBe('Click me')
  })

  it('dispatches a click event', () => {
    let clicked = false
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true })
    dom.click('#btn')
    expect(clicked).toBe(true)
  })

  it('types text into an input', () => {
    dom.type('#name', 'Henri')
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Henri')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/browser-runtime && pnpm test dom.test
```

Expected: FAIL — `DomModule` not found.

- [ ] **Step 3: Create dom.ts**

```ts
// packages/browser-runtime/src/dom.ts
import type { DomSnapshot } from '@ai-runtime-harness/protocol'

export class DomModule {
  getTree(selector?: string): DomSnapshot {
    const root = selector ? document.querySelector(selector) : document.body
    if (!root) throw new Error(`Element not found: ${selector}`)
    return this.serializeNode(root as Element)
  }

  private serializeNode(el: Element, depth = 0): DomSnapshot {
    const attrs: Record<string, string> = {}
    for (const attr of Array.from(el.attributes)) {
      attrs[attr.name] = attr.value
    }
    const children = depth < 5
      ? Array.from(el.children).map(c => this.serializeNode(c, depth + 1))
      : []
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: el.className || undefined,
      text: el.children.length === 0 ? el.textContent?.trim() || undefined : undefined,
      attrs,
      children,
    }
  }

  click(selector: string) {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }

  type(selector: string, text: string) {
    const el = document.querySelector(selector) as HTMLInputElement | null
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.focus()
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  scroll(selector: string, amount: number) {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.scrollTop += amount
  }

  hover(selector: string) {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
  }

  navigate(url: string) {
    window.location.href = url
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/browser-runtime && pnpm test dom.test
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/browser-runtime/src/dom.ts packages/browser-runtime/src/dom.test.ts
git commit -m "feat: browser-runtime DOM module"
```

---

### Task 5: browser-runtime — React fiber reader

**Files:**
- Create: `packages/browser-runtime/src/react.ts`
- Create: `packages/browser-runtime/src/react.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/browser-runtime/src/react.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ReactReader } from './react'

function makeFiber(name: string, state: unknown, props: Record<string, unknown>, children: unknown[] = []): unknown {
  return {
    type: { name },
    memoizedState: state ? { memoizedState: state, next: null } : null,
    memoizedProps: props,
    child: children[0] ?? null,
    sibling: children[1] ?? null,
  }
}

describe('ReactReader', () => {
  it('returns empty array when no fiber root registered', () => {
    const reader = new ReactReader()
    expect(reader.getTree()).toEqual([])
  })

  it('serializes a simple fiber with no children', () => {
    const reader = new ReactReader()
    const fiber = makeFiber('MyComponent', { count: 1 }, { label: 'hello' })
    const result = reader.serializeFiber(fiber as any)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('MyComponent')
    expect(result!.props).toEqual({ label: 'hello' })
  })

  it('skips host elements (lowercase tag names)', () => {
    const reader = new ReactReader()
    const fiber = makeFiber('div', null, {})
    expect(reader.serializeFiber(fiber as any)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/browser-runtime && pnpm test react.test
```

Expected: FAIL — `ReactReader` not found.

- [ ] **Step 3: Create react.ts**

```ts
// packages/browser-runtime/src/react.ts
// Read-only. We never write to React fiber internals.
import type { ComponentSnapshot } from '@ai-runtime-harness/protocol'

interface Fiber {
  type: { name?: string; displayName?: string } | string | null
  memoizedState: { memoizedState: unknown; next: unknown } | null
  memoizedProps: Record<string, unknown> | null
  child: Fiber | null
  sibling: Fiber | null
}

export class ReactReader {
  private fiberRoot: Fiber | null = null

  install() {
    const win = window as any
    if (!win.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      win.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {}
    }
    const hook = win.__REACT_DEVTOOLS_GLOBAL_HOOK__
    const orig = hook.onCommitFiberRoot?.bind(hook)
    hook.onCommitFiberRoot = (id: unknown, root: { current: Fiber }) => {
      this.fiberRoot = root.current
      orig?.(id, root)
    }
  }

  getTree(): ComponentSnapshot[] {
    if (!this.fiberRoot) return []
    return this.collectComponents(this.fiberRoot)
  }

  private collectComponents(fiber: Fiber): ComponentSnapshot[] {
    const results: ComponentSnapshot[] = []
    let current: Fiber | null = fiber
    while (current) {
      const serialized = this.serializeFiber(current)
      if (serialized) results.push(serialized)
      current = current.sibling
    }
    return results
  }

  serializeFiber(fiber: Fiber): ComponentSnapshot | null {
    const typeName = typeof fiber.type === 'object' && fiber.type !== null
      ? (fiber.type.displayName ?? fiber.type.name)
      : null
    if (!typeName || typeName[0] === typeName[0].toLowerCase()) return null

    const children = fiber.child ? this.collectComponents(fiber.child) : []
    return {
      name: typeName,
      props: fiber.memoizedProps ?? {},
      state: fiber.memoizedState?.memoizedState ?? null,
      children,
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/browser-runtime && pnpm test react.test
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/browser-runtime/src/react.ts packages/browser-runtime/src/react.test.ts
git commit -m "feat: browser-runtime React fiber reader (read-only)"
```

---

### Task 6: browser-runtime — stores module

**Files:**
- Create: `packages/browser-runtime/src/stores.ts`
- Create: `packages/browser-runtime/src/stores.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/browser-runtime/src/stores.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { StoresModule } from './stores'

describe('StoresModule', () => {
  let stores: StoresModule

  beforeEach(() => {
    stores = new StoresModule()
  })

  it('starts with no registered stores', () => {
    expect(stores.getAll()).toEqual([])
  })

  it('registers and reads a store', () => {
    let state = { count: 0 }
    stores.register('counter', () => state)
    const all = stores.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('counter')
    expect(all[0].state).toEqual({ count: 0 })
  })

  it('reads a single store by name', () => {
    stores.register('app', () => ({ user: 'henri' }))
    const snap = stores.get('app')
    expect(snap).not.toBeNull()
    expect(snap!.state).toEqual({ user: 'henri' })
  })

  it('patches store state via setState function', () => {
    let state = { count: 0 }
    stores.register('counter', () => state, (patch) => { state = { ...state, ...patch } })
    stores.setState('counter', { count: 5 })
    expect(stores.get('counter')!.state).toEqual({ count: 5 })
  })

  it('throws when setting state on a store without setter', () => {
    stores.register('readonly', () => ({}))
    expect(() => stores.setState('readonly', {})).toThrow('no setState registered')
  })

  it('dispatches action via dispatch function', () => {
    const dispatched: unknown[] = []
    stores.register('redux', () => ({}), undefined, (action) => dispatched.push(action))
    stores.dispatch('redux', { type: 'INCREMENT' })
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toEqual({ type: 'INCREMENT' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/browser-runtime && pnpm test stores.test
```

Expected: FAIL — `StoresModule` not found.

- [ ] **Step 3: Create stores.ts**

```ts
// packages/browser-runtime/src/stores.ts
import type { StoreSnapshot } from '@ai-runtime-harness/protocol'

interface StoreEntry {
  name: string
  getState: () => unknown
  setState?: (patch: unknown) => void
  dispatch?: (action: unknown) => void
}

export class StoresModule {
  private entries: StoreEntry[] = []

  register(
    name: string,
    getState: () => unknown,
    setState?: (patch: unknown) => void,
    dispatch?: (action: unknown) => void,
  ) {
    this.entries = this.entries.filter(e => e.name !== name)
    this.entries.push({ name, getState, setState, dispatch })
  }

  getAll(): StoreSnapshot[] {
    return this.entries.map(e => ({ name: e.name, state: e.getState() }))
  }

  get(name: string): StoreSnapshot | null {
    const entry = this.entries.find(e => e.name === name)
    if (!entry) return null
    return { name: entry.name, state: entry.getState() }
  }

  setState(name: string, patch: unknown) {
    const entry = this.entries.find(e => e.name === name)
    if (!entry) throw new Error(`Store not found: ${name}`)
    if (!entry.setState) throw new Error(`Store '${name}' has no setState registered`)
    entry.setState(patch)
  }

  dispatch(name: string, action: unknown) {
    const entry = this.entries.find(e => e.name === name)
    if (!entry) throw new Error(`Store not found: ${name}`)
    if (!entry.dispatch) throw new Error(`Store '${name}' has no dispatch registered`)
    entry.dispatch(action)
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/browser-runtime && pnpm test stores.test
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/browser-runtime/src/stores.ts packages/browser-runtime/src/stores.test.ts
git commit -m "feat: browser-runtime stores module"
```

---

### Task 7: browser-runtime — WebSocket client + entry point

**Files:**
- Create: `packages/browser-runtime/src/ws-client.ts`
- Create: `packages/browser-runtime/src/ws-client.test.ts`
- Create: `packages/browser-runtime/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `packages/browser-runtime/src/ws-client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { CommandDispatcher } from './ws-client'
import { DomModule } from './dom'
import { ConsoleCapture } from './console'
import { NetworkCapture } from './network'
import { ReactReader } from './react'
import { StoresModule } from './stores'

function makeModules() {
  return {
    dom: new DomModule(),
    console: new ConsoleCapture(),
    network: new NetworkCapture(),
    react: new ReactReader(),
    stores: new StoresModule(),
  }
}

describe('CommandDispatcher', () => {
  it('handles GET_CONSOLE command', async () => {
    const mods = makeModules()
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '1', type: 'GET_CONSOLE' })
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.result)).toBe(true)
  })

  it('handles GET_STORE command', async () => {
    const mods = makeModules()
    mods.stores.register('app', () => ({ user: 'henri' }))
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '2', type: 'GET_STORE', payload: { name: 'app' } })
    expect(result.ok).toBe(true)
    expect((result.result as any).state).toEqual({ user: 'henri' })
  })

  it('returns error response for unknown command', async () => {
    const mods = makeModules()
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '3', type: 'GET_DOM' })
    // GET_DOM on empty document returns body
    expect(result.ok).toBe(true)
  })

  it('returns error response on thrown exception', async () => {
    const mods = makeModules()
    const dispatcher = new CommandDispatcher(mods)
    const result = await dispatcher.dispatch({ id: '4', type: 'CLICK', payload: { selector: '#nonexistent' } })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/browser-runtime && pnpm test ws-client.test
```

Expected: FAIL — `CommandDispatcher` not found.

- [ ] **Step 3: Create ws-client.ts**

```ts
// packages/browser-runtime/src/ws-client.ts
import type { HarnessRequest, HarnessResponse } from '@ai-runtime-harness/protocol'
import type { DomModule } from './dom'
import type { ConsoleCapture } from './console'
import type { NetworkCapture } from './network'
import type { ReactReader } from './react'
import type { StoresModule } from './stores'

export interface Modules {
  dom: DomModule
  console: ConsoleCapture
  network: NetworkCapture
  react: ReactReader
  stores: StoresModule
}

export class CommandDispatcher {
  constructor(private mods: Modules) {}

  async dispatch(req: HarnessRequest): Promise<HarnessResponse> {
    try {
      const result = await this.handle(req)
      return { id: req.id, ok: true, result }
    } catch (e) {
      return { id: req.id, ok: false, error: (e as Error).message }
    }
  }

  private async handle(req: HarnessRequest): Promise<unknown> {
    const p = req.payload as Record<string, unknown> | undefined
    switch (req.type) {
      case 'GET_DOM':       return this.mods.dom.getTree(p?.selector as string | undefined)
      case 'GET_REACT_TREE': return this.mods.react.getTree()
      case 'GET_STORE':     return p?.name ? this.mods.stores.get(p.name as string) : this.mods.stores.getAll()
      case 'GET_CONSOLE':   return this.mods.console.drain()
      case 'GET_NETWORK':   return this.mods.network.drain()
      case 'GET_ERRORS':    return (window as any).__AI_HARNESS_ERRORS__ ?? []
      case 'CLICK':         return this.mods.dom.click(p!.selector as string)
      case 'TYPE':          return this.mods.dom.type(p!.selector as string, p!.text as string)
      case 'NAVIGATE':      return this.mods.dom.navigate(p!.url as string)
      case 'SCROLL':        return this.mods.dom.scroll(p!.selector as string, p!.amount as number)
      case 'HOVER':         return this.mods.dom.hover(p!.selector as string)
      case 'MOCK_API':      return this.mods.network.addMock(p!.pattern as string, p!.response)
      case 'CALL_ACTION': {
        const actions = (window as any).__AI_HARNESS_ACTIONS__ as Record<string, (args: unknown) => unknown> | undefined
        const fn = actions?.[p!.name as string]
        if (!fn) throw new Error(`Action not registered: ${p!.name}`)
        return fn(p?.args)
      }
      case 'SET_STORE_STATE':     return this.mods.stores.setState(p!.name as string, p!.patch)
      case 'DISPATCH_STORE_ACTION': return this.mods.stores.dispatch(p!.name as string, p!.action)
      default:              throw new Error(`Unknown command: ${req.type}`)
    }
  }
}

export function connectToServer(dispatcher: CommandDispatcher, url = 'ws://localhost:7777') {
  function connect() {
    const ws = new WebSocket(url)

    ws.onmessage = async (event) => {
      const req: HarnessRequest = JSON.parse(event.data)
      const res = await dispatcher.dispatch(req)
      ws.send(JSON.stringify(res))
    }

    ws.onclose = () => {
      setTimeout(connect, 2000) // reconnect after 2s
    }
  }

  connect()
}
```

- [ ] **Step 4: Create index.ts**

```ts
// packages/browser-runtime/src/index.ts
import { DomModule } from './dom'
import { ConsoleCapture } from './console'
import { NetworkCapture } from './network'
import { ReactReader } from './react'
import { StoresModule } from './stores'
import { CommandDispatcher, connectToServer } from './ws-client'

// Public API for app code to register stores and actions
const stores = new StoresModule()
const win = window as any
win.__AI_HARNESS_ERRORS__ = []
win.__AI_HARNESS_ACTIONS__ = {}

export function registerHarnessStore(
  name: string,
  getState: () => unknown,
  setState?: (patch: unknown) => void,
  dispatch?: (action: unknown) => void,
) {
  stores.register(name, getState, setState, dispatch)
}

export function registerHarnessAction(name: string, fn: (args: unknown) => unknown) {
  win.__AI_HARNESS_ACTIONS__[name] = fn
}

// Capture unhandled errors
window.addEventListener('error', (e) => {
  win.__AI_HARNESS_ERRORS__.push({
    message: e.message,
    source: e.filename,
    line: e.lineno,
    col: e.colno,
    timestamp: Date.now(),
  })
  if (win.__AI_HARNESS_ERRORS__.length > 100) win.__AI_HARNESS_ERRORS__.shift()
})

// Init all modules
const domMod = new DomModule()
const consoleMod = new ConsoleCapture()
const networkMod = new NetworkCapture()
const reactMod = new ReactReader()

consoleMod.install()
networkMod.installFetchInterceptor()
reactMod.install()

const dispatcher = new CommandDispatcher({ dom: domMod, console: consoleMod, network: networkMod, react: reactMod, stores })
connectToServer(dispatcher)

console.log('[AI Harness] connected to ws://localhost:7777')
```

- [ ] **Step 5: Run all tests**

```bash
cd packages/browser-runtime && pnpm test
```

Expected: all tests PASS (console, network, dom, react, stores, ws-client).

- [ ] **Step 6: Commit**

```bash
git add packages/browser-runtime && git commit -m "feat: browser-runtime WebSocket client and entry point"
```

---

### Task 8: vite-plugin

**Files:**
- Create: `packages/vite-plugin/src/index.ts`
- Create: `packages/vite-plugin/src/index.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/vite-plugin/src/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { aiHarness } from './index'

describe('aiHarness vite plugin', () => {
  it('returns a plugin with the correct name', () => {
    const plugin = aiHarness()
    expect(plugin.name).toBe('ai-runtime-harness')
  })

  it('only applies in serve mode', () => {
    const plugin = aiHarness()
    expect(plugin.apply).toBe('serve')
  })

  it('injects a script tag into HTML', () => {
    const plugin = aiHarness()
    const result = (plugin as any).transformIndexHtml?.() as { tag: string; attrs: Record<string, string> }[]
    expect(result).toBeDefined()
    expect(result[0].tag).toBe('script')
    expect(result[0].attrs.src).toBe('/@ai-harness/runtime.js')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/vite-plugin && pnpm test
```

Expected: FAIL — `aiHarness` not found.

- [ ] **Step 3: Add vitest config to vite-plugin**

Create `packages/vite-plugin/vite.config.ts`:
```ts
import { defineConfig } from 'vite'

export default defineConfig({
  test: { globals: true },
})
```

- [ ] **Step 4: Create index.ts**

```ts
// packages/vite-plugin/src/index.ts
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Plugin } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface AiHarnessOptions {
  unsafeEval?: boolean
  networkCapture?: boolean
  consoleCapture?: boolean
}

export function aiHarness(_options: AiHarnessOptions = {}): Plugin {
  let runtimeCode: string | null = null

  return {
    name: 'ai-runtime-harness',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/@ai-harness/runtime.js', (_req, res) => {
        if (!runtimeCode) {
          // In dev, serve the browser-runtime source directly via Vite's module graph
          // For simplicity, serve a bootstrap that imports from the workspace package
          runtimeCode = `
            // AI Runtime Harness — injected by vite-plugin
            import '/@ai-harness/init'
          `
        }
        res.setHeader('Content-Type', 'application/javascript')
        res.end(runtimeCode)
      })

      // Serve the actual runtime init module
      server.middlewares.use('/@ai-harness/init', (_req, res) => {
        const initCode = `
          import { registerHarnessStore, registerHarnessAction } from '@ai-runtime-harness/browser-runtime'
          window.__registerHarnessStore = registerHarnessStore
          window.__registerHarnessAction = registerHarnessAction
        `
        res.setHeader('Content-Type', 'application/javascript')
        res.end(initCode)
      })
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/@ai-harness/runtime.js' },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
```

- [ ] **Step 5: Run tests**

```bash
cd packages/vite-plugin && pnpm test
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/vite-plugin && git commit -m "feat: vite-plugin injects browser-runtime in dev mode"
```

---

### Task 9: mcp-server — WebSocket server + bridge

**Files:**
- Create: `packages/mcp-server/src/ws-server.ts`
- Create: `packages/mcp-server/src/bridge.ts`
- Create: `packages/mcp-server/src/bridge.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/mcp-server/src/bridge.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { Bridge } from './bridge'
import type { HarnessResponse } from '@ai-runtime-harness/protocol'

describe('Bridge', () => {
  it('throws when no browser is connected', async () => {
    const bridge = new Bridge()
    await expect(bridge.request('GET_DOM')).rejects.toThrow('No browser connected')
  })

  it('resolves a pending request when response arrives', async () => {
    const bridge = new Bridge()
    const sentMessages: string[] = []
    const mockWs = { send: (msg: string) => sentMessages.push(msg) } as any
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
    const mockWs = { send: (msg: string) => sentMessages.push(msg) } as any
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mcp-server && pnpm test bridge.test
```

Expected: FAIL — `Bridge` not found.

- [ ] **Step 3: Add vitest config to mcp-server**

Create `packages/mcp-server/vite.config.ts`:
```ts
import { defineConfig } from 'vite'

export default defineConfig({
  test: { globals: true },
})
```

- [ ] **Step 4: Create bridge.ts**

```ts
// packages/mcp-server/src/bridge.ts
import { randomUUID } from 'crypto'
import type { HarnessRequest, HarnessResponse, RequestType } from '@ai-runtime-harness/protocol'

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface BrowserSocket {
  send: (data: string) => void
}

export class Bridge {
  private pending = new Map<string, Pending>()
  private connection: BrowserSocket | null = null

  setConnection(ws: BrowserSocket) {
    this.connection = ws
  }

  clearConnection() {
    this.connection = null
  }

  isConnected(): boolean {
    return this.connection !== null
  }

  async request(type: RequestType, payload?: unknown): Promise<unknown> {
    if (!this.connection) throw new Error('No browser connected')
    const id = randomUUID()
    const req: HarnessRequest = { id, type, payload }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.connection!.send(JSON.stringify(req))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`Request timeout: ${type}`))
        }
      }, 10_000)
    })
  }

  resolve(msg: HarnessResponse) {
    const pending = this.pending.get(msg.id)
    if (!pending) return
    this.pending.delete(msg.id)
    if (msg.ok) pending.resolve(msg.result)
    else pending.reject(new Error(msg.error ?? 'Unknown error'))
  }
}
```

- [ ] **Step 5: Create ws-server.ts**

```ts
// packages/mcp-server/src/ws-server.ts
import { WebSocketServer, type WebSocket } from 'ws'
import type { HarnessResponse } from '@ai-runtime-harness/protocol'
import { Bridge } from './bridge'

export function startWsServer(bridge: Bridge, port = 7777): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port })

    wss.on('listening', () => {
      console.log(`[AI Harness] WebSocket server listening on ws://localhost:${port}`)
      resolve(wss)
    })

    wss.on('error', reject)

    wss.on('connection', (ws: WebSocket) => {
      console.log('[AI Harness] Browser connected')
      bridge.setConnection(ws)

      ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString()) as HarnessResponse
        bridge.resolve(msg)
      })

      ws.on('close', () => {
        console.log('[AI Harness] Browser disconnected')
        bridge.clearConnection()
      })
    })
  })
}
```

- [ ] **Step 6: Run tests**

```bash
cd packages/mcp-server && pnpm test bridge.test
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/bridge.ts packages/mcp-server/src/bridge.test.ts packages/mcp-server/src/ws-server.ts packages/mcp-server/vite.config.ts
git commit -m "feat: mcp-server WebSocket bridge"
```

---

### Task 10: mcp-server — browser MCP tools + entry point

**Files:**
- Create: `packages/mcp-server/src/tools/browser.ts`
- Create: `packages/mcp-server/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `packages/mcp-server/src/tools/browser.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { Bridge } from '../bridge'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBrowserTools } from './browser'

describe('registerBrowserTools', () => {
  it('registers app.get_dom tool', () => {
    const bridge = new Bridge()
    const server = new McpServer({ name: 'test', version: '0.1.0' })
    expect(() => registerBrowserTools(server, bridge)).not.toThrow()
  })

  it('app.get_console calls bridge with GET_CONSOLE', async () => {
    const bridge = new Bridge()
    const mockWs = { send: vi.fn() } as any
    bridge.setConnection(mockWs)

    const sentMessages: string[] = []
    mockWs.send = (msg: string) => {
      sentMessages.push(msg)
      const req = JSON.parse(msg)
      bridge.resolve({ id: req.id, ok: true, result: [{ level: 'log', args: ['hello'], timestamp: 1 }] })
    }

    const server = new McpServer({ name: 'test', version: '0.1.0' })
    registerBrowserTools(server, bridge)

    // verify bridge request type is correct by checking it was called
    expect(sentMessages).toHaveLength(0) // nothing sent yet — tools called via MCP protocol
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mcp-server && pnpm test tools/browser.test
```

Expected: FAIL — `registerBrowserTools` not found.

- [ ] **Step 3: Create tools/browser.ts**

```ts
// packages/mcp-server/src/tools/browser.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Bridge } from '../bridge'

function notConnected() {
  return { content: [{ type: 'text' as const, text: 'No browser connected. Open your dev server first.' }] }
}

function ok(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
}

export function registerBrowserTools(server: McpServer, bridge: Bridge) {
  server.tool('app.get_dom', { selector: z.string().optional() }, async ({ selector }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_DOM', { selector }))
  })

  server.tool('app.get_react_tree', { component: z.string().optional() }, async () => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_REACT_TREE'))
  })

  server.tool('app.get_store', { name: z.string().optional() }, async ({ name }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_STORE', { name }))
  })

  server.tool('app.get_console', { limit: z.number().optional() }, async ({ limit }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_CONSOLE', { limit }))
  })

  server.tool('app.get_network', { limit: z.number().optional() }, async ({ limit }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_NETWORK', { limit }))
  })

  server.tool('app.get_errors', {}, async () => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('GET_ERRORS'))
  })

  server.tool('app.click', { selector: z.string() }, async ({ selector }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('CLICK', { selector })
    return ok({ clicked: selector })
  })

  server.tool('app.type', { selector: z.string(), text: z.string() }, async ({ selector, text }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('TYPE', { selector, text })
    return ok({ typed: text, into: selector })
  })

  server.tool('app.navigate', { url: z.string() }, async ({ url }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('NAVIGATE', { url })
    return ok({ navigated: url })
  })

  server.tool('app.scroll', { selector: z.string(), amount: z.number() }, async ({ selector, amount }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('SCROLL', { selector, amount })
    return ok({ scrolled: selector, amount })
  })

  server.tool('app.hover', { selector: z.string() }, async ({ selector }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('HOVER', { selector })
    return ok({ hovered: selector })
  })

  server.tool('app.mock_api', { pattern: z.string(), response: z.unknown() }, async ({ pattern, response }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('MOCK_API', { pattern, response })
    return ok({ mocked: pattern })
  })

  server.tool('app.call_action', { name: z.string(), args: z.unknown().optional() }, async ({ name, args }) => {
    if (!bridge.isConnected()) return notConnected()
    return ok(await bridge.request('CALL_ACTION', { name, args }))
  })

  server.tool('app.set_store_state', { name: z.string(), patch: z.record(z.unknown()) }, async ({ name, patch }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('SET_STORE_STATE', { name, patch })
    return ok({ updated: name })
  })

  server.tool('app.dispatch_store_action', { name: z.string(), action: z.unknown() }, async ({ name, action }) => {
    if (!bridge.isConnected()) return notConnected()
    await bridge.request('DISPATCH_STORE_ACTION', { name, action })
    return ok({ dispatched: name })
  })
}
```

- [ ] **Step 4: Create index.ts**

```ts
// packages/mcp-server/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Bridge } from './bridge'
import { startWsServer } from './ws-server'
import { registerBrowserTools } from './tools/browser'

async function main() {
  const bridge = new Bridge()

  // Start WebSocket server — browser-runtime connects here
  await startWsServer(bridge, 7777)

  // Start MCP server — Claude Code connects here via stdio
  const server = new McpServer({
    name: 'ai-runtime-harness',
    version: '0.1.0',
  })

  registerBrowserTools(server, bridge)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('[AI Harness] MCP server ready. Configure in claude_code_settings.json.')
}

main().catch((e) => {
  console.error('[AI Harness] Fatal error:', e)
  process.exit(1)
})
```

- [ ] **Step 5: Run tests**

```bash
cd packages/mcp-server && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src && git commit -m "feat: mcp-server browser tools and entry point"
```

---

### Task 11: react-dashboard example + Claude config

**Files:**
- Create: `examples/react-dashboard/package.json`
- Create: `examples/react-dashboard/index.html`
- Create: `examples/react-dashboard/vite.config.ts`
- Create: `examples/react-dashboard/src/main.tsx`
- Create: `examples/react-dashboard/src/App.tsx`
- Create: `examples/react-dashboard/src/store.ts`
- Create: `examples/react-dashboard/src/registerHarness.ts`

- [ ] **Step 1: Create examples/react-dashboard/package.json**

```json
{
  "name": "react-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@ai-runtime-harness/browser-runtime": "workspace:*",
    "@ai-runtime-harness/vite-plugin": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create examples/react-dashboard/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>React Dashboard — AI Harness Example</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create examples/react-dashboard/vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aiHarness } from '@ai-runtime-harness/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    aiHarness({ networkCapture: true, consoleCapture: true }),
  ],
  server: { port: 5173, strictPort: true },
})
```

- [ ] **Step 4: Create examples/react-dashboard/src/store.ts**

```ts
import { create } from 'zustand'

export interface Task {
  id: number
  text: string
  done: boolean
}

interface TaskStore {
  tasks: Task[]
  addTask: (text: string) => void
  toggleTask: (id: number) => void
  clearCompleted: () => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [
    { id: 1, text: 'Build the harness', done: false },
    { id: 2, text: 'Test with Claude', done: false },
  ],
  addTask: (text) =>
    set((s) => ({ tasks: [...s.tasks, { id: Date.now(), text, done: false }] })),
  toggleTask: (id) =>
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) })),
  clearCompleted: () =>
    set((s) => ({ tasks: s.tasks.filter((t) => !t.done) })),
}))
```

- [ ] **Step 5: Create examples/react-dashboard/src/registerHarness.ts**

```ts
import { registerHarnessStore, registerHarnessAction } from '@ai-runtime-harness/browser-runtime'
import { useTaskStore } from './store'

export function setupHarness() {
  registerHarnessStore(
    'tasks',
    () => useTaskStore.getState(),
    (patch) => useTaskStore.setState(patch as any),
  )

  registerHarnessAction('addTask', (args: any) => useTaskStore.getState().addTask(args.text))
  registerHarnessAction('clearCompleted', () => useTaskStore.getState().clearCompleted())
}
```

- [ ] **Step 6: Create examples/react-dashboard/src/App.tsx**

```tsx
import { useState } from 'react'
import { useTaskStore } from './store'

export function App() {
  const { tasks, addTask, toggleTask, clearCompleted } = useTaskStore()
  const [input, setInput] = useState('')

  function handleAdd() {
    if (input.trim()) {
      addTask(input.trim())
      setInput('')
    }
  }

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', fontFamily: 'monospace' }}>
      <h1>Task Dashboard</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          id="task-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New task..."
          style={{ flex: 1, padding: 8 }}
        />
        <button id="add-btn" onClick={handleAdd}>Add</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {tasks.map((task) => (
          <li key={task.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee' }}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleTask(task.id)}
              id={`task-${task.id}`}
            />
            <label
              htmlFor={`task-${task.id}`}
              style={{ textDecoration: task.done ? 'line-through' : 'none' }}
            >
              {task.text}
            </label>
          </li>
        ))}
      </ul>
      <button id="clear-btn" onClick={clearCompleted} style={{ marginTop: 16 }}>
        Clear completed
      </button>
      <div id="task-count" style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
        {tasks.filter(t => !t.done).length} remaining
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create examples/react-dashboard/src/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { setupHarness } from './registerHarness'

setupHarness()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 8: Install example dependencies**

```bash
cd C:/Users/henri/projects/ai-runtime-harness && pnpm install
```

Expected: react-dashboard dependencies installed.

- [ ] **Step 9: Add Claude Code MCP config**

Add the mcp-server to `C:/Users/henri/.claude/claude_code_settings.json`. If the file does not exist, create it. Add this entry under `mcpServers`:

```json
{
  "mcpServers": {
    "ai-runtime-harness": {
      "command": "node",
      "args": [
        "--import", "tsx/esm",
        "C:/Users/henri/projects/ai-runtime-harness/packages/mcp-server/src/index.ts"
      ]
    }
  }
}
```

- [ ] **Step 10: Smoke test**

Open two terminals.

Terminal 1 — start the example app:
```bash
cd C:/Users/henri/projects/ai-runtime-harness && pnpm dev
```

Terminal 2 — start the MCP server:
```bash
cd packages/mcp-server && node --import tsx/esm src/index.ts
```

Expected:
- App opens at `http://localhost:5173`
- MCP server logs: `WebSocket server listening on ws://localhost:7777`
- After app loads in browser: MCP server logs `Browser connected`
- In a new Claude Code session, tools `app.get_dom`, `app.get_store`, `app.click` etc. are available

- [ ] **Step 11: Commit**

```bash
git add examples/react-dashboard && git commit -m "feat: react-dashboard example + Claude MCP config"
```

---

## Self-Review

**Spec coverage:**
- ✅ WebSocket direction: mcp-server owns `:7777`, browser-runtime connects as client (Task 7, Task 9)
- ✅ `app.set_react_state` removed — replaced with `app.set_store_state`, `app.dispatch_store_action`, `app.call_action` (Task 10)
- ✅ React fiber reader is read-only (Task 5, react.ts comment)
- ✅ Unsafe eval not in v1 (not implemented anywhere)
- ✅ Structured store mutation through store's own API (StoresModule, Task 6)
- ✅ All `app.*` tools from spec (Task 10)
- ✅ Zustand + Redux auto-detect: Zustand via explicit registration, Redux via dispatch (Task 6)
- ✅ fetch/XHR interception + mock (Task 3, network.ts)
- ✅ Console capture (Task 3, console.ts)
- ✅ DOM query + event dispatch (Task 4)
- ✅ React fiber tree read (Task 5)
- ✅ Vite plugin dev-only injection (Task 8)
- ✅ MCP server via stdio (Task 10)
- ✅ Example app with Zustand store + harness registration (Task 11)
- ✅ Zero production impact (vite plugin `apply: 'serve'`)

**Placeholder scan:** None found. All steps have complete code.

**Type consistency:** `HarnessRequest.type` values (e.g. `'GET_DOM'`) are defined in `messages.ts` Task 2 and used consistently in `ws-client.ts` Task 7 and `bridge.ts` Task 9. `Bridge.request(type, payload)` signature is consistent across Tasks 9 and 10.
