import { enableHarnessConnection } from './index'
import { shouldAutoConnect } from './harness-state'

if (typeof window !== 'undefined' && shouldAutoConnect()) {
  enableHarnessConnection()
}
