import { defineConfig, devices } from '@playwright/test'

import {
  loadRootEnv,
  productionServer,
  READ_PORT,
  READ_PORTS,
  writerDb,
  writerPort,
  WRITERS,
} from './e2e/support/server'
import type { AppOptions } from './e2e/support/test'

/**
 * The browser suites against the production build, signed in through the Clerk development
 * instance (keys from the repo's .env):
 *   pnpm db:up && pnpm --filter @muni/web build
 *   pnpm test:e2e            the specs: readers side by side, each writer beside them on its own
 *   pnpm test:lighthouse     the Lighthouse audits, alone (scores need a quiet machine)
 * First global-setup.ts (Clerk's testing token, the e2e users), then the register project
 * (register.setup.ts: both test databases seeded as of today), then the setup project (each
 * role signs in once). The readers run on the test database; each writer on a database and
 * server of its own, so what it creates never shows up under another spec.
 */
loadRootEnv()
const url = (port: number) => `http://localhost:${String(port)}`

export default defineConfig<AppOptions>({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // The writers take a worker each; the readers share the rest. On CI the app servers and the
  // browsers share four cores.
  workers: process.env.CI ? 4 : '75%',
  retries: 0,
  reporter: [['list']],
  use: { baseURL: url(READ_PORT), trace: 'retain-on-failure' },
  projects: [
    { name: 'register', testMatch: /register\.setup\.ts/ },
    { name: 'setup', testMatch: /auth\.setup\.ts/, dependencies: ['register'] },
    // Specs that create, book and archive: each on its own server and database, its tests in
    // order, all of them alongside the readers. Listed first, so each starts on a worker of its
    // own at once (tests are handed out in project order); the readers take the rest.
    ...WRITERS.map(writer => ({
      name: `write-${writer}`,
      testMatch: new RegExp(`/${writer}\\.spec\\.ts$`),
      use: { ...devices['Desktop Chrome'], baseURL: url(writerPort(writer)) },
      fullyParallel: false,
      workers: 1,
      dependencies: ['setup'],
    })),
    {
      name: 'read',
      testMatch: /(a11y|access|layout|register)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'lighthouse',
      testMatch: /\.audit\.ts/,
      fullyParallel: false,
      workers: 1,
      dependencies: ['setup'],
    },
  ],
  webServer: [
    ...READ_PORTS.map(port => productionServer(port)),
    ...WRITERS.map(writer => productionServer(writerPort(writer), writerDb(writer))),
  ],
})
