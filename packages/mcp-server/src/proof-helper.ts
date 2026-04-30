import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { BrowserDriver } from '@ai-runtime-harness/browser-driver'
import type { Explorer, ExplorerObservation } from '@ai-runtime-harness/explorer'
import type { ActionMetadata, HarnessMode, StoreSnapshot } from '@ai-runtime-harness/protocol'

export type ProofActionInput =
  | { type: 'call_action'; name: string; args?: unknown }
  | { type: 'advance_frames'; count: number }
  | { type: 'click'; selector: string }
  | { type: 'press'; key: string }
  | { type: 'mutate'; path: string; value: unknown }

export interface ProofArtifact {
  id: string
  label: string
  mode: HarnessMode
  createdAt: string
  action: ProofActionInput
  actionMetadata?: ActionMetadata
  beforeScreenshot: string
  afterScreenshot: string
  before: {
    session: ExplorerObservation['session']
    stores: StoreSnapshot[]
    url?: string | null
  }
  after: {
    session: ExplorerObservation['session']
    stores: StoreSnapshot[]
    url?: string | null
  }
  semanticDelta: {
    changedStores: Array<{
      name: string
      before: unknown
      after: unknown
    }>
    sessionChanged: boolean
  }
}

function createProofId(label?: string) {
  const prefix = label
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return prefix ? `${stamp}-${prefix}` : stamp
}

function normalizeStores(stores: ExplorerObservation['stores']) {
  return stores ?? []
}

function diffStores(before: StoreSnapshot[], after: StoreSnapshot[]) {
  const changedStores: ProofArtifact['semanticDelta']['changedStores'] = []

  for (const beforeStore of before) {
    const afterStore = after.find((store) => store.name === beforeStore.name)
    if (!afterStore) continue

    if (JSON.stringify(beforeStore.state) !== JSON.stringify(afterStore.state)) {
      changedStores.push({
        name: beforeStore.name,
        before: beforeStore.state,
        after: afterStore.state,
      })
    }
  }

  return changedStores
}

export class ProofHelper {
  private readonly proofsRoot: string

  constructor(
    private readonly explorer: Explorer,
    private readonly browser: BrowserDriver,
    root = process.cwd(),
  ) {
    this.proofsRoot = resolve(root, '.ai-harness', 'proofs')
  }

  async captureAction(label: string | undefined, action: ProofActionInput, mode: HarnessMode = 'explorer') {
    const id = createProofId(label)
    const proofDir = join(this.proofsRoot, id)
    await mkdir(proofDir, { recursive: true })

    const before = await this.explorer.observe()
    const beforeScreenshot = await this.browser.screenshot({
      outputDir: proofDir,
      fileName: 'before.png',
      name: `${id}-before`,
    })

    const actions = await this.explorer.getActions()
    const actionMetadata = action.type === 'call_action'
      ? actions.find((entry) => entry.name === action.name)
      : undefined

    await this.perform(action)

    const after = await this.explorer.observe()
    const afterScreenshot = await this.browser.screenshot({
      outputDir: proofDir,
      fileName: 'after.png',
      name: `${id}-after`,
    })

    const artifact: ProofArtifact = {
      id,
      label: label ?? id,
      mode,
      createdAt: new Date().toISOString(),
      action,
      actionMetadata,
      beforeScreenshot: beforeScreenshot.path,
      afterScreenshot: afterScreenshot.path,
      before: {
        session: before.session,
        stores: normalizeStores(before.stores),
        url: before.url,
      },
      after: {
        session: after.session,
        stores: normalizeStores(after.stores),
        url: after.url,
      },
      semanticDelta: {
        changedStores: diffStores(normalizeStores(before.stores), normalizeStores(after.stores)),
        sessionChanged: JSON.stringify(before.session) !== JSON.stringify(after.session),
      },
    }

    const proofPath = join(proofDir, 'proof.json')
    await writeFile(proofPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')

    return {
      id,
      path: proofPath,
      beforeScreenshot: beforeScreenshot.path,
      afterScreenshot: afterScreenshot.path,
      semanticDelta: artifact.semanticDelta,
    }
  }

  private async perform(action: ProofActionInput) {
    switch (action.type) {
      case 'call_action':
        return this.explorer.callAction(action.name, action.args)
      case 'advance_frames':
        return this.explorer.advanceFrames(action.count)
      case 'click':
        return this.explorer.click(action.selector)
      case 'press':
        return this.explorer.press(action.key)
      case 'mutate':
        return this.explorer.mutate(action.path, action.value)
      default:
        return undefined
    }
  }
}
