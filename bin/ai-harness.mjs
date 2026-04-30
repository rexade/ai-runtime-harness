#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entryPath = path.resolve(repoRoot, 'packages/cli/src/index.ts')

const child = spawn(process.execPath, ['--import', 'tsx/esm', entryPath, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
})

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

child.once('error', (error) => {
  console.error('[AI Harness] Failed to start CLI:', error)
  process.exit(1)
})
