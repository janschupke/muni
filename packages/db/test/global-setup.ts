import { execFileSync } from 'node:child_process'

/**
 * Brings the test database (port 5439, tmpfs: `docker compose restart db-test` wipes it)
 * up to the committed migrations. Non-destructive: the suite is written to re-run against
 * existing data, because seeding upserts by source ID.
 */
export default function setup() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.includes(':5439/')) {
    throw new Error(`Integration tests only run against the test database on 5439, got "${url}"`)
  }
  execFileSync('prisma', ['migrate', 'deploy'], { stdio: 'inherit' })
}
