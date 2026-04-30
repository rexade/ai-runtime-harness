import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aiHarness } from '../../packages/vite-plugin/src/index'

export default defineConfig({
  plugins: [
    react(),
    aiHarness({
      networkCapture: true,
      consoleCapture: true,
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
})
