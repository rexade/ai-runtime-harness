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

type FiberType = FiberTypeDescriptor | string | null | ((...args: unknown[]) => unknown)

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
  onCommitFiberRoot?: (rendererId: unknown, root: FiberRoot) => void
}

type WindowWithReactHook = Window & {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevtoolsHook
}

export class ReactReader {
  private fiberRoot: Fiber | null = null
  private installed = false

  install() {
    if (this.installed) return
    this.installed = true

    const win = window as WindowWithReactHook
    const hook = win.__REACT_DEVTOOLS_GLOBAL_HOOK__ ?? (win.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {})
    const original = hook.onCommitFiberRoot?.bind(hook)

    hook.onCommitFiberRoot = (rendererId: unknown, root: FiberRoot) => {
      this.fiberRoot = root.current
      original?.(rendererId, root)
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
      props: fiber.memoizedProps ?? {},
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
    if (!this.isFiberStateNode(state)) return state

    const values: unknown[] = []
    let current: FiberStateNode | null = state
    while (current) {
      values.push(current.memoizedState)
      current = current.next
    }

    if (values.length === 0) return null
    return values.length === 1 ? values[0] : values
  }

  private isFiberStateNode(state: Fiber['memoizedState']): state is FiberStateNode {
    return (
      state !== null &&
      'memoizedState' in state &&
      'next' in state
    )
  }
}
