import { create } from 'zustand'

export interface Task {
  id: number
  text: string
  done: boolean
}

export type SyncStatus = 'idle' | 'loading' | 'ready' | 'error'

interface TaskStore {
  tasks: Task[]
  errorMessage: string | null
  lastSyncSource: 'seed' | 'api'
  syncStatus: SyncStatus
  addTask: (text: string) => void
  clearCompleted: () => void
  markAllDone: () => void
  resetDemo: () => void
  syncTasks: () => Promise<void>
  toggleTask: (id: number) => void
}

const seedTasks: Task[] = [
  { id: 1, text: 'Build the harness', done: false },
  { id: 2, text: 'Test with Claude', done: false },
]

function createSeedState() {
  return {
    tasks: seedTasks.map((task) => ({ ...task })),
    syncStatus: 'idle' as const,
    lastSyncSource: 'seed' as const,
    errorMessage: null,
  }
}

function readTasksPayload(payload: unknown): Task[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { tasks?: unknown }).tasks)) {
    throw new Error('Response missing tasks array')
  }

  return (payload as { tasks: unknown[] }).tasks.map((task, index) => {
    const candidate = task as Partial<Task> | null

    return {
      id: typeof candidate?.id === 'number' ? candidate.id : Date.now() + index,
      text: typeof candidate?.text === 'string' ? candidate.text : `Task ${index + 1}`,
      done: candidate?.done === true,
    }
  })
}

export const useTaskStore = create<TaskStore>((set) => ({
  ...createSeedState(),
  addTask: (text) => set((state) => ({
    errorMessage: null,
    tasks: [...state.tasks, { id: Date.now(), text, done: false }],
  })),
  clearCompleted: () => set((state) => ({
    tasks: state.tasks.filter((task) => !task.done),
  })),
  markAllDone: () => set((state) => ({
    tasks: state.tasks.map((task) => ({ ...task, done: true })),
  })),
  resetDemo: () => set(createSeedState()),
  syncTasks: async () => {
    set({
      errorMessage: null,
      syncStatus: 'loading',
    })

    try {
      const response = await fetch('/api/tasks')
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`)

      const payload = await response.json()
      const tasks = readTasksPayload(payload)

      set({
        tasks,
        syncStatus: 'ready',
        lastSyncSource: 'api',
        errorMessage: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      set({
        errorMessage: message,
        lastSyncSource: 'api',
        syncStatus: 'error',
      })

      throw error
    }
  },
  toggleTask: (id) => set((state) => ({
    errorMessage: null,
    tasks: state.tasks.map((task) => (
      task.id === id ? { ...task, done: !task.done } : task
    )),
  })),
}))
