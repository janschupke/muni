import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from './generated/prisma/client'

export type { Prisma } from './generated/prisma/client'
export type Db = PrismaClient

/**
 * One client per process. In serverless (Vercel) each function instance keeps a small
 * pool; DATABASE_URL should point at Supabase's transaction pooler (port 6543).
 */
export function createDb(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) })
}

const globalForDb = globalThis as unknown as { muniDb?: PrismaClient }

/** Lazy so that importing a module never needs a database (e.g. during `next build`). */
export function getDb(): PrismaClient {
  globalForDb.muniDb ??= createDb()
  return globalForDb.muniDb
}
