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

/**
 * @param {string} tsconfigRootDir
 * @returns {import('typescript-eslint').ConfigWithExtends[]}
 */
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

/**
 * Node-only packages (no JSX).
 * @param {string} tsconfigRootDir
 */
export function node(tsconfigRootDir) {
  return tseslint.config(...base(tsconfigRootDir), {
    languageOptions: { globals: { ...globals.node } },
  })
}

/**
 * React packages. Pass { next: true } for the Next app.
 * @param {string} tsconfigRootDir
 * @param {{ next?: boolean }} [options]
 */
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
    { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
    {
      rules: {
        // Native `title` tooltips are slow, unstyled and unreachable by keyboard: use the
        // Tooltip component (or IconButton for icon-only buttons). Banned on DOM elements
        // (an iframe's title is its accessible name, so it stays) and on the components that
        // pass it through to one; components whose `title` prop is a heading are fine.
        'no-restricted-syntax': [
          'error',
          {
            selector:
              'JSXOpeningElement[name.name=/^(?!iframe$)[a-z]/] > JSXAttribute[name.name="title"]',
            message: 'Use <Tooltip> (or <IconButton>) instead of a native title attribute.',
          },
          {
            selector:
              'JSXOpeningElement[name.name=/^(Button|Link|TextLink|NavItem|LinkTab)$/] > JSXAttribute[name.name="title"]',
            message: 'Use <Tooltip> (or <IconButton>) instead of a native title attribute.',
          },
        ],
      },
    }
  )
}
