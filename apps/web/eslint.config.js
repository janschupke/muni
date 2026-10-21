import { react } from '../../eslint.preset.js'

// A link inside a page is not prefetched (components/navigation/link.tsx says why); the menu's
// prefetch as the pointer reaches them (intent-link.tsx). Only these two use Next's Link.
const NEXT_LINK = {
  name: 'next/link',
  message: "Use Link from '@/components/navigation/link': it is not prefetched.",
}
const MENU_LINKS = [
  'src/components/navigation/link.tsx',
  'src/components/navigation/intent-link.tsx',
]

export default [
  ...react(import.meta.dirname, { next: true }),
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', ...MENU_LINKS],
    rules: { '@typescript-eslint/no-restricted-imports': ['error', { paths: [NEXT_LINK] }] },
  },
  {
    // Components, features and lib code run in the browser too: from the database package
    // they may import types only. A value import would pull the server's code (and its
    // secrets' readers) into the bundle; `server-only` would only catch it at run time.
    files: ['src/components/**', 'src/features/**', 'src/lib/**'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', ...MENU_LINKS],
    rules: {
      // This setting replaces the one above for these files, so it names next/link again.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [NEXT_LINK],
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
