import { ISSUE_CODES } from '@muni/importer'
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

  it('translate every importer issue code', () => {
    for (const code of ISSUE_CODES) {
      expect(enLeaves.has(`import.issues.${code}`), code).toBe(true)
    }
  })
})
