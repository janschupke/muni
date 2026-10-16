import { describe, expect, it } from 'vitest'

import { headOf } from './org'

interface Person {
  id: string
  managerId: string | null
  firstName: string
  lastName: string
}

const person = (id: string, managerId: string | null, lastName = id): Person => ({
  id,
  managerId,
  firstName: 'X',
  lastName,
})

const everyone = (people: Person[]) => new Map(people.map(p => [p.id, p]))

describe('headOf', () => {
  it('is the member with most members beneath them, not the one with most direct reports', () => {
    // The head leads two leads; one lead has four reports, more than the head's three.
    const head = person('head', 'director')
    const leadA = person('leadA', 'head')
    const leadB = person('leadB', 'head')
    const other = person('other', 'head')
    const team = ['a1', 'a2', 'a3', 'a4'].map(id => person(id, 'leadA'))
    const b1 = person('b1', 'leadB')
    const members = [head, leadA, leadB, other, ...team, b1]
    const director = person('director', null)
    expect(headOf(members, everyone([...members, director]))?.id).toBe('head')
  })

  it('falls back to the outside manager most members report to, and breaks ties by name', () => {
    const members = [person('m1', 'boss'), person('m2', 'boss'), person('m3', 'other')]
    const all = everyone([
      ...members,
      person('boss', null, 'Zelený'),
      person('other', null, 'Adámek'),
    ])
    expect(headOf(members, all)?.id).toBe('boss')
    const tie = [person('t1', 'boss'), person('t2', 'other')]
    expect(headOf(tie, all)?.id).toBe('other')
  })

  it('survives a reporting loop, and is nobody when nobody reports to anyone', () => {
    const loop = [person('a', 'b'), person('b', 'a'), person('c', 'a')]
    expect(headOf(loop, everyone(loop))?.id).toBe('a')
    const flat = [person('a', null), person('b', null)]
    expect(headOf(flat, everyone(flat))).toBeNull()
    // A manager who has left (not loaded) is nobody's head.
    const orphaned = [person('a', 'gone')]
    expect(headOf(orphaned, everyone(orphaned))).toBeNull()
  })
})
