import { beforeEach, describe, expect, it } from 'vitest'
import { ReactReader } from './react'

type ReactHookWindow = Window & {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
    onCommitFiberRoot?: (rendererId: unknown, root: { current: unknown }) => void
  }
}

function makeFiber(
  name: string | null,
  state: unknown,
  props: Record<string, unknown>,
  children: unknown[] = [],
): unknown {
  return {
    type: name === null ? null : { name },
    memoizedState: state === null ? null : { memoizedState: state, next: null },
    memoizedProps: props,
    child: children[0] ?? null,
    sibling: children[1] ?? null,
  }
}

describe('ReactReader', () => {
  beforeEach(() => {
    ;(window as ReactHookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__ = undefined
  })

  it('returns empty array when no fiber root registered', () => {
    const reader = new ReactReader()
    expect(reader.getTree()).toEqual([])
  })

  it('serializes a simple fiber with no children', () => {
    const reader = new ReactReader()
    const fiber = makeFiber('MyComponent', { count: 1 }, { label: 'hello' })
    const result = reader.serializeFiber(fiber as never)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('MyComponent')
    expect(result!.props).toEqual({ label: 'hello' })
  })

  it('skips host elements (lowercase tag names)', () => {
    const reader = new ReactReader()
    const fiber = makeFiber('div', null, {})
    expect(reader.serializeFiber(fiber as never)).toBeNull()
  })

  it('collects component descendants from host and root fibers', () => {
    const reader = new ReactReader()
    const app = makeFiber('App', { count: 1 }, { label: 'hello' })
    const host = makeFiber('div', null, {}, [app])

    reader.install()

    const hook = (window as ReactHookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__

    hook?.onCommitFiberRoot?.('renderer', { current: makeFiber(null, null, {}, [host]) })

    expect(reader.getTree()).toEqual([
      {
        name: 'App',
        props: { label: 'hello' },
        state: { count: 1 },
        children: [],
      },
    ])
  })
})
