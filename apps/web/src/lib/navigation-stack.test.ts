import { describe, expect, it } from 'vitest'

import {
  type HistoryEntry,
  isTransient,
  pageLabel,
  previousEntry,
  record,
  withTitle,
} from './navigation-stack'

const visit = (...hrefs: string[]) => hrefs.reduce<HistoryEntry[]>(record, [])

describe('record', () => {
  it('pushes new pages and ignores a reload of the current one', () => {
    expect(visit('/employees', '/employees/E1', '/employees/E1').map(e => e.href)).toEqual([
      '/employees',
      '/employees/E1',
    ])
  })

  it('pops when the visitor returns to the page before', () => {
    expect(visit('/employees?q=a', '/employees/E1', '/employees?q=a').map(e => e.href)).toEqual([
      '/employees?q=a',
    ])
  })

  it('drops a form from the path after saving (redirect back to the detail)', () => {
    const stack = visit(
      '/employees?department=Laboratoře',
      '/employees/E1',
      '/employees/E1/edit',
      '/employees/E1'
    )
    expect(stack.map(e => e.href)).toEqual(['/employees?department=Laboratoře', '/employees/E1'])
  })
})

describe('previousEntry', () => {
  it('names the page the visitor came from, with its query, and knows it is the browser back', () => {
    const stack = withTitle(
      visit('/employees?sort=compliance'),
      '/employees?sort=compliance',
      'Employees · Register'
    )
    const next = record(stack, '/employees/E1')
    expect(previousEntry(next, '/employees/E1')).toEqual({
      entry: { href: '/employees?sort=compliance', title: 'Employees · Register' },
      direct: true,
    })
  })

  it('answers before the current page is recorded (first render)', () => {
    expect(previousEntry(visit('/courses/BOZP-Z'), '/employees/E1')?.entry.href).toBe(
      '/courses/BOZP-Z'
    )
  })

  it('skips forms and repeats of the current page', () => {
    const stack = visit('/courses', '/courses/A/edit', '/employees/E1')
    expect(previousEntry(stack, '/employees/E1')).toEqual({
      entry: { href: '/courses', title: null },
      direct: false,
    })
  })

  it('has nothing for a page opened directly', () => {
    expect(previousEntry(visit('/employees/E1'), '/employees/E1')).toBeNull()
    expect(previousEntry([], '/employees/E1')).toBeNull()
  })
})

describe('helpers', () => {
  it('recognises forms and trims the site name from titles', () => {
    expect(isTransient('/sessions/T001/edit')).toBe(true)
    expect(isTransient('/employees/E1/completions/new?x=1')).toBe(true)
    expect(isTransient('/employees/E1')).toBe(false)
    expect(pageLabel('Alena Malá · Training register')).toBe('Alena Malá')
  })
})
