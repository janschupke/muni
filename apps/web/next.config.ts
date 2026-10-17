import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** Sent with every response; the Content-Security-Policy is set per request by the proxy. */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: () => Promise.resolve([{ source: '/:path*', headers: SECURITY_HEADERS }]),
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
