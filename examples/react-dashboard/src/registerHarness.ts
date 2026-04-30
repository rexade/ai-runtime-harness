import {
  registerHarnessAction,
  registerHarnessStore,
  registerHarnessSurface,
  setHarnessReadiness,
} from '../../../packages/browser-runtime/src/index'
import { useTaskStore } from './store'

export function setupHarness() {
  const surfaceId = 'dashboard'

  registerHarnessSurface({
    id: surfaceId,
    name: 'React Task Dashboard',
    type: 'app',
    runtimeVersion: '0.1.0',
    framework: 'react',
    readiness: 'registering',
    readinessMessage: 'Registering dashboard stores and task affordances.',
    current: true,
  })

  registerHarnessStore(
    surfaceId,
    'tasks',
    () => useTaskStore.getState(),
    (patch) => useTaskStore.setState(patch as Partial<ReturnType<typeof useTaskStore.getState>>),
  )

  registerHarnessAction(surfaceId, 'addTask', (args) => {
    const input = args as { text?: string } | undefined
    useTaskStore.getState().addTask(input?.text ?? '')
    return useTaskStore.getState()
  }, {
    kind: 'system',
    safety: 'normal',
    executionPath: 'semantic-action',
    description: 'Add a new task to the dashboard without manually typing through the UI.',
  })

  registerHarnessAction(surfaceId, 'clearCompleted', () => {
    useTaskStore.getState().clearCompleted()
    return useTaskStore.getState()
  }, {
    kind: 'system',
    safety: 'normal',
    executionPath: 'semantic-action',
    description: 'Remove completed tasks from the dashboard state.',
  })

  registerHarnessAction(surfaceId, 'markAllDone', () => {
    useTaskStore.getState().markAllDone()
    return useTaskStore.getState()
  }, {
    kind: 'system',
    safety: 'normal',
    executionPath: 'semantic-action',
    description: 'Mark every task as completed in a single semantic action.',
  })

  registerHarnessAction(surfaceId, 'resetDemo', () => {
    useTaskStore.getState().resetDemo()
    return useTaskStore.getState()
  }, {
    kind: 'debug',
    safety: 'debug-only',
    executionPath: 'semantic-action',
    description: 'Restore the dashboard to its seeded demo state for repeatable harness checks.',
  })

  registerHarnessAction(surfaceId, 'syncTasks', async () => {
    await useTaskStore.getState().syncTasks()
    return useTaskStore.getState()
  }, {
    kind: 'system',
    safety: 'normal',
    executionPath: 'semantic-action',
    description: 'Run the dashboard task sync flow and return the updated state.',
  })

  setHarnessReadiness('ready', 'React Task Dashboard is ready for harness interaction.', surfaceId)
}
