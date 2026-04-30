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
  addTask: (text) => set((state) => ({
    tasks: [...state.tasks, { id: Date.now(), text, done: false }],
  })),
  toggleTask: (id) => set((state) => ({
    tasks: state.tasks.map((task) => (
      task.id === id ? { ...task, done: !task.done } : task
    )),
  })),
  clearCompleted: () => set((state) => ({
    tasks: state.tasks.filter((task) => !task.done),
  })),
}))
