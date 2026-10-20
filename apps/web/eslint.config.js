import { react } from '../../eslint.preset.js'

export default [
  ...react(import.meta.dirname, { next: true }),
  {
    // Components, features and lib code run in the browser too: from the database package
    // they may import types only. A value import would pull the server's code (and its
    // secrets' readers) into the bundle; `server-only` would only catch it at run time.
    files: ['src/components/**', 'src/features/**', 'src/lib/**'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@muni/db', '@muni/db/*'],
              allowTypeImports: true,
              message: 'Import types only from @muni/db here; values belong to src/server.',
            },
          ],
        },
      ],
    },
  },
]
