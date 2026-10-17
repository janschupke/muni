/**
 * Seeds a database from a directory of CSV exports (see `seedFromDirectory`).
 *
 *   pnpm db:seed               # ../../data
 *   pnpm db:seed <dir>         # another export directory
 */
import path from 'node:path'

import { createDb } from '../src/connect'
import { seedFromDirectory } from '../src/seed'

const dir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '../../../data'))
const db = createDb()
seedFromDirectory(db, dir)
  .then(() => db.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error)
    await db.$disconnect()
    process.exit(1)
  })
