import { describe, expect, it } from 'vitest'

import { hasLeft, stateOf, stateWhere, stillEmployed } from './employment'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('leaving is a date', () => {
  it('reads where a person stands on a day', () => {
    expect(stateOf({ status: 'ACTIVE', leftOn: null }, '2026-10-17')).toBe('ACTIVE')
    expect(stateOf({ status: 'PARENTAL_LEAVE', leftOn: day('2026-10-18') }, '2026-10-17')).toBe(
      'PARENTAL_LEAVE'
    )
    expect(stateOf({ status: 'ACTIVE', leftOn: day('2026-10-17') }, '2026-10-17')).toBe('LEFT')
  })

  it('filters people at work and people gone by the same rule', () => {
    expect(stillEmployed('2026-10-17')).toEqual({
      OR: [{ leftOn: null }, { leftOn: { gt: day('2026-10-17') } }],
    })
    expect(hasLeft('2026-10-17')).toEqual({ leftOn: { lte: day('2026-10-17') } })
    expect(stateWhere('LEFT', '2026-10-17')).toEqual(hasLeft('2026-10-17'))
    expect(stateWhere('PARENTAL_LEAVE', '2026-10-17')).toEqual({
      status: 'PARENTAL_LEAVE',
      ...stillEmployed('2026-10-17'),
    })
  })
})
