// Shared flat-config factories. Each package's eslint.config.js calls one of them; the repo
// root's eslint.config.js lints the root config files with `node`.
import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import vitest from '@vitest/eslint-plugin'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import playwright from 'eslint-plugin-playwright'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const IGNORES = [
  '**/node_modules/**',
  '**/.next/**',
  '**/generated/**',
  '**/coverage/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/*.d.ts',
]

const TESTS = ['**/*.test.ts', '**/*.test.tsx']

/**
 * @param {string} tsconfigRootDir
 * @returns {import('typescript-eslint').ConfigWithExtends[]}
 */
const base = tsconfigRootDir => [
  { ignores: IGNORES },
  {
    // A disable comment or inline config that no longer does anything is an error, so
    // exceptions cannot outlive the code they excused.
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // The stylistic preset prefers `x!` to `x as T`, which the strict preset's
      // no-non-null-assertion forbids; the strict rule wins.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      // Groups, each sorted: node builtins, packages, the app's `@/` alias, relative files.
      'simple-import-sort/imports': [
        'error',
        { groups: [['^\\u0000'], ['^node:'], ['^@?\\w'], ['^@/'], ['^\\.']] },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: TESTS,
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      // Helpers that assert on their own count as assertions.
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expect*', 'expectNoAxeViolations'] },
      ],
      // Vitest's expect takes a message as its second argument.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
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
 * Playwright's rules on the Next app's e2e tests.
 * @type {import('typescript-eslint').ConfigWithExtends}
 */
const e2e = {
  files: ['e2e/**/*.ts'],
  ...playwright.configs['flat/recommended'],
  rules: {
    ...playwright.configs['flat/recommended'].rules,
    // Helpers that assert on their own count as assertions.
    'playwright/expect-expect': [
      'warn',
      { assertFunctionNames: ['expectNoViolations', 'expectScores'] },
    ],
  },
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
    jsxA11y.configs.recommended,
    ...(next
      ? [
          {
            plugins: { '@next/next': nextPlugin },
            rules: {
              ...nextPlugin.configs.recommended.rules,
              ...nextPlugin.configs['core-web-vitals'].rules,
            },
          },
          e2e,
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
