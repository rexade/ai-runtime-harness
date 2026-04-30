import { describe, expect, it, vi } from 'vitest'
import { ReplayRunner, type ReplayExplorer } from './replay'

function makeExplorer(): ReplayExplorer {
  return {
    async callAction() {
      return { ok: true }
    },
    async click() {
      return { ok: true }
    },
    async press() {
      return { ok: true }
    },
    async advanceFrames() {
      return { ok: true }
    },
    async mutate() {
      return { ok: true }
    },
    async screenshot() {
      return { path: 'replay.png' }
    },
    async getStore() {
      return [{ name: 'run', state: { tick: 1 } }]
    },
  }
}

describe('ReplayRunner', () => {
  it('replays semantic explorer steps and compares recorded stores', async () => {
    const runner = new ReplayRunner(makeExplorer())
    const result = await runner.runArtifact({
      id: 'demo',
      createdAt: new Date().toISOString(),
      status: 'completed',
      steps: [{
        index: 0,
        tool: 'explorer.call_action',
        args: { name: 'jump' },
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        replayable: true,
        semanticAfter: {
          stores: [{ name: 'run', state: { tick: 1 } }],
        },
      }],
    })

    expect(result.success).toBe(true)
    expect(result.steps[0].matched).toBe(true)
  })

  it('restores the first recorded mutable semantic checkpoint before replaying', async () => {
    const mutate = vi.fn(async () => ({ ok: true }))
    const runner = new ReplayRunner({
      ...makeExplorer(),
      mutate,
    })

    await runner.runArtifact({
      id: 'restore-demo',
      createdAt: new Date().toISOString(),
      status: 'completed',
      steps: [{
        index: 0,
        tool: 'explorer.call_action',
        args: { name: 'jump' },
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        replayable: true,
        semanticBefore: {
          stores: [{ name: 'run', state: { tick: 0 }, mutable: true }],
        },
        semanticAfter: {
          stores: [{ name: 'run', state: { tick: 1 } }],
        },
      }],
    })

    expect(mutate).toHaveBeenCalledWith('run', { tick: 0 })
  })
})
