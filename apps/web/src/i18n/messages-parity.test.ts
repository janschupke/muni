import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { ASSIGNMENT_FAILURES } from '@muni/db/repositories'
import { REMEDIATIONS } from '@muni/domain/advisor'
import {
  CAPABILITIES,
  COMPLIANCE_STATUSES,
  EMPLOYMENT_STATES,
  REQUIREMENT_SCOPES,
  ROLES,
  ROOM_KINDS,
  SESSION_STATUSES,
} from '@muni/domain/enums'
import { COLUMNS, DATASET_KINDS, ISSUE_CODES } from '@muni/importer'
import { IntlMessageFormat } from 'intl-messageformat'
import { describe, expect, it } from 'vitest'

import cs from './messages/cs.json'
import en from './messages/en.json'

function leaves(value: unknown, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>()
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, leaf] of leaves(child, prefix ? `${prefix}.${key}` : key))
        out.set(path, leaf)
    }
  } else {
    out.set(prefix, value)
  }
  return out
}

/** The named parts of an ICU message (arguments and rich-text tags), however deeply nested. */
function namesIn(message: string, locale: string): string[] {
  interface Node {
    type: number
    value?: string
    options?: Record<string, { value: Node[] }>
    children?: Node[]
  }
  const names = new Set<string>()
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      // 0 literal, 7 `#`; every other kind is named by its value.
      if (node.type !== 0 && node.type !== 7 && node.value !== undefined) names.add(node.value)
      for (const option of Object.values(node.options ?? {})) walk(option.value)
      walk(node.children ?? [])
    }
  }
  walk(new IntlMessageFormat(message, locale).getAst())
  return [...names].sort()
}

/**
 * Keys looked up with a runtime value (`t(code)`, `` t(`issues.${code}`) ``): each family's
 * keys are exactly the values the code can produce, so none is missing and none is dead.
 */
const FAMILIES: Record<string, readonly string[]> = {
  'status.capability': CAPABILITIES,
  'status.roomKind': ROOM_KINDS,
  'status.session': SESSION_STATUSES,
  'status.employment': EMPLOYMENT_STATES,
  'status.compliance': COMPLIANCE_STATUSES,
  'status.scope': REQUIREMENT_SCOPES,
  'status.role': ROLES,
  'users.detail.roleGrants': ROLES,
  'footer.access': ['VISITOR', ...ROLES],
  'advisor.remediation': REMEDIATIONS,
  // A booking's refusals, and why a whole request was turned away (the action guard's).
  'advisor.outcome.reasons': [
    ...ASSIGNMENT_FAILURES,
    'unauthorized',
    'rate_limited',
    'invalid',
    'failed',
  ],
  'import.issues': ISSUE_CODES,
  'import.kinds': DATASET_KINDS,
  // Issues name a column, or the whole row.
  'import.fields': [
    ...new Set([
      'row',
      ...Object.values(COLUMNS)
        .flat()
        .map(c => c.key),
    ]),
  ],
}

/** Families keyed by a type-only union, with no runtime list to compare against. */
const OPEN_FAMILIES = [
  'advisor.action.reasons',
  'advisor.views',
  'advisor.overbooked.refused',
  'planner.refused',
  'planner.problems',
  'import.upload.errors',
  'import.progress.errors',
  'errors.entity',
  'forms.errors',
  'landing.features',
  'landing.access',
  'archive.refused',
  'archive.fields',
  'archive.kinds',
]

/** Every string literal in the app's (non-test) source. */
function sourceLiterals(): Set<string> {
  const root = path.join(import.meta.dirname, '..')
  const literals = new Set<string>()
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue
    const text = readFileSync(path.join(entry.parentPath, entry.name), 'utf8')
    // Each kind of quote on its own pass, so a string inside a template literal counts too.
    for (const pattern of [/'([^'\n]*)'/g, /"([^"\n]*)"/g, /`([^`]*)`/g])
      for (const match of text.matchAll(pattern)) literals.add(match[1] ?? '')
  }
  return literals
}

describe('message catalogs', () => {
  const csLeaves = leaves(cs)
  const enLeaves = leaves(en)

  it('have the same keys in both locales', () => {
    expect([...csLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort())
  })

  it('have no empty strings', () => {
    for (const [path, value] of [...csLeaves, ...enLeaves]) {
      expect(typeof value === 'string' && value.trim() !== '', path).toBe(true)
    }
  })

  it('parse as ICU in both locales, with the same arguments and tags', () => {
    for (const [key, message] of enLeaves) {
      const czech = csLeaves.get(key)
      expect(namesIn(String(czech), 'cs'), key).toEqual(namesIn(String(message), 'en'))
    }
  })

  it('translate each runtime-keyed family exactly', () => {
    for (const [family, values] of Object.entries(FAMILIES)) {
      const keys = [...enLeaves.keys()]
        .filter(k => k.startsWith(`${family}.`))
        .map(k => k.slice(family.length + 1))
      expect(keys.sort(), family).toEqual([...values].sort())
    }
  })

  it('use every key: each is written in the source, or belongs to a runtime-keyed family', () => {
    const literals = sourceLiterals()
    const families = [...Object.keys(FAMILIES), ...OPEN_FAMILIES]
    for (const family of OPEN_FAMILIES)
      expect(
        [...enLeaves.keys()].some(k => k.startsWith(`${family}.`)),
        family
      ).toBe(true)
    // A key is written as its full path, or as the rest of it under a namespace (`t('x.y')`
    // after `useTranslations('a')` for `a.x.y`).
    const unused = [...enLeaves.keys()].filter(key => {
      if (families.some(f => key.startsWith(`${f}.`))) return false
      const parts = key.split('.')
      return !parts.some((_, i) => literals.has(parts.slice(i).join('.')))
    })
    expect(unused).toEqual([])
  })
})
