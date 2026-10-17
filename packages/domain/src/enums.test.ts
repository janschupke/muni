import { describe, expect, it } from 'vitest'

import { canWrite, employmentState, parseRole, roleMetadata, ROLES } from './enums'

describe('roles', () => {
  it.each([
    ['viewer', 'VIEWER'],
    [' Full ', 'FULL'],
    ['ADMIN', 'ADMIN'],
  ])('reads %j from Clerk metadata', (value, role) => {
    expect(parseRole(value)).toBe(role)
  })

  it.each([undefined, null, '', 'owner', 3, { role: 'admin' }])('has no role for %j', value => {
    expect(parseRole(value)).toBeNull()
  })

  it('writes metadata that reads back as the same role', () => {
    for (const role of ROLES) expect(parseRole(roleMetadata(role))).toBe(role)
    expect(roleMetadata('VIEWER')).toBe('viewer')
  })

  it('lets only admins write', () => {
    expect(ROLES.filter(canWrite)).toEqual(['ADMIN'])
  })
})

describe('employment state', () => {
  it('is the status until the leaving date, then LEFT', () => {
    expect(employmentState('ACTIVE', null, '2026-10-17')).toBe('ACTIVE')
    expect(employmentState('PARENTAL_LEAVE', '2026-12-31', '2026-10-17')).toBe('PARENTAL_LEAVE')
    // On the leaving date itself they are gone.
    expect(employmentState('ACTIVE', '2026-10-17', '2026-10-17')).toBe('LEFT')
    expect(employmentState('PARENTAL_LEAVE', '2020-01-01', '2026-10-17')).toBe('LEFT')
  })
})
