import { describe, expect, it } from 'vitest'

import { displayName, sortName } from './names'

describe('names', () => {
  it('put the surname first in lists, and the first name first on a person’s own page', () => {
    const person = { firstName: 'Tereza', lastName: 'Urbanová' }
    expect(sortName(person)).toBe('Urbanová Tereza')
    expect(displayName(person)).toBe('Tereza Urbanová')
  })
})
