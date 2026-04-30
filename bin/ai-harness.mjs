#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagedEntryPath = path.resolve(repoRoot, 'packages/cli/dist/index.js')
const packagedPlaywrightPath = path.resolve(repoRoot, 'packages/cli/node_modules/playwright-core/package.json')
const sourceEntryPath = path.resolve(repoRoot, 'packages/cli/src/index.ts')

const command = process.execPath
const args = existsSync(packagedEntryPath) && existsSync(packagedPlaywrightPath)
  ? [packagedEntryPath, ...process.argv.slice(2)]
  : ['--import', 'tsx/esm', sourceEntryPath, ...process.argv.slice(2)]

const child = spawn(command, args, {
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
