import { describe, expect, it } from 'vitest'

import { listQuery, parseList, withParams } from './search-params'

const KEYS = ['name', 'department'] as const

describe('parseList', () => {
  it('reads a known column, its direction and the page', () => {
    expect(parseList({ sort: 'department', dir: 'desc', page: '3' }, KEYS)).toEqual({
      sort: 'department',
      dir: 'desc',
      page: 3,
    })
    expect(parseList({ sort: ['name', 'department'], dir: 'up' }, KEYS)).toEqual({ sort: 'name' })
  })

  it('leaves out what is the list without it: no sort, page 1, nonsense', () => {
    expect(parseList({ sort: 'salary', dir: 'desc', page: '1' }, KEYS)).toEqual({})
    expect(parseList({ dir: 'desc', page: 'x' }, KEYS)).toEqual({})
    expect(parseList({ page: '-2' }, KEYS)).toEqual({})
  })

  it('reads a page’s second list by its own names', () => {
    const params = { sort: 'name', completionsSort: 'department', completionsPage: '2' }
    expect(parseList(params, KEYS, 'completions')).toEqual({
      completionsSort: 'department',
      completionsPage: 2,
    })
    expect(listQuery(parseList(params, KEYS, 'completions'), KEYS, 'completions')).toEqual({
      page: 2,
      sort: { by: 'department', desc: false },
    })
    expect(listQuery({}, KEYS)).toEqual({ page: 1, sort: undefined })
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
