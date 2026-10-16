/**
 * Applies pending migrations during the Vercel build. Uses DIRECT_URL (never the 6543 pooler,
 * which prisma.config.ts rejects). Without a database URL it fails on production deploys and
 * skips everywhere else, so previews without a database can still build.
 */
import { execFileSync } from 'node:child_process'

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!url) {
  if (process.env.VERCEL_ENV === 'production') {
    console.error('migrate-deploy: DIRECT_URL is not set on a production deploy')
    process.exit(1)
  }
  console.warn('migrate-deploy: no DIRECT_URL/DATABASE_URL, skipping migrations')
  process.exit(0)
}

execFileSync('prisma', ['migrate', 'deploy'], { stdio: 'inherit' })
