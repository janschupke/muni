// Runs only the checks a change needs: what changed since a git ref (HEAD by default, so the
// uncommitted work), mapped to the checks that cover it. `pnpm check` stays the full gate;
// this is what to run after each change, and what the pre-push hook runs.
//
//   pnpm check:changed                  uncommitted and untracked files
//   pnpm check:changed --base master    everything since master as well
//   pnpm check:changed --base auto      since the upstream (or origin/master)
//   pnpm check:changed --push           the pre-push hook: the commits a push carries, on a clean
//                                       tree (else it refuses); with nothing to compare, the
//                                       whole gate
//   pnpm check:changed --dry-run        print the plan, run nothing
//
// The mapping (`planChecks`) is a pure function; scripts/check-changed.test.ts pins it.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export interface Workspace {
  /** The package name, or 'root' for the repo's own config files and scripts. */
  name: string
  /** Relative to the repo root, '' for the root. */
  dir: string
  /** The workspace packages it depends on. */
  deps: string[]
}

export interface Check {
  /** What runs, as printed. */
  label: string
  /** Why it runs: the change that asked for it. */
  reason: string
  /** Relative to the repo root. */
  cwd: string
  command: string
  args: string[]
}

export interface Plan {
  checks: Check[]
  /** What the script does not run but the change needs (a rebuild and the browser suites). */
  notes: string[]
}

/** A change to any of these changes how every package is checked: only the full gate covers it. */
const SHARED_CONFIG = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.react.json',
  // Every package's tsconfig includes it.
  'env.d.ts',
  'eslint.preset.js',
  'vitest.preset.ts',
  '.prettierrc.json',
  '.prettierignore',
  // Prettier's Tailwind stylesheet: it orders the classes in every package.
  'apps/web/src/app/globals.css',
  'turbo.json',
  'knip.config.ts',
  '.nvmrc',
  // What the tests run with but never import, so no related test would run for them.
  'apps/web/src/test/setup.ts',
  'packages/db/.env.test',
  'packages/db/test/global-setup.ts',
  'packages/db/test/database.ts',
])

/** A vitest config: how a package's whole suite runs, which no single test imports. */
const VITEST_CONFIG = /(^|\/)vitest(\.[a-z]+)?\.config\.ts$/

const isShared = (file: string) => SHARED_CONFIG.has(file) || VITEST_CONFIG.test(file)

const LINTED = /\.(ts|tsx|js|mjs)$/
const CODE = /\.(ts|tsx|js|mjs|json|css)$/
const TEST = /\.test\.tsx?$/

/**
 * Suites that read source files from disk rather than import them, so `vitest related` cannot
 * find them: run whenever their package's source changes. Paths are relative to the package
 * (check-changed.test.ts checks they exist, so a moved suite cannot drop out silently).
 */
export const SCANNING_SUITES = {
  web: ['src/i18n/messages-parity.test.ts', 'src/lib/format/format-rate.test.ts'],
  ui: ['src/styles/tokens.test.ts'],
  root: ['scripts/docs-paths.test.ts'],
  /** The exports in data/ and the import files derived from them. */
  importer: ['src/fixtures.test.ts', 'src/derive/derive.test.ts'],
} as const

const WEB = '@muni/web'
const DB = '@muni/db'
const UI = '@muni/ui'

function ownerOf(file: string, workspaces: readonly Workspace[]): Workspace {
  const owner = workspaces
    .filter(w => w.dir !== '' && (file === w.dir || file.startsWith(`${w.dir}/`)))
    .sort((a, b) => b.dir.length - a.dir.length)[0]
  const root = workspaces.find(w => w.dir === '')
  if (owner) return owner
  if (!root) throw new Error('no root workspace')
  return root
}

/** The workspaces that depend on `name`, directly or through another workspace. */
function dependentsOf(name: string, workspaces: readonly Workspace[]): Set<string> {
  const found = new Set<string>()
  const queue = [name]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const w of workspaces) {
      if (w.deps.includes(next) && !found.has(w.name)) {
        found.add(w.name)
        queue.push(w.name)
      }
    }
  }
  return found
}

const within = (w: Workspace, file: string) => (w.dir === '' ? file : path.relative(w.dir, file))
const check = (
  label: string,
  reason: string,
  cwd: string,
  command: string,
  args: string[]
): Check => ({ label, reason, cwd, command, args })

/**
 * The checks for a set of changed files (relative to the repo root; deleted ones included).
 * `exists` says which of them are still on disk: only those can be formatted, linted or
 * traced to their tests.
 */
export function planChecks(
  changed: readonly string[],
  workspaces: readonly Workspace[],
  exists: (file: string) => boolean
): Plan {
  const files = [...new Set(changed)].sort()
  if (files.length === 0) return { checks: [], notes: ['Nothing changed.'] }

  const shared = files.filter(isShared)
  if (shared.length > 0) {
    return {
      checks: [
        check('pnpm check', `shared config changed (${shared.join(', ')})`, '', 'pnpm', ['check']),
      ],
      notes: ['A shared config change reaches every package: the full gate covers it.'],
    }
  }

  const present = files.filter(exists)
  const code = files.filter(f => CODE.test(f))
  const byName = new Map(workspaces.map(w => [w.name, w]))
  const checks: Check[] = []
  const notes: string[] = []

  const prisma = files.filter(f => f.startsWith('packages/db/prisma/'))
  if (prisma.length > 0) {
    checks.push(
      check('prisma generate', 'the schema changed', '', 'pnpm', ['db:generate']),
      check('check:schema', 'the schema changed', '', 'pnpm', ['check:schema']),
      check('check:drift', 'the schema or a migration changed', '', 'pnpm', ['check:drift'])
    )
  }

  if (present.length > 0) {
    checks.push(
      check('prettier', 'changed files', '', 'pnpm', [
        'exec',
        'prettier',
        '--check',
        '--ignore-unknown',
        ...present,
      ])
    )
  }

  // Each package lints with its own config, from its own root. Type-aware rules read other
  // files' types, so a source change can break lint in a file that did not change: then the
  // package and every package that imports it lint whole. A test changes nothing else.
  const sourceOwners = new Set(
    code.filter(f => LINTED.test(f) && !TEST.test(f)).map(f => ownerOf(f, workspaces).name)
  )
  const lintWhole = new Set(sourceOwners)
  for (const name of sourceOwners) for (const d of dependentsOf(name, workspaces)) lintWhole.add(d)
  for (const w of workspaces) {
    const eslint = ['exec', 'eslint', '--max-warnings', '0']
    if (lintWhole.has(w.name)) {
      const reason = sourceOwners.has(w.name)
        ? 'its source changed'
        : 'a package it imports changed'
      checks.push(check(`eslint ${w.name}`, reason, w.dir, 'pnpm', [...eslint, '.']))
      continue
    }
    const lintable = present.filter(f => LINTED.test(f) && ownerOf(f, workspaces) === w)
    if (lintable.length === 0) continue
    checks.push(
      check(`eslint ${w.name}`, 'changed files', w.dir, 'pnpm', [
        ...eslint,
        '--no-warn-ignored',
        ...lintable.map(f => within(w, f)),
      ])
    )
  }

  // What changed, and everything that imports it.
  const touched = new Set(code.map(f => ownerOf(f, workspaces).name))
  if (prisma.length > 0) touched.add(DB)
  const affected = new Set(touched)
  for (const name of touched) for (const d of dependentsOf(name, workspaces)) affected.add(d)
  const ordered = workspaces.filter(w => affected.has(w.name))

  for (const w of ordered) {
    const reason = touched.has(w.name) ? 'it changed' : 'a package it imports changed'
    checks.push(
      w.dir === ''
        ? check('typecheck root', reason, '', 'pnpm', ['typecheck:root'])
        : check(`typecheck ${w.name}`, reason, '', 'pnpm', ['--filter', w.name, 'typecheck'])
    )
  }
  if (code.some(f => !f.endsWith('.css'))) {
    checks.push(check('knip', 'exports may have changed', '', 'pnpm', ['knip']))
  }

  // The tests that import a changed file, in its package and in every package that imports it.
  const traceable = code.filter(exists).map(f => path.resolve(f))
  for (const w of ordered) {
    const own = code.filter(f => ownerOf(f, workspaces) === w)
    const lostTrail = own.length > 0 && own.every(f => !exists(f))
    if (w.name === DB && prisma.length > 0) {
      // A new client: every db module may type or behave differently.
      checks.push(
        check(`tests ${w.name}`, 'the schema changed', w.dir, 'pnpm', ['exec', 'vitest', 'run'])
      )
      continue
    }
    if (lostTrail) {
      // Only deletions: nothing left to trace from, so the whole package runs.
      checks.push(
        check(`tests ${w.name}`, 'files were deleted', w.dir, 'pnpm', ['exec', 'vitest', 'run'])
      )
      continue
    }
    if (traceable.length === 0) continue
    checks.push(
      check(
        `related tests ${w.name}`,
        touched.has(w.name) ? 'it changed' : 'a package it imports changed',
        w.dir,
        'pnpm',
        ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...traceable]
      )
    )
  }

  // Tests that read source files from disk rather than import them: `related` cannot find them.
  const webSource = files.some(f => f.startsWith('apps/web/src/') && !TEST.test(f))
  const messages = files.some(f => f.startsWith('apps/web/src/i18n/messages/'))
  if ((webSource || messages) && byName.has(WEB)) {
    checks.push(
      check(
        'message catalogs and their keys in use',
        'web source or messages changed',
        'apps/web',
        'pnpm',
        ['exec', 'vitest', 'run', ...SCANNING_SUITES.web]
      )
    )
  }
  const uiStyles = files.some(f => f.startsWith('packages/ui/src/'))
  if ((webSource || uiStyles) && byName.has(UI)) {
    checks.push(
      check(
        'colour tokens and the classes in use',
        'web or ui source changed',
        'packages/ui',
        'pnpm',
        ['exec', 'vitest', 'run', ...SCANNING_SUITES.ui]
      )
    )
  }

  // The exports, and the import files derived from them (which must match what the script
  // writes, and import cleanly).
  if (files.some(f => f.startsWith('data/'))) {
    checks.push(
      check(
        'the exports and the derived import files',
        'data changed',
        'packages/importer',
        'pnpm',
        ['exec', 'vitest', 'run', ...SCANNING_SUITES.importer]
      )
    )
  }

  // The database suite needs the test database up (`pnpm db:up`).
  if (affected.has(DB)) {
    checks.push(
      prisma.length > 0
        ? check('db integration (all)', 'the schema changed', '', 'pnpm', ['test:integration'])
        : traceable.length > 0
          ? check(
              'related db integration tests',
              'db or a package it imports changed',
              'packages/db',
              'pnpm',
              [
                'exec',
                'dotenv',
                // The test database's URL wins over anything exported in the shell.
                '-o',
                '-e',
                '.env.test',
                '--',
                'vitest',
                'related',
                '--run',
                '--passWithNoTests',
                '--config',
                'vitest.integration.config.ts',
                ...traceable,
              ]
            )
          : check('db integration (all)', 'db files were deleted', '', 'pnpm', ['test:integration'])
    )
  }

  // The docs name files by path: a changed doc, or a file moved or deleted, can break one.
  if (files.some(f => f.endsWith('.md') || !exists(f))) {
    checks.push(
      check('paths the docs name', 'docs changed or files were removed', '', 'pnpm', [
        'exec',
        'vitest',
        'run',
        ...SCANNING_SUITES.root,
      ])
    )
  }

  const ui =
    files.some(f => f.startsWith('apps/web/src/') && f.endsWith('.tsx') && !TEST.test(f)) ||
    files.some(f => f.startsWith('packages/ui/src/') && !TEST.test(f)) ||
    files.some(f => f.startsWith('apps/web/e2e/'))
  if (ui) {
    notes.push(
      'The UI changed: rebuild (`pnpm --filter @muni/web build`), run the e2e spec that covers it, ' +
        'one file at a time, and the visual shots; look at the changed screenshots in both themes.'
    )
  }
  return { checks, notes }
}

// ---- the command line

export function workspacesOf(root: string): Workspace[] {
  const dirs = ['apps', 'packages'].flatMap(top =>
    readdirSync(path.join(root, top), { withFileTypes: true })
      .filter(d => d.isDirectory() && existsSync(path.join(root, top, d.name, 'package.json')))
      .map(d => `${top}/${d.name}`)
  )
  const read = (dir: string) =>
    JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8')) as {
      name: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
  const named = dirs.map(dir => ({ dir, pkg: read(dir) }))
  const names = new Set(named.map(n => n.pkg.name))
  return [
    { name: 'root', dir: '', deps: [] },
    ...named.map(({ dir, pkg }) => ({
      name: pkg.name,
      dir,
      deps: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
        d => names.has(d) && d !== pkg.name
      ),
    })),
  ]
}

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' })
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

function resolveBase(base: string): string | null {
  if (base !== 'auto') return base
  for (const candidate of ['@{upstream}', 'origin/master']) {
    const found = spawnSync('git', ['rev-parse', '--verify', '--quiet', candidate])
    if (found.status === 0) return candidate
  }
  return null
}

/**
 * The files changed since `base`. Renames count as a deletion and an addition (a moved file
 * must reach the checks for deleted ones). With `committed`, only what the commits since the
 * fork changed (what a push carries); otherwise the working tree too, untracked files included.
 */
function changedSince(base: string, committed: boolean): string[] {
  const fork = base === 'HEAD' ? base : (git('merge-base', base, 'HEAD')[0] ?? base)
  if (committed) return git('diff', '--name-only', '--no-renames', fork, 'HEAD')
  return [
    ...git('diff', '--name-only', '--no-renames', fork),
    ...git('ls-files', '--others', '--exclude-standard'),
  ]
}

const say = (text: string) => process.stdout.write(`${text}\n`)

/** The whole gate, when there is nothing to compare with. */
const FULL_GATE: Plan = {
  checks: [
    check('pnpm check', 'no upstream or origin/master to compare with', '', 'pnpm', ['check']),
  ],
  notes: [],
}

function main(argv: string[]): number {
  const args = argv.filter(a => a !== '--')
  const at = args.indexOf('--base')
  const dryRun = args.includes('--dry-run')
  // The pre-push hook: what the push carries, so the working tree must be exactly that.
  const push = args.includes('--push')
  const root = git('rev-parse', '--show-toplevel')[0] ?? '.'
  process.chdir(root)
  if (push) {
    const dirty = git('status', '--porcelain')
    if (dirty.length > 0) {
      say('check:changed: commit or stash these first, so the checks see what is pushed:')
      for (const line of dirty) say(`  ${line}`)
      return 1
    }
  }
  const base = resolveBase(push ? 'auto' : at === -1 ? 'HEAD' : (args[at + 1] ?? 'HEAD'))
  const plan =
    base === null ? FULL_GATE : planChecks(changedSince(base, push), workspacesOf(root), existsSync)

  say(`check:changed since ${base ?? 'nothing'}: ${String(plan.checks.length)} checks`)
  for (const c of plan.checks) say(`  - ${c.label}  (${c.reason})`)
  const failed: string[] = []
  if (!dryRun) {
    // One at a time: the suites share the test database and the machine.
    for (const c of plan.checks) {
      say(`\n▶ ${c.label}  (${c.reason})`)
      // Through sh: package-manager shims are scripts a bare exec can refuse (ENOEXEC).
      const run = spawnSync('sh', ['-c', 'exec "$0" "$@"', c.command, ...c.args], {
        cwd: path.join(root, c.cwd),
        stdio: 'inherit',
      })
      if (run.error) say(`check:changed: could not run ${c.label}: ${run.error.message}`)
      if (run.status !== 0) failed.push(c.label)
    }
  }
  for (const note of plan.notes) say(`\nNote: ${note}`)
  if (dryRun) return 0
  say(
    failed.length === 0
      ? `\ncheck:changed: all ${String(plan.checks.length)} checks passed.`
      : `\ncheck:changed: failed: ${failed.join(', ')}`
  )
  return failed.length === 0 ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
