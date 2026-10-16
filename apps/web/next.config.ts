import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const config: NextConfig = {
  reactStrictMode: true,
  // Internal packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@muni/db', '@muni/domain', '@muni/importer', '@muni/ui', '@muni/utils'],
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
  experimental: {
    // Import chunks are up to 500 records; the default 1 MB is too tight for completions.
    serverActions: { bodySizeLimit: '4mb' },
    optimizePackageImports: ['lucide-react'],
  },
}

export default withNextIntl(config)
