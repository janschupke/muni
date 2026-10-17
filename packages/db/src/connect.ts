import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from './generated/prisma/client'

/**
 * A client of its own, for scripts and test tooling that run outside the app (the seed, the
 * e2e cleanup). The app uses `getDb` from `./client`, which only the server may import.
 * In serverless (Vercel) each function instance keeps a small pool; DATABASE_URL should
 * point at Supabase's transaction pooler (port 6543).
 */
export function createDb(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) })
}
