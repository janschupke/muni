import { readFileSync } from 'node:fs'

import { beforeAll, describe, expect, it } from 'vitest'

import { editCell, parseFile, setRemoved, summarize } from './batch'
import { EMPTY_REFERENCE, type ImportBatch, type ParsedFile, type ParsedRow } from './types'
import { validateBatch } from './validate'

// These tests run the importer over the verbatim source files in /data.
// They pin the exact outcome for every defect found while profiling the exports.

const ctx = { today: '2026-10-16' }
const FILES = {
  courses: 'katalog_skoleni.csv',
  employees: 'zamestnanci.csv',
  sessions: 'terminy_skoleni.csv',
  completions: 'absolvovana_skoleni.csv',
} as const

const read = (name: string) => readFileSync(new URL(`../../../data/${name}`, import.meta.url))

let files: Record<keyof typeof FILES, ParsedFile>
let batch: ImportBatch

beforeAll(() => {
  files = Object.fromEntries(
    Object.entries(FILES).map(([kind, name]) => [kind, parseFile(name, read(name), ctx)])
  ) as typeof files
  batch = validateBatch(
    {
      courses: files.courses.rows as ImportBatch['courses'],
      employees: files.employees.rows as ImportBatch['employees'],
      sessions: files.sessions.rows as ImportBatch['sessions'],
      completions: files.completions.rows as ImportBatch['completions'],
    },
    EMPTY_REFERENCE
  )
})

const codesOf = (row: ParsedRow<unknown>) => [...row.errors, ...row.warnings].map(i => i.code)
const byId = <T>(rows: ParsedRow<T>[] | undefined, id: string, key = 'externalId') => {
  const row = rows?.find(r => r.raw[key] === id)
  if (!row) throw new Error(`row ${id} not found`)
  return row
}

describe('file detection', () => {
  it('identifies each file by its header, not its name', () => {
    expect(files.courses.kind).toBe('courses')
    expect(files.employees.kind).toBe('employees')
    expect(files.sessions.kind).toBe('sessions')
    expect(files.completions.kind).toBe('completions')
  })

  it('detects encoding and delimiter per file', () => {
    expect([files.employees.encoding, files.employees.delimiter]).toEqual(['utf-8', ','])
    expect([files.sessions.encoding, files.sessions.delimiter]).toEqual(['utf-8', ';'])
    expect([files.completions.encoding, files.completions.delimiter]).toEqual(['windows-1250', ';'])
  })

  it('decodes Windows-1250 names correctly', () => {
    expect(byId(batch.completions, 'Z000001').raw.employeeName).toBe('Vacková Hana')
  })

  it('skips blank lines, the repeated header and the comment line', () => {
    expect(files.completions.skipped).toEqual({ blankLines: 3, repeatedHeaders: 1, comments: 1 })
  })

  it('rejects a file it cannot identify', () => {
    const file = parseFile('x.csv', new TextEncoder().encode('foo;bar\n1;2'), ctx)
    expect(file.error).toBe('UNRECOGNIZED_FILE')
  })
})

describe('courses', () => {
  it('parses the requirement mini-language', () => {
    expect(byId(batch.courses, 'PRV-POM', 'code').data?.requirements).toEqual([
      { scope: 'DEPARTMENT', department: 'Laboratoře' },
      { scope: 'DEPARTMENT', department: 'Správa budov' },
      { scope: 'DEPARTMENT', department: 'Knihovna' },
    ])
    expect(byId(batch.courses, 'RIDIC', 'code').data?.requirements).toEqual([
      { scope: 'POSITION', position: 'Řidič' },
    ])
    expect(byId(batch.courses, 'ANGL', 'code').data?.requirements).toEqual([])
  })

  it('normalises validity', () => {
    expect(byId(batch.courses, 'ZDVIH', 'code').data?.validityMonths).toBe(24)
    expect(codesOf(byId(batch.courses, 'ZDVIH', 'code'))).toEqual(['VALIDITY_NORMALIZED'])
    expect(byId(batch.courses, 'LEAD', 'code').data?.validityMonths).toBeNull()
    expect(codesOf(byId(batch.courses, 'LEAD', 'code'))).toEqual(['VALIDITY_NONE'])
  })
})

describe('employees', () => {
  it('rejects duplicate people found by email and by national ID', () => {
    for (const [dup, survivor] of [
      ['E1000', 'E0155'],
      ['E1001', 'E0042'],
      ['E1002', 'E0124'],
      ['E1003', 'E0070'],
    ]) {
      const row = byId(batch.employees, dup as string)
      expect(row.isValid).toBe(false)
      expect(row.errors[0]).toMatchObject({
        code: 'DUPLICATE_PERSON',
        params: { otherId: survivor },
      })
    }
  })

  it('canonicalises department spellings', () => {
    const departments = new Set(
      batch.employees?.flatMap(r => (r.data?.department ? [r.data.department] : []))
    )
    expect([...departments].sort()).toEqual([
      'Ekonomické oddělení',
      'IT oddělení',
      'Knihovna',
      'Laboratoře',
      'Marketing',
      'Personální oddělení',
      'Správa budov',
      'Studijní oddělení',
      'Vedení',
    ])
    expect(byId(batch.employees, 'E0003').data?.department).toBe('Studijní oddělení')
  })

  it('fixes names and emails, drops what cannot be fixed', () => {
    expect(byId(batch.employees, 'E0020').data?.firstName).toBe('Lucie')
    expect(byId(batch.employees, 'E0002').data?.email).toBe('tereza.jandova@vzorova.example')
    expect(byId(batch.employees, 'E0121').data?.email).toBeNull()
    expect(codesOf(byId(batch.employees, 'E0121'))).toContain('INVALID_EMAIL')
  })

  it('neutralises formula payloads in notes', () => {
    const row = byId(batch.employees, 'E0153')
    expect(row.data?.note).toBe(
      'HYPERLINK("https://example.com/prihlaseni";"Klikněte pro ověření")'
    )
    expect(codesOf(row)).toContain('FORMULA_STRIPPED')
  })

  it('clears a manager who does not exist', () => {
    const row = byId(batch.employees, 'E0023')
    expect(row.data?.managerEmail).toBeNull()
    expect(codesOf(row)).toContain('MANAGER_NOT_FOUND')
  })

  it('keeps the national ID in a canonical shape', () => {
    expect(byId(batch.employees, 'E0001').data?.nationalId).toBe('665917/0359')
  })
})

describe('sessions', () => {
  it('rejects an unknown course code and an impossible date', () => {
    expect(byId(batch.sessions, 'T010').errors).toMatchObject([{ code: 'COURSE_NOT_FOUND' }])
    expect(byId(batch.sessions, 'T014').errors).toMatchObject([{ code: 'INVALID_DATE' }])
  })

  it('warns about duplicates, overbooking and zero capacity but imports them', () => {
    expect(byId(batch.sessions, 'T009')).toMatchObject({
      isValid: true,
      warnings: [{ code: 'DUPLICATE_SLOT' }],
    })
    // No rooms file: each place becomes a room, announced on its first session.
    expect(byId(batch.sessions, 'T001').warnings).toMatchObject([
      { code: 'ROOM_DERIVED', params: { value: 'Aula A' } },
    ])
    expect(byId(batch.sessions, 'T016').warnings).toMatchObject([{ code: 'OVERBOOKED' }])
    expect(byId(batch.sessions, 'T026').warnings).toMatchObject([{ code: 'ZERO_CAPACITY' }])
  })

  it('parses prices with a currency suffix and resolves Prague times', () => {
    expect(byId(batch.sessions, 'T033').data).toMatchObject({
      pricePerPerson: 2100,
      startTime: '07:30',
      endTime: '15:30',
    })
    expect(byId(batch.sessions, 'T006').data?.location).toBe('Online')
    expect(byId(batch.sessions, 'T017').data?.status).toBe('CANCELLED')
  })
})

describe('completions', () => {
  it('rejects the second copy of a duplicated record ID', () => {
    const copies = batch.completions?.filter(r => r.raw.externalId === 'Z000052') ?? []
    expect(copies.map(r => r.isValid)).toEqual([true, false])
    expect(copies[1]?.errors).toMatchObject([{ code: 'DUPLICATE_ID', params: { firstRow: 53 } }])
  })

  it('rejects unknown employees and unknown course codes', () => {
    const unknown =
      batch.completions?.filter(r => (r.raw.employeeExternalId ?? '').startsWith('E9')) ?? []
    expect(unknown).toHaveLength(9)
    expect(unknown.every(r => codesOf(r).includes('EMPLOYEE_NOT_FOUND'))).toBe(true)

    const codes = batch.completions
      ?.filter(r => codesOf(r).includes('COURSE_NOT_FOUND'))
      .map(r => r.data?.courseCode ?? (r.raw.courseCode ?? '').trim())
    expect(new Set(codes)).toEqual(new Set(['BOZP-X', 'GDPR-2', 'KYB3R']))
  })

  it("remaps a duplicate person's records to the survivor", () => {
    const remapped = batch.completions?.filter(r => r.raw.employeeExternalId === 'E1000') ?? []
    expect(remapped.length).toBeGreaterThan(0)
    for (const row of remapped) {
      expect(row.data?.employeeExternalId).toBe('E0155')
      expect(codesOf(row)).toContain('EMPLOYEE_REMAPPED')
    }
  })

  it('normalises course code variants', () => {
    const variants = batch.completions?.filter(r =>
      ['BOZP_Z', 'bozp-z', 'BOZP Z', ' BOZP-Z'].includes(r.raw.courseCode ?? '')
    )
    expect(variants?.length).toBeGreaterThan(0)
    expect(variants?.every(r => r.data?.courseCode === 'BOZP-Z')).toBe(true)
  })

  it('rejects placeholder dates and negative prices, warns on Excel serials', () => {
    expect(byId(batch.completions, 'Z000001').errors).toMatchObject([{ code: 'PLACEHOLDER_DATE' }])
    expect(byId(batch.completions, 'Z000471')).toMatchObject({
      isValid: true,
      data: { completedOn: '2019-03-28' },
    })
    const negative = batch.completions?.filter(r => (r.raw.price ?? '').startsWith('-')) ?? []
    expect(negative.every(r => codesOf(r).includes('NEGATIVE_PRICE'))).toBe(true)
  })

  it('rejects the totals footer', () => {
    expect(batch.completions?.at(-1)?.errors).toMatchObject([{ code: 'SUMMARY_ROW' }])
  })

  it('parses multi-line quoted notes into one row', () => {
    expect(byId(batch.completions, 'Z001099').data?.note).toBe('Vedoucí potvrdil;\npředáno HR')
  })

  it('canonicalises provider spellings', () => {
    const providers = new Set(
      batch.completions?.flatMap(r => (r.data?.provider ? [r.data.provider] : []))
    )
    expect([...providers].sort()).toEqual([
      'E-learning portál',
      'Externí lektor',
      'Interní školitel',
      'Vzorový školicí ústav',
    ])
  })
})

describe('regression baseline', () => {
  // Changing any normaliser moves these numbers; update them deliberately.
  it('matches the known totals', () => {
    expect(summarize(batch.courses ?? [])).toEqual({
      total: 10,
      valid: 10,
      invalid: 0,
      warnings: 2,
      removed: 0,
    })
    expect(summarize(batch.employees ?? [])).toEqual({
      total: 174,
      valid: 170,
      invalid: 4,
      warnings: 31,
      removed: 0,
    })
    expect(summarize(batch.sessions ?? [])).toEqual({
      total: 34,
      valid: 32,
      invalid: 2,
      // Seven of the eight places get a room created from their first session (one first
      // session already carries another warning).
      warnings: 11,
      removed: 0,
    })
    expect(summarize(batch.completions ?? [])).toEqual({
      total: 2866,
      valid: 2822,
      invalid: 44,
      warnings: 109,
      removed: 0,
    })
  })
})

describe('row operations', () => {
  it('re-validates the whole batch after an inline edit', () => {
    const index = batch.sessions?.findIndex(r => r.raw.externalId === 'T010') ?? -1
    const fixed = editCell(batch, 'sessions', index, 'courseCode', 'KYBER', ctx, EMPTY_REFERENCE)
    const row = fixed.sessions?.[index]
    expect(row).toMatchObject({ isValid: true, isEdited: true })

    const reverted = editCell(fixed, 'sessions', index, 'courseCode', 'KYB3R', ctx, EMPTY_REFERENCE)
    expect(reverted.sessions?.[index]).toMatchObject({ isValid: false, isEdited: false })
  })

  it('removing an employee invalidates their completions', () => {
    const index = batch.employees?.findIndex(r => r.raw.externalId === 'E0131') ?? -1
    const next = setRemoved(batch, 'employees', index, true, EMPTY_REFERENCE)
    const theirs =
      next.completions?.filter(
        r => r.data?.employeeExternalId === 'E0131' || r.raw.employeeExternalId === 'E0131'
      ) ?? []
    expect(theirs.length).toBeGreaterThan(0)
    expect(theirs.every(r => codesOf(r).includes('EMPLOYEE_NOT_FOUND') || !r.isValid)).toBe(true)
  })

  it('resolves references against the database snapshot', () => {
    const completionsOnly = validateBatch(
      { completions: files.completions.rows as ImportBatch['completions'] },
      {
        ...EMPTY_REFERENCE,
        courses: [{ code: 'GDPR', validityMonths: 36 }],
        employees: [{ externalId: 'E0063', email: null, fullName: 'Nováková Klára' }],
      }
    )
    expect(byId(completionsOnly.completions, 'Z000004').isValid).toBe(true)
    expect(codesOf(byId(completionsOnly.completions, 'Z000005'))).toContain('COURSE_NOT_FOUND')
  })
})
