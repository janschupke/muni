import type { PlaywrightTestConfig } from '@playwright/test'

/** The seeded test database (pnpm db:up && pnpm test:integration). */
const TEST_DB = 'postgresql://muni:muni@localhost:5439/muni_test'

/**
 * The production build (`next build` first) on the test database, signed out: no Clerk keys,
 * so the public read-only register.
 */
export function productionServer(port: number): NonNullable<PlaywrightTestConfig['webServer']> {
  return {
    command: `next start --port ${String(port)}`,
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DB,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
      CLERK_SECRET_KEY: '',
    },
  }
}

/** The configured base URL; every project sets one, so a missing one is a config error. */
export function baseUrlOf(url: string | undefined): string {
  if (!url) throw new Error('playwright: use.baseURL is not set')
  return url
}
