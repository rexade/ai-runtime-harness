import type { StoreSnapshot } from '@ai-runtime-harness/protocol'

interface StoreEntry {
  getState: () => unknown
  setState?: (patch: unknown) => void
  dispatch?: (action: unknown) => void
}

export class StoresModule {
  private entries = new Map<string, StoreEntry>()

  register(
    name: string,
    getState: () => unknown,
    setState?: (patch: unknown) => void,
    dispatch?: (action: unknown) => void,
  ) {
    this.entries.delete(name)
    this.entries.set(name, { getState, setState, dispatch })
  }

  getAll(): StoreSnapshot[] {
    return Array.from(this.entries.entries(), ([name, entry]) => ({
      name,
      state: entry.getState(),
    }))
  }

  get(name: string): StoreSnapshot | null {
    const entry = this.entries.get(name)
    if (!entry) return null

    return {
      name,
      state: entry.getState(),
    }
  }

  setState(name: string, patch: unknown) {
    const entry = this.getEntry(name)
    if (!entry.setState) throw new Error(`Store '${name}' has no setState registered`)
    entry.setState(patch)
  }

  dispatch(name: string, action: unknown) {
    const entry = this.getEntry(name)
    if (!entry.dispatch) throw new Error(`Store '${name}' has no dispatch registered`)
    entry.dispatch(action)
  }

  private getEntry(name: string): StoreEntry {
    const entry = this.entries.get(name)
    if (!entry) throw new Error(`Store not found: ${name}`)
    return entry
  }
}
