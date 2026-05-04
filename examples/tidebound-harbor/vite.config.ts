import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { aiHarness } from '../../packages/vite-plugin/src/index'

export default defineConfig({
  plugins: [
    react(),
    aiHarness({
      consoleCapture: true,
      networkCapture: true,
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    entries: ['index.html', 'harbor.html', 'playground.html'],
  },
  server: {
    host: '127.0.0.1',
    port: 5190,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        harbor: resolve(__dirname, 'harbor.html'),
        playground: resolve(__dirname, 'playground.html'),
      },
    },
  },
})
