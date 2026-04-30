import { registerHarnessAction, registerHarnessStore } from '../../../packages/browser-runtime/src/index'
import { useTaskStore } from './store'

export function setupHarness() {
  registerHarnessStore(
    'tasks',
    () => useTaskStore.getState(),
    (patch) => useTaskStore.setState(patch as Partial<ReturnType<typeof useTaskStore.getState>>),
  )

  registerHarnessAction('addTask', (args) => {
    const input = args as { text?: string } | undefined
    useTaskStore.getState().addTask(input?.text ?? '')
  })

  registerHarnessAction('clearCompleted', () => {
    useTaskStore.getState().clearCompleted()
  })
}
