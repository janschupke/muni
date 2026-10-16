import { defineConfig } from 'prisma/config'

/**
 * Migrations need a direct (or session-pooled) connection: Supabase's transaction pooler
 * on port 6543 cannot run them. DIRECT_URL wins; DATABASE_URL is the local-dev fallback.
 * The getter is lazy so `prisma generate` works without any database configured.
 */
function migrationUrl(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL) to run migrations')
  if (new URL(url).port === '6543') {
    throw new Error('DIRECT_URL points at the Supabase transaction pooler (6543); use port 5432')
  }
  return url
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx scripts/seed.ts',
  },
  datasource: {
    get url() {
      return migrationUrl()
    },
  },
})
