import { node } from '../../vitest.preset.ts'
import { resolve } from './vitest.config.ts'

/**
 * The repositories, the import writer and the seed against Postgres (the test server,
 * packages/db/.env.test). global-setup builds a seeded template; each file runs on a copy of
 * its own (test/database.ts), so files run side by side and clean up after nobody.
 */
export default node({
  resolve,
  test: {
    include: ['src/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/database.ts'],
  },
})
