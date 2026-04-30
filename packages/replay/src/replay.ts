import { readFile } from 'node:fs/promises'
import type { StoreSnapshot } from '@ai-runtime-harness/protocol'
import type { RecordingArtifact, RecordingStep } from '@ai-runtime-harness/recorder'

export interface ReplayExplorer {
  callAction(name: string, args?: unknown): Promise<unknown>
  click(selector: string): Promise<unknown>
  press(key: string): Promise<unknown>
  advanceFrames(count: number): Promise<unknown>
  mutate(path: string, value: unknown): Promise<unknown>
  screenshot(name?: string): Promise<{ path: string }>
  getStore(name?: string): Promise<StoreSnapshot | StoreSnapshot[] | null>
}

export interface ReplayStepResult {
  tool: string
  replayed: boolean
  matched: boolean
  mismatches: string[]
  screenshotPath?: string
  error?: string
}

export interface ReplayRunResult {
  id: string
  success: boolean
  steps: ReplayStepResult[]
}

function normalizeStores(value: StoreSnapshot | StoreSnapshot[] | null) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function stringify(value: unknown) {
  return JSON.stringify(value)
}

export class ReplayRunner {
  constructor(private readonly explorer: ReplayExplorer) {}

  async load(path: string) {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as RecordingArtifact
  }

  async runArtifact(
    artifact: RecordingArtifact,
    options: { captureScreenshots?: boolean } = {},
  ): Promise<ReplayRunResult> {
    const steps: ReplayStepResult[] = []
    await this.restoreInitialSemanticState(artifact)

    for (const step of artifact.steps) {
      if (!step.replayable) {
        steps.push({
          tool: step.tool,
          replayed: false,
          matched: true,
          mismatches: [],
        })
        continue
      }

      const result = await this.runStep(step, options)
      steps.push(result)
    }

    return {
      id: artifact.id,
      success: steps.every((step) => step.matched && !step.error),
      steps,
    }
  }

  private async restoreInitialSemanticState(artifact: RecordingArtifact) {
    const firstReplayable = artifact.steps.find((step) => step.replayable && step.semanticBefore?.stores?.length)
    const stores = firstReplayable?.semanticBefore?.stores ?? []

    for (const store of stores) {
      if (!store.mutable) continue
      if (!store.state || typeof store.state !== 'object' || Array.isArray(store.state)) continue
      await this.explorer.mutate(store.name, store.state)
    }
  }

  private async runStep(
    step: RecordingStep,
    options: { captureScreenshots?: boolean },
  ): Promise<ReplayStepResult> {
    try {
      await this.invoke(step)
      const mismatches = await this.compareSemanticCheckpoint(step)
      const screenshotPath = options.captureScreenshots
        ? (await this.explorer.screenshot(`replay-${step.index}`)).path
        : undefined

      return {
        tool: step.tool,
        replayed: true,
        matched: mismatches.length === 0,
        mismatches,
        screenshotPath,
      }
    } catch (error) {
      return {
        tool: step.tool,
        replayed: true,
        matched: false,
        mismatches: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async invoke(step: RecordingStep) {
    const args = (step.args ?? {}) as Record<string, unknown>

    switch (step.tool) {
      case 'explorer.call_action':
        return this.explorer.callAction(String(args.name), args.args)
      case 'explorer.click':
      case 'browser.click':
        return this.explorer.click(String(args.selector))
      case 'explorer.press':
      case 'browser.press':
        return this.explorer.press(String(args.key))
      case 'explorer.advance_frames':
        return this.explorer.advanceFrames(Number(args.count))
      case 'explorer.mutate':
        return this.explorer.mutate(String(args.path), args.value)
      default:
        return undefined
    }
  }

  private async compareSemanticCheckpoint(step: RecordingStep) {
    const expectedStores = step.semanticAfter?.stores ?? []
    if (expectedStores.length === 0) return []

    const actualStores = normalizeStores(await this.explorer.getStore())
    const mismatches: string[] = []

    for (const expectedStore of expectedStores) {
      const actualStore = actualStores.find((entry) => entry.name === expectedStore.name)
      if (!actualStore) {
        mismatches.push(`Missing store: ${expectedStore.name}`)
        continue
      }

      if (stringify(actualStore.state) !== stringify(expectedStore.state)) {
        mismatches.push(`Store '${expectedStore.name}' diverged from the recorded semantic checkpoint.`)
      }
    }

    return mismatches
  }
}
