import { beforeEach, describe, expect, it } from 'vitest'
import { ReactReader } from './react'

type ReactHookWindow = Window & {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
    renderers?: Map<number, unknown>
    supportsFiber?: boolean
    inject?: (renderer: unknown) => number
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

  it('creates a devtools-compatible hook scaffold', () => {
    const reader = new ReactReader()

    reader.install()

    const hook = (window as ReactHookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__

    expect(hook?.supportsFiber).toBe(true)
    expect(hook?.renderers).toBeInstanceOf(Map)

    const rendererId = hook?.inject?.({ version: 'test' })

    expect(rendererId).toBe(1)
    expect(hook?.renderers?.get(1)).toEqual({ version: 'test' })
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

  it('serializes circular values into JSON-safe snapshots', () => {
    const reader = new ReactReader()
    const props: Record<string, unknown> = { label: 'hello' }
    props.self = props

    const stateValue: Record<string, unknown> = { count: 1 }
    stateValue.self = stateValue

    const fiber = makeFiber('MyComponent', stateValue, props)
    const result = reader.serializeFiber(fiber as never)

    expect(result).not.toBeNull()
    expect(result!.props).toEqual({ label: 'hello', self: '[Circular]' })
    expect(result!.state).toEqual({ count: 1, self: '[Circular]' })
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it('stops traversing cyclic hook lists', () => {
    const reader = new ReactReader()
    const first = { memoizedState: 'one', next: null as unknown }
    const second = { memoizedState: 'two', next: first }
    first.next = second

    const fiber = {
      type: { name: 'MyComponent' },
      memoizedState: first,
      memoizedProps: {},
      child: null,
      sibling: null,
    }

    expect(reader.serializeFiber(fiber as never)?.state).toEqual(['one', 'two'])
  })
})
