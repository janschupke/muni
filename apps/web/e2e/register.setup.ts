import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { createDb } from '@muni/db/connect'
import { expect, test as setup } from '@playwright/test'

import { emptyTestDb } from './support/db'
import { REGISTER_DIR, writeRegister } from './support/register'
import { TEST_DB } from './support/server'

// Runs first, before anyone signs in: the test database migrated, emptied and seeded with the
// register as of today (support/register.ts), the same on every machine and every day.

/** packages/db, where its tools (prisma, tsx) and the seed script are. */
const DB = path.join(import.meta.dirname, '../../../packages/db')
const run = (bin: string, ...args: string[]) => {
  execFileSync(path.join(DB, 'node_modules/.bin', bin), args, {
    cwd: DB,
    env: { ...process.env, DATABASE_URL: TEST_DB, DIRECT_URL: TEST_DB },
    stdio: 'pipe',
  })
}

setup('the register, as of today', async () => {
  setup.setTimeout(180_000)
  writeRegister()
  run('prisma', 'migrate', 'deploy')
  await emptyTestDb()
  // The seed script reads its modules under the react-server condition (they are server-only).
  run('tsx', '--conditions=react-server', 'scripts/seed.ts', REGISTER_DIR)
  // Every row of the files (data/import/README.md has the counts).
  const db = createDb(TEST_DB)
  try {
    expect([await db.courseSession.count(), await db.courseCompletion.count()]).toEqual([32, 2814])
  } finally {
    await db.$disconnect()
  }
})
