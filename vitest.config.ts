import { defineConfig } from 'vitest/config'

// The repo's own scripts (scripts/); every package has its own vitest.config.ts.
export default defineConfig({
  test: { environment: 'node', include: ['scripts/**/*.test.ts'] },
})
