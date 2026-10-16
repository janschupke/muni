// Shared flat-config factories. Each package's eslint.config.js calls one of them.
import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const IGNORES = [
  '**/node_modules/**',
  '**/.next/**',
  '**/generated/**',
  '**/coverage/**',
  '**/*.d.ts',
]

const base = tsconfigRootDir => [
  { ignores: IGNORES },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
]

/** Node-only packages (no JSX). */
export function node(tsconfigRootDir) {
  return tseslint.config(...base(tsconfigRootDir), {
    languageOptions: { globals: { ...globals.node } },
  })
}

/** React packages. Pass { next: true } for the Next app. */
export function react(tsconfigRootDir, { next = false } = {}) {
  return tseslint.config(
    ...base(tsconfigRootDir),
    reactHooks.configs.flat.recommended,
    ...(next
      ? [
          {
            plugins: { '@next/next': nextPlugin },
            rules: {
              ...nextPlugin.configs.recommended.rules,
              ...nextPlugin.configs['core-web-vitals'].rules,
            },
          },
        ]
      : []),
    { languageOptions: { globals: { ...globals.browser, ...globals.node } } }
  )
}
