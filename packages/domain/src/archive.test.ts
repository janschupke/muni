import { describe, expect, it } from 'vitest'

import { archiveTag, personRef, userRef } from './archive'

describe('archiveTag', () => {
  it('is six hex digits, stable for an id', () => {
    expect(archiveTag('cmb3x1y2z0000abcd')).toMatch(/^[0-9a-f]{6}$/)
    expect(archiveTag('cmb3x1y2z0000abcd')).toBe(archiveTag('cmb3x1y2z0000abcd'))
    // The empty id hashes to the FNV offset basis, 0x811c9dc5.
    expect(archiveTag('')).toBe('1c9dc5')
  })

  it('pins the hash, so tags never change between releases', () => {
    // FNV-1a 32 of "a" is 0xe40c292c; six digits keep its low 24 bits.
    expect(archiveTag('a')).toBe('0c292c')
  })

  it('tells different ids apart', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `cmemployee${String(i).padStart(4, '0')}`)
    expect(new Set(ids.map(archiveTag)).size).toBe(ids.length)
  })
})

describe('personRef', () => {
  const row = {
    id: 'cm-person-1',
    externalId: 'E0042',
    firstName: 'Tereza',
    lastName: 'Urbanová',
    archivedAt: null,
  }

  it('names an active person "Last First"', () => {
    expect(personRef(row)).toEqual({
      archived: false,
      externalId: 'E0042',
      name: 'Urbanová Tereza',
    })
  })

  it('keeps nothing of an archived person but the tag', () => {
    const extra = { ...row, email: 'tereza@vzorova.example', nationalId: '8551011234' }
    const ref = personRef({ ...extra, archivedAt: new Date('2026-10-20') })
    expect(ref).toEqual({ archived: true, tag: archiveTag('cm-person-1') })
    const text = JSON.stringify(ref)
    for (const value of ['E0042', 'Tereza', 'Urbanová', 'vzorova', '8551011234']) {
      expect(text).not.toContain(value)
    }
  })
})

describe('userRef', () => {
  const row = { id: 'cm-user-1', name: 'Jana Admin', email: 'jana@muni.example', archivedAt: null }

  it('passes an active user through', () => {
    expect(userRef(row)).toEqual({
      archived: false,
      id: 'cm-user-1',
      name: 'Jana Admin',
      email: 'jana@muni.example',
    })
  })

  it('reduces an archived user to the tag', () => {
    const ref = userRef({ ...row, archivedAt: new Date() })
    expect(Object.keys(ref).sort()).toEqual(['archived', 'tag'])
    expect(JSON.stringify(ref)).not.toMatch(/Jana|muni\.example|cm-user-1/)
  })
})
