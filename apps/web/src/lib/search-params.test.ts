import { describe, expect, it } from 'vitest'

import { parseSort, withParams } from './search-params'

const KEYS = ['name', 'department'] as const

describe('parseSort', () => {
  it('reads a known key and its direction', () => {
    expect(parseSort({ sort: 'department', dir: 'desc' }, KEYS)).toEqual({
      by: 'department',
      desc: true,
    })
    expect(parseSort({ sort: 'name' }, KEYS)).toEqual({ by: 'name', desc: false })
    expect(parseSort({ sort: ['name', 'department'], dir: 'up' }, KEYS)).toEqual({
      by: 'name',
      desc: false,
    })
  })

  it('ignores unknown or missing keys', () => {
    expect(parseSort({ sort: 'salary', dir: 'desc' }, KEYS)).toBeUndefined()
    expect(parseSort({ dir: 'desc' }, KEYS)).toBeUndefined()
    expect(parseSort({ sort: '' }, KEYS)).toBeUndefined()
  })
})

describe('withParams', () => {
  it('keeps the sort when a page link is built, and drops emptied keys', () => {
    const query = { department: 'Laboratoře', sort: 'name', dir: 'desc', q: undefined }
    expect(withParams('/employees', query, { page: 2 })).toBe(
      '/employees?department=Laborato%C5%99e&sort=name&dir=desc&page=2'
    )
    expect(withParams('/employees', query, { sort: undefined, dir: undefined })).toBe(
      '/employees?department=Laborato%C5%99e'
    )
  })
})
