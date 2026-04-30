// Read-only. We never write to React fiber internals.
import type { ComponentSnapshot } from '@ai-runtime-harness/protocol'

interface FiberStateNode {
  memoizedState: unknown
  next: FiberStateNode | null
}

interface FiberTypeDescriptor {
  displayName?: string
  name?: string
  render?: FiberTypeDescriptor
  type?: FiberTypeDescriptor
}

interface FiberComponent {
  (...args: unknown[]): unknown
  displayName?: string
  name?: string
}

type FiberType = FiberTypeDescriptor | string | null | FiberComponent

interface Fiber {
  type: FiberType
  memoizedState: FiberStateNode | Record<string, unknown> | null
  memoizedProps: Record<string, unknown> | null
  child: Fiber | null
  sibling: Fiber | null
}

interface FiberRoot {
  current: Fiber
}

interface ReactDevtoolsHook {
  renderers?: Map<number, unknown>
  supportsFiber?: boolean
  inject?: (renderer: unknown) => number
  onScheduleFiberRoot?: (...args: unknown[]) => void
  onCommitFiberRoot?: (rendererId: unknown, root: FiberRoot, ...args: unknown[]) => void
  onCommitFiberUnmount?: (...args: unknown[]) => void
}

type WindowWithReactHook = Window & {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevtoolsHook
}

function ensureReactDevtoolsHook(win: WindowWithReactHook): ReactDevtoolsHook {
  const hook = win.__REACT_DEVTOOLS_GLOBAL_HOOK__ ?? (win.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {})

  hook.renderers ??= new Map()
  hook.supportsFiber ??= true
  hook.onScheduleFiberRoot ??= () => {}
  hook.onCommitFiberUnmount ??= () => {}

  if (!hook.inject) {
    let nextRendererId = hook.renderers.size + 1

    hook.inject = (renderer: unknown) => {
      const id = nextRendererId
      nextRendererId += 1
      hook.renderers?.set(id, renderer)
      return id
    }
  }

  return hook
}

export class ReactReader {
  private fiberRoot: Fiber | null = null
  private installed = false

  install() {
    if (this.installed) return
    this.installed = true

    const win = window as WindowWithReactHook
    const hook = ensureReactDevtoolsHook(win)
    const original = hook.onCommitFiberRoot?.bind(hook)

    hook.onCommitFiberRoot = (rendererId: unknown, root: FiberRoot, ...args: unknown[]) => {
      this.fiberRoot = root.current
      original?.(rendererId, root, ...args)
    }
  }

  getTree(): ComponentSnapshot[] {
    return this.collectComponents(this.fiberRoot)
  }

  serializeFiber(fiber: Fiber): ComponentSnapshot | null {
    const componentName = this.getComponentName(fiber.type)
    if (!componentName || this.isHostName(componentName)) return null

    return {
      name: componentName,
      props: this.serializeProps(fiber.memoizedProps),
      state: this.readState(fiber.memoizedState),
      children: this.collectComponents(fiber.child),
    }
  }

  private collectComponents(fiber: Fiber | null): ComponentSnapshot[] {
    const results: ComponentSnapshot[] = []
    let current = fiber

    while (current) {
      const serialized = this.serializeFiber(current)
      if (serialized) results.push(serialized)
      else if (current.child) results.push(...this.collectComponents(current.child))
      current = current.sibling
    }

    return results
  }

  private getComponentName(type: FiberType): string | null {
    if (!type) return null
    if (typeof type === 'string') return type

    if (typeof type === 'function') {
      return type.displayName ?? type.name ?? null
    }

    return (
      type.displayName ??
      type.name ??
      type.render?.displayName ??
      type.render?.name ??
      type.type?.displayName ??
      type.type?.name ??
      null
    )
  }

  private isHostName(name: string): boolean {
    const first = name[0]
    return first !== undefined && first === first.toLowerCase()
  }

  private readState(state: Fiber['memoizedState']): unknown {
    if (state === null) return null
    if (!this.isFiberStateNode(state)) return this.serializeValue(state)

    const values: unknown[] = []
    const visited = new Set<FiberStateNode>()
    let current: FiberStateNode | null = state
    while (current && !visited.has(current)) {
      visited.add(current)
      values.push(this.serializeValue(current.memoizedState))
      current = current.next
    }

    if (values.length === 0) return null
    return values.length === 1 ? values[0] : values
  }

  private serializeProps(value: Fiber['memoizedProps']): Record<string, unknown> {
    const serialized = this.serializeValue(value ?? {})
    return this.isRecord(serialized) ? serialized : {}
  }

  private serializeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) return value

    const valueType = typeof value
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value
    if (valueType === 'bigint' || valueType === 'symbol') return String(value)
    if (valueType === 'function') return `[Function ${(value as Function).name || 'anonymous'}]`

    if (value instanceof Date) return value.toISOString()
    if (value instanceof RegExp) return value.toString()
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return `<${value.tagName.toLowerCase()}${value.id ? `#${value.id}` : ''}>`
    }

    if (Array.isArray(value)) {
      if (depth >= 4) return `[Array(${value.length})]`
      return value.map((item) => this.serializeValue(item, depth + 1, seen))
    }

    if (valueType === 'object') {
      const record = value as Record<string, unknown>
      if (seen.has(record)) return '[Circular]'
      if (depth >= 4) return '[Object]'

      seen.add(record)

      const serialized: Record<string, unknown> = {}
      for (const [key, nested] of Object.entries(record)) {
        serialized[key] = this.serializeValue(nested, depth + 1, seen)
      }

      seen.delete(record)
      return serialized
    }

    return String(value)
  }

  private isFiberStateNode(state: Fiber['memoizedState']): state is FiberStateNode {
    return (
      state !== null &&
      'memoizedState' in state &&
      'next' in state
    )
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }
}
