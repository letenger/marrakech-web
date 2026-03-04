import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve the workspace engine to its TS source so Vite (and Vitest,
      // which inherits this config) transform it directly — no build step.
      '@marrakech/engine': fileURLToPath(
        new URL('./packages/engine/src/index.ts', import.meta.url),
      ),
    },
  },
})
