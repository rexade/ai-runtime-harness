import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = 'C:/Users/henri/projects/ai-runtime-harness'
const cliRoot = path.join(repoRoot, 'packages/cli')
const defaultOutDir = path.join(repoRoot, '.package', 'ai-runtime-harness')

function parseArgs(argv) {
  let outDir = defaultOutDir

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--out') {
      outDir = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { outDir }
}

async function main() {
  const { outDir } = parseArgs(process.argv.slice(2))
  const packageJsonPath = path.join(cliRoot, 'package.json')
  const rootPackageJsonPath = path.join(repoRoot, 'package.json')
  const distDir = path.join(cliRoot, 'dist')
  const bundledPlaywrightDir = path.join(repoRoot, 'node_modules', 'playwright-core')
  const bundledWsDir = path.join(repoRoot, 'node_modules', 'ws')

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, 'utf8'))
  delete packageJson.scripts
  delete packageJson.devDependencies
  packageJson.packageManager ??= rootPackageJson.packageManager

  await rm(outDir, { recursive: true, force: true })
  await mkdir(path.join(outDir, 'node_modules'), { recursive: true })

  await writeFile(path.join(outDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  await writeFile(path.join(outDir, '.npmrc'), 'node-linker=hoisted\n')
  await cp(distDir, path.join(outDir, 'dist'), { recursive: true })
  await cp(bundledPlaywrightDir, path.join(outDir, 'node_modules', 'playwright-core'), { recursive: true })
  await cp(bundledWsDir, path.join(outDir, 'node_modules', 'ws'), { recursive: true })

  console.log(outDir)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
