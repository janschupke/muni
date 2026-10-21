/**
 * Seeds a database from a directory of CSV exports (see `seedFromDirectory`).
 *
 *   pnpm db:seed               # data/ (the raw exports, the development register)
 *   pnpm db:seed data/import   # the import files for a new register, or any directory
 */
import path from 'node:path'

import { createDb } from '../src/connect'
import { seedFromDirectory } from '../src/seed'

// A directory given is read from where the command was run (pnpm runs the script from
// packages/db; INIT_CWD is where it was called).
const given = process.argv[2]
const dir =
  given === undefined
    ? path.join(import.meta.dirname, '../../../data')
    : path.resolve(process.env.INIT_CWD ?? process.cwd(), given)
const db = createDb()
seedFromDirectory(db, dir)
  .then(() => db.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error)
    await db.$disconnect()
    process.exit(1)
  })
