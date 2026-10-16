import { describe, expect, it } from 'vitest'

import { mapRow } from './batch'
import type { DatasetKind, RowMapResult } from './types'

// One row at a time, through the same mapper the upload uses. Values are spelled the way
// the source exports spell them (diacritics, stray spaces, Czech number formats).

const ctx = { today: '2026-10-16' }

/** "field:CODE" for every issue, in the order raised. */
const codes = (result: RowMapResult<unknown>) => result.issues.map(i => `${i.field}:${i.code}`)

const map = <K extends DatasetKind>(kind: K, raw: Record<string, string>) => mapRow(kind, raw, ctx)

describe('courses', () => {
  const course = (raw: Record<string, string>) =>
    map('courses', { code: 'BOZP-Z', name: 'BOZP – základní školení', ...raw })

  it.each([
    ['', null, []],
    ['24', 24, []],
    ['0', null, ['validity:VALIDITY_NONE']],
    ['2 roky', 24, ['validity:VALIDITY_NORMALIZED']],
    ['18 měsíců', 18, ['validity:VALIDITY_NORMALIZED']],
  ])('validity %j → %s months', (validity, months, issues) => {
    const result = course({ validity })
    expect(result.data?.validityMonths).toBe(months)
    expect(codes(result)).toEqual(issues)
  })

  it('rejects a validity it cannot read', () => {
    expect(codes(course({ validity: 'navždy' }))).toEqual(['validity:INVALID_VALIDITY'])
  })

  it.each([
    ['', []],
    ['NEPOVINNÉ', []],
    ['všichni', [{ scope: 'ALL' }]],
    [
      'ÚTVAR: Laboratoře; IT oddělení',
      [
        { scope: 'DEPARTMENT', department: 'Laboratoře' },
        { scope: 'DEPARTMENT', department: 'IT oddělení' },
      ],
    ],
    ['POZICE:Vedoucí oddělení', [{ scope: 'POSITION', position: 'Vedoucí oddělení' }]],
  ])('requirement %j', (requiredFor, requirements) => {
    expect(course({ requiredFor }).data?.requirements).toEqual(requirements)
  })

  it('rejects requirements outside the mini-language, or naming nobody', () => {
    expect(codes(course({ requiredFor: 'tým: noví' }))).toEqual(['requiredFor:INVALID_REQUIREMENT'])
    expect(codes(course({ requiredFor: 'ÚTVAR: ;' }))).toEqual(['requiredFor:INVALID_REQUIREMENT'])
  })

  it('normalises a code, and refuses one that cannot be a code', () => {
    const normalised = course({ code: ' bozp_z ' })
    expect(normalised.data?.code).toBe('BOZP-Z')
    expect(codes(normalised)).toEqual(['code:CODE_NORMALIZED'])
    expect(codes(course({ code: '1-BOZP' }))).toEqual(['code:INVALID_CODE'])
    expect(codes(course({ code: '', name: '' }))).toEqual(['code:REQUIRED', 'name:REQUIRED'])
  })

  it('rejects a spreadsheet footer as a whole row', () => {
    expect(codes(course({ code: 'Celkem' }))).toEqual(['row:SUMMARY_ROW'])
  })
})

describe('sessions', () => {
  const session = (raw: Record<string, string>) =>
    map('sessions', {
      externalId: 'T040',
      courseCode: 'BOZP-Z',
      date: '4. 11. 2026',
      time: '08:00-11:00',
      location: 'Aula A',
      capacity: '30',
      bookedCount: '12',
      price: '450,- Kč',
      status: 'plánováno',
      ...raw,
    })

  it('reads a clean row', () => {
    expect(session({ externalId: 't040' }).data).toMatchObject({
      externalId: 'T040',
      date: '2026-11-04',
      startTime: '08:00',
      endTime: '11:00',
      pricePerPerson: 450,
      status: 'PLANNED',
    })
  })

  it('reads statuses and a missing booked count; refuses the app’s own IDs', () => {
    expect(session({ status: '' }).data?.status).toBe('PLANNED')
    expect(session({ status: 'Zrušeno' }).data?.status).toBe('CANCELLED')
    // S… sessions were created in the app: an export may not overwrite them.
    expect(codes(session({ externalId: 'S001' }))).toEqual(['externalId:RESERVED_ID'])
    expect(session({ bookedCount: '' }).data?.bookedCount).toBe(0)
    expect(codes(session({ status: 'odloženo' }))).toEqual(['status:INVALID_STATUS'])
  })

  it('warns on zero capacity and overbooking', () => {
    expect(codes(session({ capacity: '0', bookedCount: '0' }))).toEqual(['capacity:ZERO_CAPACITY'])
    expect(codes(session({ bookedCount: '31' }))).toEqual(['bookedCount:OVERBOOKED'])
  })

  it.each([
    [{ time: '9-12' }, ['time:INVALID_TIME']],
    [{ time: '' }, ['time:REQUIRED']],
    [{ location: '' }, ['location:REQUIRED']],
    [{ capacity: 'hodně' }, ['capacity:INVALID_NUMBER']],
    [{ capacity: '' }, ['capacity:REQUIRED']],
    [{ date: '1900-01-01' }, ['date:PLACEHOLDER_DATE']],
    [{ date: '31. 9. 2026' }, ['date:INVALID_DATE']],
    [{ date: '' }, ['date:REQUIRED']],
    [{ price: '-450' }, ['price:NEGATIVE_PRICE']],
    [{ price: 'dohodou' }, ['price:INVALID_PRICE']],
    [{ externalId: '' }, ['externalId:REQUIRED']],
  ])('%j → %j', (raw, issues) => {
    const result = session(raw)
    expect(result.data).toBeNull()
    expect(codes(result)).toEqual(issues)
  })

  it('keeps fixable values with a warning', () => {
    expect(codes(session({ price: 'zdarma' }))).toEqual(['price:FREE_PRICE'])
    const serial = session({ date: '46330' })
    expect(serial.data?.date).toBe('2026-11-04')
    expect(codes(serial)).toEqual(['date:EXCEL_SERIAL_DATE'])
    expect(session({ price: '' }).data?.pricePerPerson).toBeNull()
  })

  it('rejects a footer and a row the schema refuses', () => {
    expect(codes(session({ externalId: 'Součet' }))).toEqual(['row:SUMMARY_ROW'])
    // The id passes the field parser but not the domain schema: the final gate names it.
    expect(codes(session({ externalId: 'TERMIN-1' }))).toEqual(['externalId:INVALID_VALUE'])
  })
})

describe('employees', () => {
  const employee = (raw: Record<string, string>) =>
    map('employees', {
      externalId: 'E0153',
      firstName: 'Marie',
      lastName: 'Černá',
      email: 'marie.cerna@vzorova.example',
      department: 'Laboratoře',
      position: 'Laborantka',
      managerEmail: '',
      hiredOn: '1. 3. 2019',
      leftOn: '',
      status: 'aktivní',
      nationalId: '',
      note: '',
      ...raw,
    })

  it('refuses the IDs the app gives the people it adds', () => {
    // N… people were added in the app: an export may not overwrite them.
    expect(codes(employee({ externalId: 'N0001' }))).toEqual(['externalId:RESERVED_ID'])
  })

  it('title-cases names written in one case, and trusts mixed case', () => {
    const shouted = employee({ firstName: 'MARIE', lastName: 'černá' })
    expect(shouted.data).toMatchObject({ firstName: 'Marie', lastName: 'Černá' })
    expect(codes(shouted)).toEqual(['firstName:NAME_NORMALIZED', 'lastName:NAME_NORMALIZED'])
    expect(employee({ lastName: 'McKenzie' }).data?.lastName).toBe('McKenzie')
  })

  it('tidies email addresses, and drops ones that are not addresses', () => {
    const spaced = employee({ email: ' Marie.Cerna @Vzorova.example' })
    expect(spaced.data?.email).toBe('marie.cerna@vzorova.example')
    expect(codes(spaced)).toEqual(['email:EMAIL_NORMALIZED'])
    const broken = employee({ email: 'marie.cerna(at)vzorova' })
    expect(broken.data?.email).toBeNull()
    expect(codes(broken)).toEqual(['email:INVALID_EMAIL'])
  })

  it.each([
    ['', null, []],
    ['665917/0359', '665917/0359', []],
    ['6659170359', '665917/0359', []],
    // Women: month + 50; the post-2004 extension: month + 20.
    ['995512/1234', '995512/1234', []],
    ['047220/1234', '047220/1234', []],
    ['12345', null, ['nationalId:NATIONAL_ID_INVALID']],
    ['991340/1234', '991340/1234', ['nationalId:NATIONAL_ID_INVALID']],
  ])('birth number %j', (nationalId, value, issues) => {
    const result = employee({ nationalId })
    expect(result.data?.nationalId).toBe(value)
    expect(codes(result)).toEqual(issues)
  })

  it('reads statuses and checks them against the dates', () => {
    expect(employee({ status: 'Rodičovská' }).data?.status).toBe('PARENTAL_LEAVE')
    expect(codes(employee({ status: 'ukončen' }))).toEqual(['leftOn:STATUS_DATE_MISMATCH'])
    expect(codes(employee({ status: 'aktivní', leftOn: '2026-01-31' }))).toEqual([
      'status:STATUS_DATE_MISMATCH',
    ])
    expect(codes(employee({ status: 'pryč' }))).toEqual(['status:INVALID_STATUS'])
    expect(codes(employee({ status: '' }))).toEqual(['status:REQUIRED'])
    // A row already in error gets no extra status advice.
    expect(codes(employee({ status: 'ukončen', hiredOn: '' }))).toEqual(['hiredOn:REQUIRED'])
  })

  it('collapses whitespace in names of departments, and lets the schema catch the rest', () => {
    expect(employee({ department: 'Správa   budov' }).data?.department).toBe('Správa budov')
    expect(codes(employee({ leftOn: '2018-01-01', status: 'ukončen' }))).toEqual([
      'leftOn:INVALID_VALUE',
    ])
    expect(codes(employee({ firstName: '' }))).toEqual(['firstName:REQUIRED'])
    expect(codes(employee({ externalId: 'Celkem' }))).toEqual(['row:SUMMARY_ROW'])
  })

  it('reads a row with columns missing as empty cells', () => {
    const result = mapRow(
      'employees',
      {
        externalId: 'E0153',
        firstName: 'Marie',
        lastName: 'Černá',
        hiredOn: '2019-03-01',
        status: 'aktivní',
      },
      ctx
    )
    expect(result.data).toMatchObject({ email: null, nationalId: null, note: null })
  })

  it('neutralises a formula in a note', () => {
    const result = employee({ note: '=HYPERLINK("https://example.com";"Klikněte")' })
    expect(result.data?.note).toBe('HYPERLINK("https://example.com";"Klikněte")')
    expect(codes(result)).toEqual(['note:FORMULA_STRIPPED'])
  })
})

describe('completions', () => {
  const completion = (raw: Record<string, string>) =>
    map('completions', {
      externalId: 'z000001',
      employeeExternalId: 'e0153',
      employeeName: 'Černá Marie',
      courseCode: 'BOZP-Z',
      completedOn: '5. 11. 2024',
      validUntil: '5. 11. 2026',
      provider: 'Bezpečná firma s.r.o.',
      price: '450',
      note: '',
      ...raw,
    })

  it('upper-cases identifiers', () => {
    expect(completion({}).data).toMatchObject({
      externalId: 'Z000001',
      employeeExternalId: 'E0153',
    })
  })

  it('rejects validity before completion, and warns on a future completion', () => {
    expect(codes(completion({ validUntil: '1. 1. 2024' }))).toEqual([
      'validUntil:VALIDITY_BEFORE_COMPLETION',
    ])
    expect(codes(completion({ completedOn: '2026-12-01', validUntil: '' }))).toEqual([
      'completedOn:FUTURE_COMPLETION',
    ])
  })

  it('requires its identifiers and rejects a footer', () => {
    expect(codes(completion({ externalId: '', employeeExternalId: '' }))).toEqual([
      'externalId:REQUIRED',
      'employeeExternalId:REQUIRED',
    ])
    expect(codes(completion({ externalId: 'Celkem' }))).toEqual(['row:SUMMARY_ROW'])
  })
})
