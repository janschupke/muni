import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { type Check, planChecks, SCANNING_SUITES, type Workspace } from './check-changed.ts'

// The repo's own graph: web imports everything; db imports domain, importer and utils.
const WORKSPACES: Workspace[] = [
  { name: 'root', dir: '', deps: [] },
  {
    name: '@muni/web',
    dir: 'apps/web',
    deps: ['@muni/db', '@muni/domain', '@muni/importer', '@muni/ui', '@muni/utils'],
  },
  { name: '@muni/db', dir: 'packages/db', deps: ['@muni/domain', '@muni/importer', '@muni/utils'] },
  { name: '@muni/domain', dir: 'packages/domain', deps: ['@muni/utils'] },
  { name: '@muni/importer', dir: 'packages/importer', deps: ['@muni/domain', '@muni/utils'] },
  { name: '@muni/ui', dir: 'packages/ui', deps: [] },
  { name: '@muni/utils', dir: 'packages/utils', deps: [] },
]

const present = () => true
const labels = (checks: Check[]) => checks.map(c => c.label)

describe('the checks a change needs', () => {
  it('nothing changed: nothing to run', () => {
    expect(planChecks([], WORKSPACES, present)).toEqual({ checks: [], notes: ['Nothing changed.'] })
  })

  it('a domain module: its package and every package that imports it, but not ui', () => {
    const plan = planChecks(['packages/domain/src/sessions.ts'], WORKSPACES, present)
    expect(labels(plan.checks)).toEqual([
      'prettier',
      'eslint @muni/web',
      'eslint @muni/db',
      'eslint @muni/domain',
      'eslint @muni/importer',
      'typecheck @muni/web',
      'typecheck @muni/db',
      'typecheck @muni/domain',
      'typecheck @muni/importer',
      'knip',
      'related tests @muni/web',
      'related tests @muni/db',
      'related tests @muni/domain',
      'related tests @muni/importer',
      'related db integration tests',
    ])
    expect(plan.checks.find(c => c.label === 'typecheck @muni/db')?.reason).toBe(
      'a package it imports changed'
    )
    // Type-aware lint reads other files' types: a source change lints the package whole,
    // from its root, and every package that imports it.
    expect(plan.checks.find(c => c.label === 'eslint @muni/domain')).toMatchObject({
      cwd: 'packages/domain',
      args: ['exec', 'eslint', '--max-warnings', '0', '.'],
    })
    expect(plan.checks.find(c => c.label === 'eslint @muni/db')?.reason).toBe(
      'a package it imports changed'
    )
    expect(plan.notes).toEqual([])
  })

  it('a web component: the suites that read the source from disk, and a reminder to rebuild', () => {
    const plan = planChecks(['apps/web/src/features/rooms/room-view.tsx'], WORKSPACES, present)
    expect(labels(plan.checks)).toEqual([
      'prettier',
      'eslint @muni/web',
      'typecheck @muni/web',
      'knip',
      'related tests @muni/web',
      'message catalogs and their keys in use',
      'colour tokens and the classes in use',
    ])
    expect(plan.notes).toEqual([expect.stringMatching(/^The UI changed: rebuild/)])
  })

  it('the schema: generate, schema and drift checks, and the whole database suite', () => {
    const plan = planChecks(['packages/db/prisma/schema.prisma'], WORKSPACES, present)
    expect(labels(plan.checks)).toEqual([
      'prisma generate',
      'check:schema',
      'check:drift',
      'prettier',
      'typecheck @muni/web',
      'typecheck @muni/db',
      'tests @muni/db',
      'db integration (all)',
    ])
  })

  it('a shared config: the full gate, nothing narrower', () => {
    const plan = planChecks(['tsconfig.base.json', 'README.md'], WORKSPACES, present)
    expect(plan.checks).toEqual([expect.objectContaining({ label: 'pnpm check', args: ['check'] })])
  })

  it('a test only: lint on that file, not its package', () => {
    const plan = planChecks(['packages/domain/src/sessions.test.ts'], WORKSPACES, present)
    expect(plan.checks.find(c => c.label === 'eslint @muni/domain')).toMatchObject({
      args: ['exec', 'eslint', '--max-warnings', '0', '--no-warn-ignored', 'src/sessions.test.ts'],
    })
    expect(labels(plan.checks).filter(l => l.startsWith('eslint'))).toEqual(['eslint @muni/domain'])
  })

  it('docs only: formatting, and the paths they name', () => {
    expect(labels(planChecks(['README.md', 'docs/ui.md'], WORKSPACES, present).checks)).toEqual([
      'prettier',
      'paths the docs name',
    ])
  })

  it('a deleted file: its whole package runs, and the docs are checked for it', () => {
    const plan = planChecks(['packages/utils/src/money.ts'], WORKSPACES, () => false)
    expect(labels(plan.checks)).toEqual([
      'eslint @muni/web',
      'eslint @muni/db',
      'eslint @muni/domain',
      'eslint @muni/importer',
      'eslint @muni/utils',
      'typecheck @muni/web',
      'typecheck @muni/db',
      'typecheck @muni/domain',
      'typecheck @muni/importer',
      'typecheck @muni/utils',
      'knip',
      'tests @muni/utils',
      'db integration (all)',
      'paths the docs name',
    ])
  })

  it('a repo script: the root typecheck and its own tests', () => {
    expect(labels(planChecks(['scripts/check-changed.ts'], WORKSPACES, present).checks)).toEqual([
      'prettier',
      'eslint root',
      'typecheck root',
      'knip',
      'related tests root',
    ])
  })

  it('messages: the catalog checks, without a rebuild reminder', () => {
    const plan = planChecks(['apps/web/src/i18n/messages/cs.json'], WORKSPACES, present)
    expect(labels(plan.checks)).toContain('message catalogs and their keys in use')
    expect(plan.notes).toEqual([])
  })
})

describe('the suites that scan the source', () => {
  it('are where the script runs them', () => {
    const root = path.join(import.meta.dirname, '..')
    for (const suite of SCANNING_SUITES.web)
      expect(existsSync(path.join(root, 'apps/web', suite)), suite).toBe(true)
    for (const suite of SCANNING_SUITES.ui)
      expect(existsSync(path.join(root, 'packages/ui', suite)), suite).toBe(true)
    for (const suite of SCANNING_SUITES.root)
      expect(existsSync(path.join(root, suite)), suite).toBe(true)
  })
})
