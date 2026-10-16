import { describe, expect, it } from 'vitest'

import { canWrite, parseRole, roleMetadata, ROLES } from './enums'

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
