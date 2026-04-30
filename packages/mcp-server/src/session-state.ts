import type { HarnessLastAction, HarnessMode, HarnessSessionState } from '@ai-runtime-harness/protocol'

export interface HarnessSessionOverlay {
  sessionId: string | null
  recording: boolean
  mode: HarnessMode
  lastAction?: HarnessLastAction | null
}

function createOverlay(): HarnessSessionOverlay {
  return {
    sessionId: null,
    recording: false,
    mode: 'explorer',
    lastAction: null,
  }
}

export class HarnessSessionManager {
  private overlay = createOverlay()

  update(patch: Partial<HarnessSessionOverlay>) {
    this.overlay = {
      ...this.overlay,
      ...patch,
    }

    return this.getOverlay()
  }

  reset() {
    this.overlay = createOverlay()
    return this.getOverlay()
  }

  getOverlay(): HarnessSessionOverlay {
    return { ...this.overlay }
  }

  applyToRuntime(session: HarnessSessionState): HarnessSessionState {
    return {
      ...session,
      ...this.overlay,
      updatedAt: Date.now(),
    }
  }
}
