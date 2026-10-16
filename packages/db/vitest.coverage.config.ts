import { defineConfig, mergeConfig } from 'vitest/config'

import { coverage } from '../../vitest.preset.ts'
import unit from './vitest.config.ts'
import integration from './vitest.integration.config.ts'

/**
 * Coverage for @muni/db is measured over the unit and integration runs together: the
 * repositories are only meaningfully tested against Postgres (the test database, 5439).
 */
export default defineConfig({
  test: {
    coverage,
    projects: [
      mergeConfig(unit, { test: { name: 'unit' } }),
      mergeConfig(integration, { test: { name: 'integration' } }),
    ],
  },
})
