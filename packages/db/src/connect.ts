import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from './generated/prisma/client'

/** A database on this machine (Docker for development and tests, CI's service): plain TCP. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * How the connection is secured. A database anywhere else (Supabase) is reached over TLS, its
 * certificate checked against DATABASE_CA (its CA, in PEM): without one the client refuses to
 * start rather than send the password and the register in the clear.
 */
export function tlsFor(connectionString: string, ca = process.env.DATABASE_CA) {
  if (LOCAL_HOSTS.has(new URL(connectionString).hostname)) return undefined
  if (!ca)
    throw new Error(
      'DATABASE_CA is not set: a database on another host is reached over TLS, checked against its CA certificate (docs/deploy.md)'
    )
  return { ca, rejectUnauthorized: true }
}

/**
 * A client of its own, for scripts and test tooling that run outside the app (the seed, the
 * e2e cleanup). The app uses `getDb` from `./client`, which only the server may import.
 * In serverless (Vercel) each function instance keeps a small pool; DATABASE_URL should
 * point at Supabase's transaction pooler (port 6543).
 */
export function createDb(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const ssl = tlsFor(connectionString)
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 5, ...(ssl && { ssl }) }),
  })
}
