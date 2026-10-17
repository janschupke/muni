import 'server-only'

import { createDb } from './connect'
import type { Prisma, PrismaClient } from './generated/prisma/client'

export type { Prisma } from './generated/prisma/client'
export type Db = PrismaClient
/** The client inside `$transaction`. */
export type Tx = Prisma.TransactionClient

const globalForDb = globalThis as unknown as { muniDb?: PrismaClient }

/**
 * The app's one client per process, lazy so that importing a module never needs a database
 * (e.g. during `next build`). Server code only; scripts and test tooling use `./connect`.
 */
export function getDb(): PrismaClient {
  globalForDb.muniDb ??= createDb()
  return globalForDb.muniDb
}
