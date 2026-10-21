import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

import type { PlaywrightTestConfig } from '@playwright/test'

const read = (path: string) => parseEnv(readFileSync(new URL(path, import.meta.url), 'utf8'))

/**
 * The database the reading suites run on: the test database the db package's tests use
 * (packages/db/.env.test).
 */
export const TEST_DB = read('../../../../packages/db/.env.test')['DATABASE_URL'] ?? ''

/**
 * The specs that create, book and archive, and the sign-in, whose timing a server shared with
 * the readers would skew: each on a database and a server of its own, seeded like the readers'
 * (register.setup.ts), so none sees what another wrote and all run at once.
 */
export const WRITERS = ['crud', 'bookings', 'lists', 'import', 'signin'] as const
export type Writer = (typeof WRITERS)[number]

/**
 * The readers' apps, all on the test database: a Node server renders one page at a time, so
 * the reading workers share three (each worker keeps to one, readerUrl). The writers' follow,
 * one port each.
 */
export const READ_PORTS = [3061, 3062, 3063] as const
export const READ_PORT = READ_PORTS[0]
export const writerPort = (writer: Writer) => 3064 + WRITERS.indexOf(writer)

/** The readers' app a worker uses. */
export const readerUrl = (worker: number) =>
  `http://localhost:${String(READ_PORTS[worker % READ_PORTS.length])}`

/** A writer's database, beside the test database on the same server. */
export function writerDb(writer: Writer): string {
  const url = new URL(TEST_DB)
  url.pathname = `${url.pathname}_${writer}`
  return url.toString()
}

/**
 * The Clerk development instance's keys, from `.env` or (in CI) the environment. Production
 * keys are refused: the setup creates and edits users. Checked when a config loads, so missing
 * keys fail at once, not as a server that never answers.
 */
export function clerkDevKeys(): { publishableKey: string; secretKey: string } {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  const secretKey = process.env.CLERK_SECRET_KEY ?? ''
  if (!publishableKey.startsWith('pk_test_') || !secretKey.startsWith('sk_test_'))
    throw new Error(
      'e2e needs the Clerk development keys (pk_test_/sk_test_): NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ' +
        'and CLERK_SECRET_KEY in .env, or in CI the secrets CLERK_PUBLISHABLE_KEY and ' +
        'CLERK_SECRET_KEY (docs/testing.md, CI)'
    )
  return { publishableKey, secretKey }
}

/** The production build (`next build` first) on a test database, with the Clerk dev keys. */
export function productionServer(
  port: number,
  database = TEST_DB
): Exclude<NonNullable<PlaywrightTestConfig['webServer']>, unknown[]> {
  const { publishableKey, secretKey } = clerkDevKeys()
  return {
    command: `next start --port ${String(port)}`,
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: database,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: secretKey,
      // The suites click far faster than a person; the limits themselves have unit tests.
      MUNI_RATE_LIMIT_READS: '100000',
      MUNI_RATE_LIMIT_WRITES: '100000',
      // The defaults, whatever the shell sets: what the suites expect of the policy and window.
      MUNI_SANITIZE_POLICY: '',
      MUNI_EXPIRING_DAYS: '',
    },
  }
}

/**
 * The Clerk keys from the repo's `.env`, unless the environment sets them (CI). Nothing else
 * of the dev setup reaches the suites: the test server's settings are its own
 * (productionServer). No `.env` is fine; one that cannot be read is an error.
 */
export function loadRootEnv(): void {
  let env: NodeJS.Dict<string>
  try {
    env = read('../../../../.env')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishable, CLERK_SECRET_KEY: secret } = env
  if (publishable !== undefined) process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= publishable
  if (secret !== undefined) process.env.CLERK_SECRET_KEY ??= secret
}

/** The configured base URL; every project sets one, so a missing one is a config error. */
export function baseUrlOf(url: string | undefined): string {
  if (!url) throw new Error('playwright: use.baseURL is not set')
  return url
}
