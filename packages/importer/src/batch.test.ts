import { describe, expect, it } from 'vitest'

import {
  committable,
  countCommittable,
  editCell,
  type ImportContext,
  parseFile,
  revertRow,
  setRemoved,
  summarize,
} from './batch'
import { isCommitted, rowState } from './row-state'
import {
  EMPTY_REFERENCE,
  type ImportBatch,
  NO_ARCHIVED,
  type ParsedRow,
  type ReferenceSnapshot,
} from './types'
import { archivedCandidates, validateBatch } from './validate'

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
    courses: file('katalog.csv', COURSES).rows as NonNullable<ImportBatch['courses']>,
    employees: file('zamestnanci.csv', EMPLOYEES).rows as NonNullable<ImportBatch['employees']>,
    sessions: file('terminy.csv', [
      'id_terminu;kod_skoleni;datum;cas;misto;kapacita;obsazeno',
      'T001;BOZP-Z;2026-11-04;08:00-11:00;Aula A;30;12',
      'T001;BOZP-Z;2026-11-05;08:00-11:00;Aula A;30;12',
      'T002;BOZP-Z;2026-11-04;08:00-11:00;aula a;30;0',
      'T003;KYB3R;2026-11-04;08:00-11:00;Aula B;30;0',
    ]).rows as NonNullable<ImportBatch['sessions']>,
    completions: file('absolvovana.csv', [
      'id_zaznamu;id_zamestnance;zamestnanec;kod_skoleni;datum_absolvovani;platnost_do;poskytovatel',
      'Z000001;E0001;Černá Marie;BOZP-Z;2024-11-05;;Bezpečná firma s.r.o.',
      'Z000002;E0003;Marie Černá;BOZP-Z;2024-11-06;2026-11-01;bezpecna firma s.r.o.',
      'Z000003;E0001;Novák Jan;LEAD;2024-11-05;;',
      'Z000004;E9001;;BOZP-Z;2024-11-05;;',
      'Z000005;E0001;;KYB3R;2024-11-05;;',
      'Z000001;E0001;;ANGL;2024-11-05;;',
      'Z000006;E0500;Šimková Eva;GDPR;2024-11-05;;',
    ]).rows as NonNullable<ImportBatch['completions']>,
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
    batch.courses?.find(r => r.data?.code === code || r.raw['code'] === code)
  const row = (kind: 'employees' | 'sessions' | 'completions', id: string, n = 0) =>
    batch[kind]?.filter(r => (r.raw['externalId'] ?? r.raw['id_zaznamu']) === id)[
      n
    ] as ParsedRow<unknown>

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
    // A refused row says nothing of the room it names: it creates none.
    expect(codesOf(row('sessions', 'T003'))).toEqual(['courseCode:COURSE_NOT_FOUND'])
  })

  it('checks completions against people, courses and the validity rule', () => {
    // The first row naming a provider the register lacks says the import creates it.
    expect(codesOf(row('completions', 'Z000001'))).toEqual([
      'validUntil:VALIDITY_DERIVED',
      'provider:WILL_CREATE',
    ])
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
        ]).rows as NonNullable<ImportBatch['employees']>,
      },
      reference
    )
    expect(codesOf(again.employees?.[0])).toEqual(['row:DUPLICATE_PERSON'])
    expect(again.employees?.[0]?.errors[0]?.params).toEqual({ otherId: 'E0500' })
  })
})

describe('validateBatch: a record twice, and rows the other files contradict', () => {
  const completions = (rows: string[]) =>
    file('absolvovana.csv', [
      'id_zaznamu;id_zamestnance;zamestnanec;kod_skoleni;datum_absolvovani;platnost_do;poskytovatel;cena',
      ...rows,
    ]).rows as NonNullable<ImportBatch['completions']>
  const register: ReferenceSnapshot = {
    ...EMPTY_REFERENCE,
    courses: [
      { code: 'KYBER', validityMonths: 12 },
      { code: 'GDPR', validityMonths: 36 },
    ],
    employees: [{ externalId: 'E0001', email: null, fullName: 'Černá Marie' }],
  }

  it('refuses the same completion again under another ID; another price is another record', () => {
    const out = validateBatch(
      {
        completions: completions([
          'Z000001;E0001;Černá Marie;GDPR;2024-11-05;;Interní školitel;450',
          'Z915067;E0001;Černá Marie;GDPR;2024-11-05;;INTERNÍ ŠKOLITEL;450',
          'Z000002;E0001;Černá Marie;GDPR;2024-11-05;;Interní školitel;500',
        ]),
      },
      register
    )
    expect(out.completions?.[1]?.errors).toMatchObject([
      { code: 'DUPLICATE_RECORD', params: { otherId: 'Z000001', firstRow: 2 } },
    ])
    expect(out.completions?.[2]?.isValid).toBe(true)
  })

  it('refuses a session copied under another ID; other seats at the same time are a warning', () => {
    const out = validateBatch(
      {
        sessions: file('terminy.csv', [
          'id_terminu;kod_skoleni;datum;cas;misto;kapacita;obsazeno;cena',
          'T003;KYBER;2026-11-11;09:00-12:00;Aula A;30;5;800',
          'T009;KYBER;2026-11-11;09:00-12:00;Aula A;30;5;800',
          'T010;KYBER;2026-11-11;09:00-12:00;Aula A;20;5;800',
        ]).rows as NonNullable<ImportBatch['sessions']>,
      },
      { ...register, rooms: ['Aula A'], defaultProvider: 'Interní školitel' }
    )
    expect(out.sessions?.[1]?.errors).toMatchObject([
      { code: 'DUPLICATE_RECORD', params: { otherId: 'T003', firstRow: 2 } },
    ])
    expect(codesOf(out.sessions?.[2])).toEqual(['date:DUPLICATE_SLOT'])
  })

  it('warns on a completion after the person left the batch’s register', () => {
    const out = validateBatch(
      {
        employees: file('zamestnanci.csv', [
          'id_zamestnance,jmeno,prijmeni,email,utvar,pozice,vedouci_email,datum_nastupu,datum_ukonceni,stav',
          'E0019,Jan,Novák,,Vedení,Ředitel,,2015-01-01,2025-12-31,ukončen',
        ]).rows as NonNullable<ImportBatch['employees']>,
        completions: completions(['Z002860;E0019;Novák Jan;GDPR;2026-09-30;;;']),
      },
      register
    )
    expect(out.completions?.[0]?.warnings).toMatchObject([
      { code: 'COMPLETED_AFTER_LEAVING', params: { value: '2026-09-30', leftOn: '2025-12-31' } },
      { code: 'VALIDITY_DERIVED' },
    ])
  })

  it('says what the import creates on the first row it imports, not on a refused one', () => {
    const out = validateBatch(
      {
        sessions: file('terminy.csv', [
          'id_terminu;kod_skoleni;datum;cas;misto;kapacita;obsazeno',
          'T010;KYB3R;2026-12-02;09:00-12:00;Aula B;20;0',
          'T011;KYBER;2026-12-03;09:00-12:00;Aula B;20;0',
        ]).rows as NonNullable<ImportBatch['sessions']>,
      },
      { ...register, providers: ['Interní školitel'], defaultProvider: 'Interní školitel' }
    )
    expect(codesOf(out.sessions?.[0])).toEqual(['courseCode:COURSE_NOT_FOUND'])
    expect(codesOf(out.sessions?.[1])).toEqual(['provider:OFFERING_ADDED', 'location:ROOM_DERIVED'])
  })

  it('names the course a mistyped code was meant to be, when only one is that near', () => {
    const out = validateBatch(
      {
        completions: completions([
          'Z000005;E0001;;KYB3R;2024-11-05;;;',
          'Z000006;E0001;;XYZ;2024-11-05;;;',
        ]),
      },
      register
    )
    expect(out.completions?.[0]?.errors).toMatchObject([
      { code: 'COURSE_NOT_FOUND', params: { value: 'KYB3R', suggestion: 'KYBER' } },
    ])
    expect(out.completions?.[1]?.errors).toMatchObject([
      { code: 'COURSE_NOT_FOUND', params: { value: 'XYZ', suggestion: 'none' } },
    ])
  })
})

describe('validateBatch: the rules the forms keep', () => {
  const people = (rows: string[]) =>
    file('zamestnanci.csv', [EMPLOYEES[0] ?? '', ...rows]).rows as NonNullable<
      ImportBatch['employees']
    >

  it('drops a manager link that would make someone manage themselves', () => {
    const out = validateBatch(
      {
        employees: people([
          'E0010,Adam,Malý,adam@vzorova.example,Knihovna,Referent,adam@vzorova.example,2020-01-01,aktivní',
          // A loop of two: the first of them (in file order) loses the link that closes it.
          'E0011,Bára,Nová,bara@vzorova.example,Knihovna,Referent,cyril@vzorova.example,2020-01-01,aktivní',
          'E0012,Cyril,Starý,cyril@vzorova.example,Knihovna,Referent,bara@vzorova.example,2020-01-01,aktivní',
        ]),
      },
      { ...EMPTY_REFERENCE, departments: ['Knihovna'], positions: ['Referent'] }
    )
    const [self, first, second] = out.employees ?? []
    expect(codesOf(self)).toEqual(['managerEmail:MANAGER_CYCLE'])
    expect(self?.data?.managerEmail).toBeNull()
    expect(codesOf(first)).toEqual(['managerEmail:MANAGER_CYCLE'])
    expect(first?.data?.managerEmail).toBeNull()
    expect(codesOf(second)).toEqual([])
    expect(second?.data?.managerEmail).toBe('bara@vzorova.example')
  })

  it('announces each new department and position once, on a row that is imported', () => {
    const out = validateBatch(
      {
        employees: people([
          'E0010,Adam,Malý,adam@vzorova.example,Archiv,Archivář,,2020-01-01,aktivní',
          'E0011,Bára,Nová,bara@vzorova.example,ARCHIV,Archivář,,2020-01-01,aktivní',
        ]),
      },
      { ...EMPTY_REFERENCE, departments: ['Laboratoře'], positions: ['Laborantka'] }
    )
    expect(codesOf(out.employees?.[0])).toEqual(['department:WILL_CREATE', 'position:WILL_CREATE'])
    expect(codesOf(out.employees?.[1])).toEqual(['department:VALUE_NORMALIZED'])
  })

  it('checks planned sessions against their rooms as the session form does', () => {
    const sessions = (rows: string[]) =>
      file('terminy.csv', [
        'id_terminu;kod_skoleni;datum;cas;misto;kapacita;obsazeno;stav',
        ...rows,
      ]).rows as NonNullable<ImportBatch['sessions']>
    const out = validateBatch(
      {
        sessions: sessions([
          // Too many seats for the room.
          'T010;BOZP-Z;2026-11-04;08:00-11:00;Aula A;30;0;plánováno',
          // The room is taken then (by a session the register has).
          'T011;BOZP-Z;2026-11-05;09:00-10:00;Aula A;10;0;plánováno',
          // The course needs a projector the lab lacks.
          'T012;BOZP-Z;2026-11-06;08:00-11:00;Lab 1;10;0;plánováno',
          // Online: never taken, never too small.
          'T013;BOZP-Z;2026-11-05;09:00-10:00;Online;500;0;plánováno',
          // Cancelled: its room is not checked.
          'T014;BOZP-Z;2026-11-05;09:30-10:30;Aula A;99;0;zrušeno',
          // Two of the batch's own in one room at once.
          'T015;BOZP-Z;2026-11-09;08:00-11:00;Aula B;10;0;plánováno',
          'T016;BOZP-Z;2026-11-09;10:00-12:00;Aula B;10;0;plánováno',
        ]),
      },
      {
        ...EMPTY_REFERENCE,
        courses: [
          {
            code: 'BOZP-Z',
            validityMonths: 24,
            needs: { seats: null, onlineAllowed: true, capabilities: ['PROJECTOR'] },
            offeredBy: ['Interní školitel'],
          },
        ],
        providers: ['Interní školitel'],
        defaultProvider: 'Interní školitel',
        rooms: ['Aula A', 'Lab 1', 'Online'],
        roomFacts: [
          { name: 'Aula A', kind: 'CLASSROOM', capacity: 20, capabilities: ['PROJECTOR'] },
          { name: 'Lab 1', kind: 'LAB', capacity: 20, capabilities: [] },
          { name: 'Online', kind: 'ONLINE', capacity: null, capabilities: ['PROJECTOR'] },
        ],
        plannedSessions: [
          {
            externalId: 'T900',
            room: 'Aula A',
            date: '2026-11-05',
            startTime: '08:30',
            endTime: '09:30',
          },
          // The batch's own T010 replaces this one, so it holds nothing.
          {
            externalId: 'T010',
            room: 'Aula A',
            date: '2026-11-06',
            startTime: '08:00',
            endTime: '11:00',
          },
        ],
      }
    )
    const codes = (id: string) => codesOf(out.sessions?.find(r => r.base.data?.externalId === id))
    expect(codes('T010')).toEqual(['capacity:ROOM_TOO_SMALL'])
    expect(out.sessions?.[0]?.warnings[0]?.params).toEqual({ value: 30, capacity: 20 })
    expect(codes('T011')).toEqual(['location:ROOM_BUSY'])
    expect(codes('T012')).toEqual(['location:ROOM_UNSUITABLE'])
    expect(codes('T013')).toEqual([])
    expect(codes('T014')).toEqual([])
    expect(codes('T015')).toEqual(['location:ROOM_DERIVED'])
    expect(codes('T016')).toEqual(['location:ROOM_BUSY'])
  })
})

describe('row operations', () => {
  const start = validateBatch(parsed(), reference)

  it('edits a cell, re-validates, and reverts to the original', () => {
    const edited = editCell(start, 'sessions', 3, 'courseCode', 'BOZP-Z', ctx, reference)
    expect(edited.sessions?.[3]).toMatchObject({ isEdited: true, isValid: true })
    const reverted = revertRow(edited, 'sessions', 3, ctx, reference)
    expect(reverted.sessions?.[3]).toMatchObject({ isEdited: false, isValid: false })
    expect(reverted.sessions?.[3]?.raw['courseCode']).toBe('KYB3R')
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

  it('writes people managers first, so a chunk never links to a manager not yet written', () => {
    const batch = validateBatch(
      {
        employees: file('zamestnanci.csv', [
          EMPLOYEES[0] ?? '',
          'E0003,Jan,Malý,jan.maly@vzorova.example,Laboratoře,Laborant,eva.novakova@vzorova.example,2020-01-01,aktivní',
          'E0001,Petr,Adámek,petr.adamek@vzorova.example,Laboratoře,Laborant,jan.maly@vzorova.example,2020-01-01,aktivní',
          'E0002,Eva,Nováková,eva.novakova@vzorova.example,Vedení,Ředitelka,,2015-01-01,aktivní',
          'E0004,Ida,Černá,ida.cerna@vzorova.example,Vedení,Asistentka,,2021-01-01,aktivní',
        ]).rows as NonNullable<ImportBatch['employees']>,
      },
      EMPTY_REFERENCE
    )
    expect(committable(batch, 'employees').map(e => e.externalId)).toEqual([
      'E0002',
      'E0003',
      'E0001',
      'E0004',
    ])
  })

  it('says what each row comes to on commit, and counts what will be written', () => {
    const removed = setRemoved(start, 'sessions', 2, true, reference)
    const states = (removed.sessions ?? []).map(rowState)
    expect(states[2]).toBe('REMOVED')
    // A row with an error (an unknown course code) is refused; the rest are written.
    expect(states[3]).toBe('INVALID')
    expect(removed.sessions?.filter(isCommitted)).toHaveLength(
      states.filter(s => s === 'VALID').length
    )
    expect(countCommittable(removed)).toBe(
      (['rooms', 'courses', 'employees', 'completions', 'sessions'] as const).reduce(
        (sum, kind) => sum + committable(removed, kind).length,
        0
      )
    )
    expect(countCommittable({})).toBe(0)
  })

  it('summarises valid, invalid and warning rows', () => {
    expect(summarize(start.completions ?? [])).toEqual({
      total: 7,
      valid: 4,
      invalid: 3,
      skipped: 0,
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

  it('gives each session a provider that offers its course, or the default', () => {
    const sessions = (rows: string[]) =>
      file('terminy.csv', ['id_terminu;kod_skoleni;datum;cas;misto;kapacita;poskytovatel', ...rows])
        .rows as NonNullable<ImportBatch['sessions']>
    const register: ReferenceSnapshot = {
      ...EMPTY_REFERENCE,
      courses: [
        { code: 'GDPR', validityMonths: 24, offeredBy: ['Interní školitel', 'Externí lektor'] },
        { code: 'ANGL', validityMonths: null, offeredBy: [] },
      ],
      providers: ['Interní školitel', 'Externí lektor'],
      defaultProvider: 'Interní školitel',
      rooms: ['Aula A'],
    }
    const out = validateBatch(
      {
        sessions: sessions([
          'T101;GDPR;2026-11-04;08:00-10:00;Aula A;10;EXTERNÍ LEKTOR',
          'T102;GDPR;2026-11-05;08:00-10:00;Aula A;10;Nikdo',
          'T103;ANGL;2026-11-06;08:00-10:00;Aula A;10;Externí lektor',
          'T104;ANGL;2026-11-09;08:00-10:00;Aula A;10;',
          'T105;ANGL;2026-11-10;08:00-10:00;Aula A;10;',
        ]),
      },
      register
    )
    const codes = (i: number) => codesOf(out.sessions?.[i])
    expect(codes(0)).toEqual([])
    expect(codes(1)).toEqual(['provider:PROVIDER_UNKNOWN'])
    expect(codes(2)).toEqual(['provider:PROVIDER_NOT_OFFERING'])
    // The default is given the course once, on the first row that needs it.
    expect(codes(3)).toEqual(['provider:OFFERING_ADDED'])
    expect(codes(4)).toEqual([])
    // With no default at all, a row that names nobody cannot be placed; a completions file in
    // the same batch makes providers (and a default) first.
    const none = validateBatch(
      { sessions: sessions(['T106;GDPR;2026-11-04;08:00-10:00;Aula A;10;']) },
      { ...register, defaultProvider: null }
    )
    expect(codesOf(none.sessions?.[0])).toEqual(['provider:NO_DEFAULT_PROVIDER'])
  })

  it('counts a provider as known from the completions that will be written only', () => {
    const register: ReferenceSnapshot = {
      ...EMPTY_REFERENCE,
      courses: [{ code: 'GDPR', validityMonths: 24, offeredBy: ['Interní školitel'] }],
      providers: ['Interní školitel'],
      defaultProvider: 'Interní školitel',
      rooms: ['Aula A'],
      employees: [
        { externalId: 'E0500', email: 'eva.simkova@vzorova.example', fullName: 'Šimková Eva' },
      ],
    }
    const out = validateBatch(
      {
        completions: file('absolvovana.csv', [
          'id_zaznamu;id_zamestnance;zamestnanec;kod_skoleni;datum_absolvovani;platnost_do;poskytovatel',
          // Nobody by this ID: the row is refused, and so is the provider only it names.
          'Z000201;E9999;;GDPR;2025-03-01;;Nová firma s.r.o.',
          'Z000202;E0500;Šimková Eva;GDPR;2025-03-01;;Druhá firma s.r.o.',
        ]).rows as NonNullable<ImportBatch['completions']>,
        sessions: file('terminy.csv', [
          'id_terminu;kod_skoleni;datum;cas;misto;kapacita;poskytovatel',
          'T201;GDPR;2026-11-04;08:00-10:00;Aula A;10;Nová firma s.r.o.',
          'T202;GDPR;2026-11-05;08:00-10:00;Aula A;10;Druhá firma s.r.o.',
        ]).rows as NonNullable<ImportBatch['sessions']>,
      },
      register
    )
    expect(codesOf(out.completions?.[0])).toContain('employeeExternalId:EMPLOYEE_NOT_FOUND')
    expect(codesOf(out.sessions?.[0])).toEqual(['provider:PROVIDER_UNKNOWN'])
    expect(codesOf(out.sessions?.[1])).toEqual([])
  })

  it('keeps the spelling of a room the register already has', () => {
    const batch = validateBatch(
      {
        rooms: file('mistnosti.csv', ['nazev;kapacita', 'UCEBNA 1;42']).rows as NonNullable<
          ImportBatch['rooms']
        >,
      },
      { ...EMPTY_REFERENCE, rooms: ['Učebna 1'] }
    )
    expect(batch.rooms?.[0]?.data?.name).toBe('Učebna 1')
    expect(codesOf(batch.rooms?.[0])).toEqual(['name:VALUE_NORMALIZED'])
  })

  it('rejects a second room of the same name, and lets sessions use the listed rooms', () => {
    const batch = validateBatch(
      {
        rooms: file('mistnosti.csv', ROOMS).rows as NonNullable<ImportBatch['rooms']>,
        courses: file('katalog.csv', COURSES).rows as NonNullable<ImportBatch['courses']>,
        sessions: file('terminy.csv', [
          'id_terminu;kod_skoleni;datum;cas;misto;kapacita',
          'T100;LAB-BEZ;2026-11-04;08:00-11:00;LABORATOŘ 3;12',
        ]).rows as NonNullable<ImportBatch['sessions']>,
      },
      { ...EMPTY_REFERENCE, providers: ['Interní školitel'], defaultProvider: 'Interní školitel' }
    )
    expect(codesOf(batch.rooms?.[3])).toEqual(['name:DUPLICATE_ID'])
    // The default provider holds it, and is given the new course to offer.
    expect(codesOf(batch.sessions?.[0])).toEqual([
      'location:VALUE_NORMALIZED',
      'provider:OFFERING_ADDED',
    ])
    expect(batch.sessions?.[0]?.data?.location).toBe('Laboratoř 3')
  })
})

describe('archived records', () => {
  // The database archived these: active records hold none of the keys.
  const archived: ReferenceSnapshot = {
    ...reference,
    archived: {
      ...NO_ARCHIVED,
      courses: ['ANGL'],
      employees: ['E0002'],
      employeeEmails: ['stary@vzorova.example'],
      departments: ['Archiv'],
      positions: ['Ředitel'],
      providers: ['Bezpečná firma s.r.o.'],
      rooms: ['Aula B'],
      sessions: ['T003'],
      completions: ['Z000006'],
    },
  }
  const batch = validateBatch(
    {
      ...parsed(),
      rooms: file('mistnosti.csv', ['nazev;kapacita', 'AULA B;20', 'Aula C;20'])
        .rows as NonNullable<ImportBatch['rooms']>,
    },
    archived
  )
  const skippedCodes = (row: ParsedRow<unknown> | undefined) =>
    row?.warnings.filter(w => w.code === 'ARCHIVED').map(w => `${w.field}:${w.params?.['value']}`)

  it('skips a row whose own key only an archived record holds', () => {
    const course = batch.courses?.find(r => r.base.data?.code === 'ANGL')
    expect(course).toMatchObject({ isValid: true, isSkipped: true })
    expect(skippedCodes(course)).toEqual(['code:ANGL'])
    expect(skippedCodes(batch.employees?.[1])).toEqual(['externalId:E0002'])
    expect(skippedCodes(batch.rooms?.[0])).toEqual(['name:AULA B'])
    expect(batch.rooms?.[1]?.isSkipped).toBe(false)
  })

  it('skips a row that refers to an archived record', () => {
    const course = (code: string) => batch.courses?.find(r => r.base.data?.code === code)
    expect(skippedCodes(course('LAB-BEZ'))).toEqual(['requiredFor:Archiv'])
    expect(skippedCodes(course('LEAD'))).toEqual(['requiredFor:Ředitel'])
    // A session in an archived room, and an archived session.
    expect(skippedCodes(batch.sessions?.[3])).toEqual(['externalId:T003', 'location:Aula B'])
    // A completion by an archived provider; the archived course replaces COURSE_NOT_FOUND.
    expect(skippedCodes(batch.completions?.[0])).toEqual(['provider:Bezpečná firma s.r.o.'])
    expect(codesOf(batch.completions?.[5])).toContain('courseCode:ARCHIVED')
    expect(codesOf(batch.completions?.[5])).not.toContain('courseCode:COURSE_NOT_FOUND')
  })

  it('leaves skipped rows out of the commit and counts them apart', () => {
    expect(committable(batch, 'courses').map(c => c.code)).toEqual(['BOZP-Z'])
    expect(summarize(batch.rooms ?? [])).toEqual({
      total: 2,
      valid: 1,
      invalid: 0,
      skipped: 1,
      warnings: 0,
      removed: 0,
    })
  })

  it('does not let a skipped employee vouch for a manager or a completion', () => {
    const withCompletion = validateBatch(
      {
        employees: parsed().employees ?? [],
        completions: file('absolvovana.csv', [
          'id_zaznamu;id_zamestnance;zamestnanec;kod_skoleni;datum_absolvovani;platnost_do;poskytovatel',
          'Z000010;E0002;;BOZP-Z;2024-11-05;;',
        ]).rows as NonNullable<ImportBatch['completions']>,
      },
      archived
    )
    expect(codesOf(withCompletion.completions?.[0])).toContain('employeeExternalId:ARCHIVED')
  })
})

describe('archivedCandidates', () => {
  it('collects every key the server must check, once', () => {
    const keys = archivedCandidates({
      ...parsed(),
      rooms: file('mistnosti.csv', ['nazev;kapacita', 'Aula C;20']).rows as NonNullable<
        ImportBatch['rooms']
      >,
    })
    expect(keys.courses).toEqual(['BOZP-Z', 'LAB-BEZ', 'LEAD', 'ANGL', 'KYB3R', 'GDPR'])
    expect(keys.employees).toEqual(['E0001', 'E0002', 'E0003', 'E9001', 'E0500'])
    expect(keys.employeeEmails).toEqual(['nikdo@vzorova.example'])
    expect(keys.departments).toEqual(['Laboratoře', 'laboratore', 'Archiv'])
    expect(keys.positions).toEqual(['Laborantka', 'Ředitel'])
    expect(keys.providers).toEqual(['Bezpečná firma s.r.o.', 'bezpecna firma s.r.o.'])
    expect(keys.rooms).toEqual(['Aula C', 'Aula A', 'aula a', 'Aula B'])
    expect(keys.sessions).toEqual(['T001', 'T002', 'T003'])
    expect(keys.completions).toHaveLength(6)
  })
})
