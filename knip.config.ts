import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      // `scripts/` holds the repo's own tooling, run by the package scripts and git hooks.
      entry: ['eslint.preset.js', 'vitest.preset.ts', 'scripts/*.ts!'],
      project: ['scripts/*.ts!'],
    },
    'apps/web': {
      // Next's own entries (pages, layouts, the proxy, next.config) come from knip's Next plugin.
      entry: [
        'src/app/**/{page,layout,not-found,error,loading,route,template,global-error}.{ts,tsx}!',
        'e2e/**/*.ts',
      ],
      // The test helpers are not production code. The stylesheets are read too, so what they
      // import (tailwindcss) counts as used.
      project: ['src/**/*.{ts,tsx,css}!', '!src/test/**!', 'e2e/**/*.ts'],
    },
    'packages/db': {
      entry: ['src/seed.ts!', 'scripts/*.ts!', 'src/**/*.test.ts', 'test/**/*.ts'],
      project: ['src/**/*.ts!', 'scripts/*.ts!', 'test/**/*.ts'],
      // Imported by the client prisma generates into src/generated, which is git-ignored and so
      // never scanned.
      ignoreDependencies: ['@prisma/client'],
      // prisma.config.ts's seed command runs tsx, a development tool (`knip --production`
      // leaves development dependencies out).
      ignoreBinaries: ['tsx'],
    },
    'packages/*': {
      project: ['src/**/*.{ts,tsx}!', '!src/test/**!'],
    },
  },
}

export default config
