import { defineConfig, type ViteUserConfig } from 'vitest/config'

/** Pure TypeScript packages. */
export function node(overrides: ViteUserConfig = {}) {
  return defineConfig({
    ...overrides,
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
      ...overrides.test,
    },
  })
}
