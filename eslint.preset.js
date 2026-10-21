// Shared flat-config factories. Each package's eslint.config.js calls one of them; the repo
// root's eslint.config.js lints the root config files with `node`.
import js from '@eslint/js'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments'
import eslintReact from '@eslint-react/eslint-plugin'
import nextPlugin from '@next/eslint-plugin-next'
import vitest from '@vitest/eslint-plugin'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importX from 'eslint-plugin-import-x'
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
 * `process.env['X']` passes the type check whatever X is: env.d.ts types the names, and only
 * the dot form is checked against them.
 */
export const NO_BRACKET_ENV = {
  selector:
    "MemberExpression[computed=true][object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
  message: 'Read process.env.NAME (declared in env.d.ts), not process.env[...].',
}

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
  {
    // An exception says why it is one, and names the rules it turns off.
    plugins: { '@eslint-community/eslint-comments': eslintComments },
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
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
      'no-restricted-syntax': ['error', NO_BRACKET_ENV],
    },
  },
  {
    // No import cycles: a module that needs another's value through a loop reads it before
    // that module has run (the repositories once worked around one by hand).
    plugins: { 'import-x': importX },
    settings: {
      // Without the TypeScript extensions and parser it follows only .js files, and finds
      // nothing.
      'import-x/extensions': importX.flatConfigs.typescript.settings?.['import-x/extensions'],
      'import-x/parsers': importX.flatConfigs.typescript.settings?.['import-x/parsers'],
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: tsconfigRootDir })],
    },
    rules: { 'import-x/no-cycle': ['error', { ignoreExternal: true }] },
  },
  {
    files: TESTS,
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      // Helpers that assert on their own count as assertions.
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expect*'] }],
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
      'error',
      { assertFunctionNames: ['expectAccessible', 'expectScores', 'expectOpenedRowFills'] },
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
    // Keys, array-index keys, values leaked into the page (`{count && …}` renders 0), leaked
    // listeners and timers, unsafe DOM. Hooks and purity stay with eslint-plugin-react-hooks
    // (the official rules); naming preferences are off.
    eslintReact.configs['recommended-type-checked'],
    {
      rules: {
        '@eslint-react/rules-of-hooks': 'off',
        '@eslint-react/exhaustive-deps': 'off',
        '@eslint-react/purity': 'off',
        '@eslint-react/set-state-in-effect': 'off',
        '@eslint-react/set-state-in-render': 'off',
        '@eslint-react/static-components': 'off',
        '@eslint-react/use-memo': 'off',
        '@eslint-react/unsupported-syntax': 'off',
        '@eslint-react/error-boundaries': 'off',
        '@eslint-react/naming-convention-ref-name': 'off',
        '@eslint-react/naming-convention-id-name': 'off',
        '@eslint-react/naming-convention-context-name': 'off',
        '@eslint-react/use-state': 'off',
        '@eslint-react/no-use-context': 'off',
      },
    },
    jsxA11y.configs.recommended,
    {
      // Components that render these elements with the props given to them: the rules check
      // them as such (Next's Link with no href, a field with no label). TextLink, Button and
      // the tabs style a child (`asChild`) that carries its own href, so they are not mapped.
      settings: {
        'jsx-a11y-x': {
          components: { Link: 'a', Input: 'input', Textarea: 'textarea', Select: 'select' },
        },
      },
    },
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
          NO_BRACKET_ENV,
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
