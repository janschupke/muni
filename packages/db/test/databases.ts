// The integration tests' databases, on the local test server (packages/db/.env.test).

/** What every test file's database is copied from (global-setup.ts builds it). */
export const TEMPLATE = 'muni_test_template'

/**
 * The test server's URL, from DATABASE_URL. Refuses anything but the local test database, so
 * no test can empty or copy another one.
 */
export function testServer(): string {
  const raw = process.env.DATABASE_URL ?? ''
  const url = URL.canParse(raw) ? new URL(raw) : null
  if (url?.hostname !== 'localhost' || url.port !== '5439' || url.pathname !== '/muni_test')
    throw new Error(
      `Integration tests run only against localhost:5439/muni_test (packages/db/.env.test), got "${raw}"`
    )
  return raw
}

/** The same server, another database on it. */
export function withDatabase(server: string, name: string): string {
  const url = new URL(server)
  url.pathname = `/${name}`
  return url.toString()
}
