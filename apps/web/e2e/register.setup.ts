import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { createDb } from '@muni/db/connect'
import { expect, test as setup } from '@playwright/test'

import { emptyTestDb } from './support/db'
import { REGISTER_DIR, writeRegister } from './support/register'
import { TEST_DB, writerDb, WRITERS } from './support/server'

// Runs first, before anyone signs in: every test database (the readers' and each writer's,
// support/server.ts) migrated, emptied and seeded, side by side, with the register as of today
// (support/register.ts), the same on every machine and every day.

const ROOT = path.join(import.meta.dirname, '../../..')
const run = promisify(execFile)
/**
 * A command in @muni/db, with its own tools (prisma, tsx), on a test database. Through sh:
 * pnpm's launcher is a script a bare exec can refuse (ENOEXEC).
 */
const inDb = (database: string, ...args: string[]) =>
  run('sh', ['-c', 'exec "$0" "$@"', 'pnpm', '--filter', '@muni/db', 'exec', ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: database, DIRECT_URL: database },
  })

/** The writers' databases exist beside the test database (made once per machine). */
async function ensureWriterDbs() {
  const admin = createDb(TEST_DB)
  try {
    for (const writer of WRITERS) {
      const name = new URL(writerDb(writer)).pathname.slice(1)
      const found = await admin.$queryRaw<
        unknown[]
      >`SELECT 1 FROM pg_database WHERE datname = ${name}`
      if (found.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
    }
  } finally {
    await admin.$disconnect()
  }
}

/** Seeds a database with the register; what it then holds (sessions, completions). */
async function seed(database: string): Promise<number[]> {
  await inDb(database, 'prisma', 'migrate', 'deploy')
  await emptyTestDb(database)
  // The seed script reads its modules under the react-server condition (they are server-only).
  await inDb(database, 'tsx', '--conditions=react-server', 'scripts/seed.ts', REGISTER_DIR)
  const db = createDb(database)
  try {
    return [await db.courseSession.count(), await db.courseCompletion.count()]
  } finally {
    await db.$disconnect()
  }
}

setup('the register, as of today, for the readers and each writer', async () => {
  writeRegister()
  await ensureWriterDbs()
  const databases = [TEST_DB, ...WRITERS.map(writerDb)]
  const seeded = await Promise.all(databases.map(seed))
  // Every row of the files in each (data/import/README.md has the counts).
  expect(seeded).toEqual(databases.map(() => [32, 2814]))
})
