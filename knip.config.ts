import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['eslint.preset.js', 'vitest.preset.ts'],
    },
    'apps/web': {
      entry: [
        'src/app/**/{page,layout,not-found,error,loading,route}.tsx',
        'src/proxy.ts',
        'e2e/**/*.ts',
      ],
      project: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
      ignoreDependencies: ['tailwindcss'],
    },
    'packages/db': {
      entry: ['src/seed.ts', 'prisma.config.ts', 'src/**/*.test.ts'],
      project: ['src/**/*.ts', 'prisma.config.ts'],
      ignore: ['src/generated/**'],
      // Imported by the generated client in src/generated, which knip does not scan.
      ignoreDependencies: ['@prisma/client'],
    },
    'packages/*': {
      project: ['src/**/*.{ts,tsx}'],
    },
  },
}

export default config
