import { builtinModules } from 'node:module'
import path from 'node:path'
import { defineConfig } from 'vite'

const external = [
  'playwright-core',
  'ws',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]

export default defineConfig({
  resolve: {
    alias: {
      '@ai-runtime-harness/browser-driver': path.resolve(__dirname, '../browser-driver/src/index.ts'),
      '@ai-runtime-harness/explorer': path.resolve(__dirname, '../explorer/src/index.ts'),
      '@ai-runtime-harness/protocol': path.resolve(__dirname, '../protocol/src/index.ts'),
      '@ai-runtime-harness/recorder': path.resolve(__dirname, '../recorder/src/index.ts'),
      '@ai-runtime-harness/replay': path.resolve(__dirname, '../replay/src/index.ts'),
    },
  },
  build: {
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        'mcp-server': path.resolve(__dirname, '../mcp-server/src/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external,
      output: {
        banner: '#!/usr/bin/env node',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  test: { globals: true },
})
