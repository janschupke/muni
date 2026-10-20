import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      // `scripts/` holds the repo's own tooling, run by the package scripts and git hooks.
      entry: ['eslint.preset.js', 'vitest.preset.ts', 'scripts/*.ts!'],
      project: ['scripts/*.ts!'],
    },
    'apps/web': {
      entry: [
        'src/app/**/{page,layout,not-found,error,loading,route,template,global-error}.{ts,tsx}!',
        'src/proxy.ts!',
        'src/i18n/request.ts!',
        'next.config.ts!',
        'e2e/**/*.ts',
      ],
      // The test helpers are not production code.
      project: ['src/**/*.{ts,tsx}!', '!src/test/**!', 'e2e/**/*.ts'],
      ignoreDependencies: ['tailwindcss'],
    },
    'packages/db': {
      entry: ['src/seed.ts!', 'scripts/*.ts!', 'prisma.config.ts!', 'src/**/*.test.ts'],
      project: ['src/**/*.ts!', 'scripts/*.ts!', 'prisma.config.ts!'],
      // Development tools the migration scripts run.
      ignoreBinaries: ['tsx', 'prisma'],
      ignore: ['src/generated/**'],
      // Imported by the generated client in src/generated, which knip does not scan.
      ignoreDependencies: ['@prisma/client'],
    },
    'packages/*': {
      project: ['src/**/*.{ts,tsx}!', '!src/test/**!'],
    },
  },
}

export default config
