import type { PlaywrightTestConfig } from '@playwright/test'

/** The seeded test database (pnpm db:up && pnpm test:integration). */
export const TEST_DB = 'postgresql://muni:muni@localhost:5439/muni_test'

/**
 * The Clerk development instance's keys, from `.env` or (in CI) the environment. Production
 * keys are refused: the setup creates and edits users. Checked when a config loads, so missing
 * keys fail at once, not as a server that never answers.
 */
export function clerkDevKeys(): { publishableKey: string; secretKey: string } {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  const secretKey = process.env['CLERK_SECRET_KEY'] ?? ''
  if (!publishableKey.startsWith('pk_test_') || !secretKey.startsWith('sk_test_'))
    throw new Error(
      'e2e needs the Clerk development keys (pk_test_/sk_test_): NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ' +
        'and CLERK_SECRET_KEY in .env, or in CI the secrets CLERK_PUBLISHABLE_KEY and ' +
        'CLERK_SECRET_KEY (docs/testing.md, CI)'
    )
  return { publishableKey, secretKey }
}

/** The production build (`next build` first) on the test database, with the Clerk dev keys. */
export function productionServer(port: number): NonNullable<PlaywrightTestConfig['webServer']> {
  const { publishableKey, secretKey } = clerkDevKeys()
  return {
    command: `next start --port ${String(port)}`,
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DB,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: secretKey,
      // The suites click far faster than a person; the limits themselves have unit tests.
      MUNI_RATE_LIMIT_READS: '100000',
      MUNI_RATE_LIMIT_WRITES: '100000',
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
