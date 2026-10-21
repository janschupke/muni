import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { createDb } from '../src/connect'
import { seedFromDirectory } from '../src/seed'
import { TEMPLATE, testServer, withDatabase } from './databases'
import { createTestUser } from './users'

/**
 * Builds the template every test file starts from (test/database.ts copies it per file): the
 * committed migrations, then the raw exports in data/ seeded as of 2026-10-16. A file then
 * changes its own copy as it likes, and no other file sees it.
 */
export default async function setup() {
  const server = testServer()
  const admin = createDb(server)
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TEMPLATE}" WITH (FORCE)`)
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TEMPLATE}"`)
  } finally {
    await admin.$disconnect()
  }
  const url = withDatabase(server, TEMPLATE)
  execFileSync('prisma', ['migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  })
  const db = createDb(url)
  try {
    await seedFromDirectory(db, path.join(import.meta.dirname, '../../../data'), '2026-10-16')
    await createTestUser(db)
  } finally {
    // A template is copied only while nobody is connected to it.
    await db.$disconnect()
  }
}
