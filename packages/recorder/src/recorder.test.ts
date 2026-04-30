import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Recorder } from './recorder'

describe('Recorder', () => {
  it('records steps and saves an artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-harness-recorder-'))
    const recorder = new Recorder({ recordingsDir: root })
    recorder.start('demo')

    await recorder.record(
      'explorer.call_action',
      { name: 'jump' },
      async () => ({ ok: true }),
      { replayable: true },
    )

    const stopped = await recorder.stop()

    expect(stopped.path).toContain('.ai-harness')
    expect(stopped.artifact.steps).toHaveLength(1)
    expect(stopped.artifact.steps[0].tool).toBe('explorer.call_action')
    expect(stopped.artifact.steps[0].replayable).toBe(true)
  })
})
