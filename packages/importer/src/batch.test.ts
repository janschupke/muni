import { describe, expect, it } from 'vitest'

import {
  committable,
  editCell,
  parseFile,
  revertRow,
  setRemoved,
  summarize,
  type ImportContext,
} from './batch'
import { EMPTY_REFERENCE, type ImportBatch, type ParsedRow, type ReferenceSnapshot } from './types'
import { validateBatch } from './validate'

const ctx: ImportContext = { today: '2026-10-16' }
const encode = (text: string) => new TextEncoder().encode(text)
const file = (name: string, lines: string[]) => parseFile(name, encode(lines.join('\r\n')), ctx)
const codesOf = (row: ParsedRow<unknown> | undefined) =>
  [...(row?.errors ?? []), ...(row?.warnings ?? [])].map(i => `${i.field}:${i.code}`)

const COURSES = [
  'kod,nazev,platnost_mesicu,povinne_pro',
  'BOZP-Z,BOZP – základní školení,24,VSICHNI',
  'LAB-BEZ,Bezpečná práce v laboratoři,12,UTVAR:Laboratoře;Archiv',
  'LEAD,Základy vedení lidí,,POZICE:Ředitel',
  'ANGL,Anglický jazyk – kurz,0,NEPOVINNE',
]
const EMPLOYEES = [
  'id_zamestnance,jmeno,prijmeni,email,utvar,pozice,vedouci_email,datum_nastupu,stav',
  'E0001,Marie,Černá,marie.cerna@vzorova.example,Laboratoře,Laborantka,,2019-03-01,aktivní',
  'E0002,Petr,Adámek,petr.adamek@vzorova.example,laboratore,Laborantka,nikdo@vzorova.example,2020-01-01,aktivní',
  // The same person again under a new id (same email): rejected, records remapped.
  'E0003,Marie,Černá,marie.cerna@vzorova.example,Laboratoře,Laborantka,,2021-01-01,aktivní',
]

function parsed(): ImportBatch {
  return {
    courses: file('katalog.csv', COURSES).rows as ImportBatch['courses'],
    employees: file('zamestnanci.csv', EMPLOYEES).rows as ImportBatch['employees'],
    sessions: file('terminy.csv', [
      'id_terminu;kod_skoleni;datum;cas;misto;kapacita;obsazeno',
      'T001;BOZP-Z;2026-11-04;08:00-11:00;Aula A;30;12',
      'T001;BOZP-Z;2026-11-05;08:00-11:00;Aula A;30;12',
      'T002;BOZP-Z;2026-11-04;08:00-11:00;aula a;30;0',
      'T003;KYB3R;2026-11-04;08:00-11:00;Aula B;30;0',
    ]).rows as ImportBatch['sessions'],
    completions: file('absolvovana.csv', [
      'id_zaznamu;id_zamestnance;zamestnanec;kod_skoleni;datum_absolvovani;platnost_do;poskytovatel',
      'Z000001;E0001;Černá Marie;BOZP-Z;2024-11-05;;Bezpečná firma s.r.o.',
      'Z000002;E0003;Marie Černá;BOZP-Z;2024-11-05;2026-11-01;bezpecna firma s.r.o.',
      'Z000003;E0001;Novák Jan;LEAD;2024-11-05;;',
      'Z000004;E9001;;BOZP-Z;2024-11-05;;',
      'Z000005;E0001;;KYB3R;2024-11-05;;',
      'Z000001;E0001;;ANGL;2024-11-05;;',
      'Z000006;E0500;Šimková Eva;GDPR;2024-11-05;;',
    ]).rows as ImportBatch['completions'],
  }
}

const reference: ReferenceSnapshot = {
  ...EMPTY_REFERENCE,
  courses: [{ code: 'GDPR', validityMonths: 24 }],
  rooms: ['Aula A'],
  employees: [
    { externalId: 'E0500', email: 'eva.simkova@vzorova.example', fullName: 'Šimková Eva' },
  ],
}

describe('parseFile', () => {
  it('reports an empty, unrecognised or incomplete file instead of rows', () => {
    expect(file('prazdny.csv', ['', '  ']).error).toBe('EMPTY_FILE')
    const unknown = file('jiny.csv', ['jmeno_psa,plemeno', 'Rex,ovčák'])
    expect([unknown.error, unknown.unknownColumns]).toEqual([
      'UNRECOGNIZED_FILE',
      ['jmeno_psa', 'plemeno'],
    ])
    const partial = file('terminy.csv', [
      'id_terminu;kod_skoleni;datum;cas',
      'T001;BOZP-Z;2026-11-04;08:00-11:00',
    ])
    expect([partial.kind, partial.error, partial.missingColumns]).toEqual([
      'sessions',
      'MISSING_COLUMNS',
      ['location', 'capacity'],
    ])
  })

  it('skips blank lines, comments and repeated headers, and rejects overlong rows', () => {
    const parsedFile = file('katalog.csv', [
      COURSES[0] ?? '',
      '# export z 1. 10. 2026',
      COURSES[1] ?? '',
      '',
      COURSES[0] ?? '',
      'GDPR,Ochrana osobních údajů,24,VSICHNI,navíc,ještě',
    ])
    expect(parsedFile.skipped).toEqual({ blankLines: 1, repeatedHeaders: 1, comments: 1 })
    expect(parsedFile.rows).toHaveLength(2)
    // Raised while parsing; it reaches `errors` once the batch is validated.
    expect(parsedFile.rows[1]?.base).toMatchObject({
      data: null,
      issues: [{ code: 'TOO_MANY_CELLS', params: { expected: 4, actual: 6 } }],
    })
  })
})

describe('validateBatch', () => {
  const batch = validateBatch(parsed(), reference)
  const course = (code: string) =>
    batch.courses?.find(r => r.data?.code === code || r.raw.code === code)
  const row = (kind: 'employees' | 'sessions' | 'completions', id: string, n = 0) =>
    batch[kind]?.filter(r => (r.raw.externalId ?? r.raw.id_zaznamu) === id)[n] as ParsedRow<unknown>

  it('warns about requirement targets nobody belongs to, and unifies spellings', () => {
    expect(codesOf(course('LAB-BEZ'))).toEqual(['requiredFor:UNKNOWN_DEPARTMENT'])
    expect(codesOf(course('LEAD'))).toEqual(['requiredFor:UNKNOWN_POSITION'])
    expect(codesOf(row('employees', 'E0002'))).toEqual([
      'department:VALUE_NORMALIZED',
      'managerEmail:MANAGER_NOT_FOUND',
    ])
    expect(row('employees', 'E0002').data).toMatchObject({
      department: 'Laboratoře',
      managerEmail: null,
    })
  })

  it('rejects the same person twice and remaps their records', () => {
    expect(codesOf(row('employees', 'E0003'))).toEqual(['row:DUPLICATE_PERSON'])
    expect(codesOf(row('completions', 'Z000002'))).toEqual([
      'employeeExternalId:EMPLOYEE_REMAPPED',
      'validUntil:VALIDITY_MISMATCH',
      'provider:VALUE_NORMALIZED',
    ])
    expect(row('completions', 'Z000002').data).toMatchObject({
      employeeExternalId: 'E0001',
      provider: 'Bezpečná firma s.r.o.',
    })
  })

  it('checks sessions against the catalog and each other', () => {
    expect(codesOf(row('sessions', 'T001', 1))).toEqual(['externalId:DUPLICATE_ID'])
    // "aula a" is the room the database knows as "Aula A".
    expect(codesOf(row('sessions', 'T002'))).toEqual([
      'date:DUPLICATE_SLOT',
      'location:VALUE_NORMALIZED',
    ])
    expect(row('sessions', 'T002').data).toMatchObject({ location: 'Aula A' })
    // A room nobody listed is created from its sessions.
    expect(codesOf(row('sessions', 'T003'))).toEqual([
      'courseCode:COURSE_NOT_FOUND',
      'location:ROOM_DERIVED',
    ])
  })

  it('checks completions against people, courses and the validity rule', () => {
    expect(codesOf(row('completions', 'Z000001'))).toEqual(['validUntil:VALIDITY_DERIVED'])
    expect(row('completions', 'Z000001').data).toMatchObject({ validUntil: '2026-11-05' })
    // LEAD never expires: nothing to derive. The name does not match the person.
    expect(codesOf(row('completions', 'Z000003'))).toEqual(['employeeName:NAME_MISMATCH'])
    expect(codesOf(row('completions', 'Z000004'))).toEqual([
      'employeeExternalId:EMPLOYEE_NOT_FOUND',
      'validUntil:VALIDITY_DERIVED',
    ])
    expect(codesOf(row('completions', 'Z000005'))).toEqual(['courseCode:COURSE_NOT_FOUND'])
    expect(codesOf(row('completions', 'Z000001', 1))).toEqual(['externalId:DUPLICATE_ID'])
    // Someone already in the database, on a course already in the database.
    expect(codesOf(row('completions', 'Z000006'))).toEqual(['validUntil:VALIDITY_DERIVED'])
  })

  it('treats a reference employee with the same email as the same person', () => {
    const again = validateBatch(
      {
        employees: file('zamestnanci.csv', [
          EMPLOYEES[0] ?? '',
          'E0900,Eva,Šimková,eva.simkova@vzorova.example,Archiv,Archivářka,,2022-01-01,aktivní',
        ]).rows as ImportBatch['employees'],
      },
      reference
    )
    expect(codesOf(again.employees?.[0])).toEqual(['row:DUPLICATE_PERSON'])
    expect(again.employees?.[0]?.errors[0]?.params).toEqual({ otherId: 'E0500' })
  })
})

describe('row operations', () => {
  const start = validateBatch(parsed(), reference)

  it('edits a cell, re-validates, and reverts to the original', () => {
    const edited = editCell(start, 'sessions', 3, 'courseCode', 'BOZP-Z', ctx, reference)
    expect(edited.sessions?.[3]).toMatchObject({ isEdited: true, isValid: true })
    const reverted = revertRow(edited, 'sessions', 3, ctx, reference)
    expect(reverted.sessions?.[3]).toMatchObject({ isEdited: false, isValid: false })
    expect(reverted.sessions?.[3]?.raw.courseCode).toBe('KYB3R')
  })

  it('an edit back to the original value is no longer an edit', () => {
    const there = editCell(start, 'sessions', 0, 'location', 'Aula B', ctx, reference)
    const back = editCell(there, 'sessions', 0, 'location', 'Aula A', ctx, reference)
    expect(back.sessions?.[0]?.isEdited).toBe(false)
  })

  it('removes a row from what will be written, and leaves unknown rows alone', () => {
    const before = committable(start, 'sessions').length
    const removed = setRemoved(start, 'sessions', 2, true, reference)
    expect(committable(removed, 'sessions')).toHaveLength(before - 1)
    expect(summarize(removed.sessions ?? [])).toMatchObject({ removed: 1 })
    expect(setRemoved(start, 'sessions', 99, true, reference)).toBe(start)
    expect(committable({}, 'courses')).toEqual([])
  })

  it('summarises valid, invalid and warning rows', () => {
    expect(summarize(start.completions ?? [])).toEqual({
      total: 7,
      valid: 4,
      invalid: 3,
      warnings: 4,
      removed: 0,
    })
  })
})

describe('rooms', () => {
  const ROOMS = [
    'nazev;typ;kapacita;vybaveni',
    'Laboratoř 3;laboratoř;20;Laboratorní vybavení, projektor',
    'Online;;12;videokonference',
    'Učebna 1;;40;',
    'laborator 3;LAB;10;',
    'Garáž;hangár;5;',
    'Dvůr;venkovní;8;teleport',
    'Učebna 2;;;video conference',
  ]

  it('reads kinds, seats and equipment, Czech labels included', () => {
    const rooms = file('mistnosti.csv', ROOMS)
    expect(rooms.kind).toBe('rooms')
    expect(rooms.rows.map(r => r.base.data)).toEqual([
      {
        name: 'Laboratoř 3',
        kind: 'LAB',
        capacity: 20,
        capabilities: ['LAB_EQUIPMENT', 'PROJECTOR'],
        note: null,
      },
      // No kind given: online by its name; no seat limit, whatever the file says.
      {
        name: 'Online',
        kind: 'ONLINE',
        capacity: null,
        capabilities: ['VIDEO_CONFERENCE'],
        note: null,
      },
      { name: 'Učebna 1', kind: 'CLASSROOM', capacity: 40, capabilities: [], note: null },
      { name: 'laborator 3', kind: 'LAB', capacity: 10, capabilities: [], note: null },
      null,
      null,
      null,
    ])
    expect(codesOf(rooms.rows[4])).toEqual(['kind:INVALID_VALUE'])
    expect(codesOf(rooms.rows[5])).toEqual(['capabilities:INVALID_VALUE'])
    // A classroom needs seats; a code with a space still reads.
    expect(codesOf(rooms.rows[6])).toEqual(['capacity:REQUIRED'])
  })

  it('takes the kind from the name, and leaves equipment alone when the file has no column', () => {
    const rooms = file('mistnosti.csv', ['nazev;kapacita', 'Laboratoř 4;16'])
    expect(rooms.rows[0]?.base.data).toEqual({
      name: 'Laboratoř 4',
      kind: 'LAB',
      capacity: 16,
      capabilities: null,
      note: null,
    })
    expect(
      file('mistnosti.csv', ['nazev;kapacita;vybaveni', 'Učebna 3;20;Video conference']).rows[0]
        ?.base.data
    ).toMatchObject({ capabilities: ['VIDEO_CONFERENCE'] })
  })

  it('keeps the spelling of a room the register already has', () => {
    const batch = validateBatch(
      {
        rooms: file('mistnosti.csv', ['nazev;kapacita', 'UCEBNA 1;42'])
          .rows as ImportBatch['rooms'],
      },
      { ...EMPTY_REFERENCE, rooms: ['Učebna 1'] }
    )
    expect(batch.rooms?.[0]?.data?.name).toBe('Učebna 1')
    expect(codesOf(batch.rooms?.[0])).toEqual(['name:VALUE_NORMALIZED'])
  })

  it('rejects a second room of the same name, and lets sessions use the listed rooms', () => {
    const batch = validateBatch(
      {
        rooms: file('mistnosti.csv', ROOMS).rows as ImportBatch['rooms'],
        courses: file('katalog.csv', COURSES).rows as ImportBatch['courses'],
        sessions: file('terminy.csv', [
          'id_terminu;kod_skoleni;datum;cas;misto;kapacita',
          'T100;LAB-BEZ;2026-11-04;08:00-11:00;LABORATOŘ 3;12',
        ]).rows as ImportBatch['sessions'],
      },
      EMPTY_REFERENCE
    )
    expect(codesOf(batch.rooms?.[3])).toEqual(['name:DUPLICATE_ID'])
    expect(codesOf(batch.sessions?.[0])).toEqual(['location:VALUE_NORMALIZED'])
    expect(batch.sessions?.[0]?.data?.location).toBe('Laboratoř 3')
  })
})
