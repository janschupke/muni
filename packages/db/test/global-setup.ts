import { execFileSync } from 'node:child_process'

import { createDb } from '../src/connect'

/**
 * Brings the test database (port 5439) up to the committed migrations and empties it, so every
 * run starts from what the seed writes onto an empty register, as a fresh deployment does.
 * Left over from an earlier run, rows the importer no longer writes would stay and move every
 * count the suite pins.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.includes(':5439/')) {
    throw new Error(`Integration tests only run against the test database on 5439, got "${url}"`)
  }
  execFileSync('prisma', ['migrate', 'deploy'], { stdio: 'inherit' })
  const db = createDb()
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    if (tables.length > 0)
      await db.$executeRawUnsafe(
        `TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`
      )
  } finally {
    await db.$disconnect()
  }
}
