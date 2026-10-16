import type { PlaywrightTestConfig } from '@playwright/test'

/** The seeded test database (pnpm db:up && pnpm test:integration). */
export const TEST_DB = 'postgresql://muni:muni@localhost:5439/muni_test'

/** The production build (`next build` first) on the test database, with the Clerk dev keys. */
export function productionServer(port: number): NonNullable<PlaywrightTestConfig['webServer']> {
  return {
    command: `next start --port ${String(port)}`,
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DB,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
      CLERK_SECRET_KEY: process.env['CLERK_SECRET_KEY'] ?? '',
    },
  }
}

/** Loads the repo's `.env` (Clerk keys), keeping whatever the environment already sets. */
export function loadRootEnv(): void {
  try {
    process.loadEnvFile(new URL('../../../../.env', import.meta.url))
  } catch {
    // No .env (CI): the keys come from the environment.
  }
}

/** The configured base URL; every project sets one, so a missing one is a config error. */
export function baseUrlOf(url: string | undefined): string {
  if (!url) throw new Error('playwright: use.baseURL is not set')
  return url
}
