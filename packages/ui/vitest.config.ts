import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

import { coverage } from '../../vitest.preset.ts'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage,
  },
})
