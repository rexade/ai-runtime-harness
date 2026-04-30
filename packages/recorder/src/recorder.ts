import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  ActionMetadata,
  ConsoleEvent,
  HarnessSessionState,
  NetworkEvent,
  RuntimeError,
  StoreSnapshot,
} from '@ai-runtime-harness/protocol'

export interface RecordingSemanticSnapshot {
  actions?: ActionMetadata[]
  session?: HarnessSessionState
  stores?: StoreSnapshot[]
  url?: string | null
}

export interface RecordingDeltas {
  console?: ConsoleEvent[]
  network?: NetworkEvent[]
  errors?: RuntimeError[]
}

export interface RecordingStep {
  index: number
  tool: string
  args: unknown
  startedAt: string
  finishedAt: string
  durationMs: number
  replayable: boolean
  semanticBefore?: RecordingSemanticSnapshot
  semanticAfter?: RecordingSemanticSnapshot
  deltas?: RecordingDeltas
  result?: unknown
  error?: string
  screenshotPath?: string
}

export interface RecordingArtifact {
  id: string
  label?: string
  createdAt: string
  completedAt?: string
  status: 'recording' | 'completed'
  steps: RecordingStep[]
}

export interface RecordingStatus {
  active: boolean
  artifact?: RecordingArtifact
}

export interface RecordingHookContext {
  tool: string
  args: unknown
  replayable: boolean
  result?: unknown
  error?: unknown
}

export interface RecordingHooks {
  captureBefore?: (context: RecordingHookContext) => Promise<Pick<RecordingStep, 'semanticBefore'>>
  captureAfter?: (context: RecordingHookContext) => Promise<Pick<RecordingStep, 'semanticAfter' | 'deltas' | 'screenshotPath'>>
}

function createRecordingId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function serializeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value ?? null
  if (typeof value === 'function') return '[Function]'
  if (typeof value !== 'object') return value
  if (seen.has(value as object)) return '[Circular]'

  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, seen))
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      serializeValue(entry, seen),
    ]),
  )
}

export class Recorder {
  private current: RecordingArtifact | null = null
  private readonly recordingsDir: string

  constructor(
    options: {
      recordingsDir?: string
      hooks?: RecordingHooks
    } = {},
  ) {
    const root = options.recordingsDir ?? process.env.AI_HARNESS_RECORDINGS_DIR ?? process.cwd()
    this.recordingsDir = resolve(root, '.ai-harness', 'recordings')
    this.hooks = options.hooks ?? {}
  }

  private readonly hooks: RecordingHooks

  start(label?: string) {
    if (this.current) {
      throw new Error(`Recording '${this.current.id}' is already active.`)
    }

    const artifact: RecordingArtifact = {
      id: createRecordingId(),
      label,
      createdAt: new Date().toISOString(),
      status: 'recording',
      steps: [],
    }

    this.current = artifact
    return artifact
  }

  status(): RecordingStatus {
    return {
      active: this.current !== null,
      artifact: this.current ?? undefined,
    }
  }

  async record<T>(
    tool: string,
    args: unknown,
    execute: () => Promise<T>,
    options: { replayable?: boolean } = {},
  ): Promise<T> {
    if (!this.current) {
      return execute()
    }

    const replayable = options.replayable ?? false
    const startedAt = Date.now()
    const hookContext: RecordingHookContext = {
      tool,
      args,
      replayable,
    }

    const before = await this.hooks.captureBefore?.(hookContext)

    try {
      const result = await execute()
      const after = await this.hooks.captureAfter?.({
        ...hookContext,
        result,
      })

      this.current.steps.push({
        index: this.current.steps.length,
        tool,
        args: serializeValue(args),
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        replayable,
        semanticBefore: before?.semanticBefore,
        semanticAfter: after?.semanticAfter,
        deltas: after?.deltas,
        result: serializeValue(result),
        screenshotPath: after?.screenshotPath ?? this.extractScreenshotPath(result),
      })

      return result
    } catch (error) {
      const after = await this.hooks.captureAfter?.({
        ...hookContext,
        error,
      })

      this.current.steps.push({
        index: this.current.steps.length,
        tool,
        args: serializeValue(args),
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        replayable,
        semanticBefore: before?.semanticBefore,
        semanticAfter: after?.semanticAfter,
        deltas: after?.deltas,
        error: error instanceof Error ? error.message : String(error),
        screenshotPath: after?.screenshotPath,
      })

      throw error
    }
  }

  async stop(options: { save?: boolean } = {}) {
    if (!this.current) {
      throw new Error('No active recording.')
    }

    this.current.status = 'completed'
    this.current.completedAt = new Date().toISOString()

    const artifact = this.current
    this.current = null

    const path = options.save === false ? undefined : await this.saveArtifact(artifact)

    return {
      artifact,
      path,
    }
  }

  async load(path: string) {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as RecordingArtifact
  }

  private async saveArtifact(artifact: RecordingArtifact) {
    await mkdir(this.recordingsDir, { recursive: true })
    const path = join(this.recordingsDir, `${artifact.id}.json`)
    await writeFile(path, `${JSON.stringify(serializeValue(artifact), null, 2)}\n`, 'utf8')
    return path
  }

  private extractScreenshotPath(result: unknown) {
    if (result && typeof result === 'object' && 'path' in result && typeof result.path === 'string') {
      return result.path
    }

    return undefined
  }
}
