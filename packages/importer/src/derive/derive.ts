import { sortName } from '@muni/domain/names'
import { roomKindOfName } from '@muni/domain/rooms'
import type {
  CompletionInput,
  CourseInput,
  EmployeeInput,
  RoomInput,
  SessionInput,
} from '@muni/domain/schemas'
import type { IsoDate } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import { editCell, parseFile } from '../batch'
import type { IssueCode } from '../issues'
import { decode } from '../parse/decode'
import { isCommitted } from '../row-state'
import {
  type DatasetKind,
  EMPTY_REFERENCE,
  type ImportBatch,
  type ParsedRow,
  type ValidationIssue,
} from '../types'
import { validateBatch } from '../validate'
import { toCsv } from './csv-out'

// Import files derived from the raw exports: what the importer reads from them, written back
// canonical, with every value it had to infer listed and every row a person has to decide on
// left out and listed. See data/import/README.md.

/** The day the files were derived on: what lies in the future, or has passed, is judged by it. */
export const DERIVED_AS_OF: IsoDate = '2026-10-20'

export interface SourceFile {
  name: string
  bytes: Uint8Array
}

/** A value the derived files hold that the source did not say as such. */
export interface Inference {
  file: string
  /** The source line; null for what no line says (a room made from its sessions). */
  line: number | null
  id: string
  field: string
  original: string
  derived: string
  rule: string
}

/**
 * A source row for a person to look at: left out of the derived files, kept but worth a look,
 * or a note in the source (a comment line).
 */
export interface Ambiguity {
  file: string
  line: number
  id: string
  decision: 'left out' | 'kept' | 'noted'
  issue: string
  detail: string
  row: string
}

export interface DerivedImport {
  /**
   * Path → contents: the import files, and beside them in `review/` the lists for a person
   * (`inferences.csv`, `ambiguities.csv`), which no import reads.
   */
  files: Record<string, string>
  inferences: Inference[]
  ambiguities: Ambiguity[]
  /** Per source file, its rows' lines: written to the derived files, or left out. */
  accounted: Record<string, { rows: number[]; kept: number[]; leftOut: number[] }>
}

/** The derived file of each dataset; the rooms one is new (the exports have none). */
export const DERIVED_FILES: Record<DatasetKind, string> = {
  courses: 'katalog_skoleni.csv',
  employees: 'zamestnanci.csv',
  rooms: 'mistnosti.csv',
  sessions: 'terminy_skoleni.csv',
  completions: 'absolvovana_skoleni.csv',
}

/** Warnings that change no value but are worth a look: kept, and listed as ambiguities. */
const FLAGS: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'NO_DEPARTMENT',
  'HIRED_IN_FUTURE',
  'COMPLETED_AFTER_LEAVING',
  'PLANNED_IN_PAST',
  'NON_WORKING_DAY',
  'OVERBOOKED',
  'ZERO_CAPACITY',
  'DUPLICATE_SLOT',
  'STATUS_DATE_MISMATCH',
  'ROOM_TOO_SMALL',
  'ROOM_UNSUITABLE',
  'ROOM_BUSY',
])

/** Warnings that say what the import will create: nothing to infer or decide. */
const NOTICES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'WILL_CREATE',
  'ROOM_DERIVED',
  'OFFERING_ADDED',
  'UNKNOWN_DEPARTMENT',
  'UNKNOWN_POSITION',
])

/** Every other warning is a value the importer worked out: listed as an inference. */
const isInference = (code: IssueCode) => !FLAGS.has(code) && !NOTICES.has(code)

const ROOM_KIND_WORD = {
  CLASSROOM: 'učebna',
  LAB: 'laboratoř',
  ONLINE: 'online',
  EXTERNAL: 'externí',
  OUTDOOR: 'venkovní',
} as const

const price = (value: number | null) =>
  value === null ? '' : Number.isInteger(value) ? String(value) : value.toFixed(2)

function requiredFor(course: CourseInput): string {
  const { requirements } = course
  if (requirements.length === 0) return 'NEPOVINNE'
  if (requirements.some(r => r.scope === 'ALL')) return 'VSICHNI'
  // The catalogue's language gives a course one scope: departments, or positions.
  const departments = requirements.flatMap(r => (r.scope === 'DEPARTMENT' ? [r.department] : []))
  const positions = requirements.flatMap(r => (r.scope === 'POSITION' ? [r.position] : []))
  return departments.length > 0 ? `UTVAR:${departments.join(';')}` : `POZICE:${positions.join(';')}`
}

/** Each dataset's columns: the source header for each column key, in file order. */
const HEADERS = {
  courses: { code: 'kod', name: 'nazev', validity: 'platnost_mesicu', requiredFor: 'povinne_pro' },
  employees: {
    externalId: 'id_zamestnance',
    firstName: 'jmeno',
    lastName: 'prijmeni',
    email: 'email',
    department: 'utvar',
    position: 'pozice',
    managerEmail: 'vedouci_email',
    hiredOn: 'datum_nastupu',
    leftOn: 'datum_ukonceni',
    status: 'stav',
    nationalId: 'rodne_cislo',
    note: 'poznamka',
  },
  rooms: { name: 'nazev', kind: 'typ', capacity: 'kapacita' },
  sessions: {
    externalId: 'id_terminu',
    courseCode: 'kod_skoleni',
    date: 'datum',
    time: 'cas',
    location: 'misto',
    capacity: 'kapacita',
    bookedCount: 'obsazeno',
    price: 'cena_na_osobu',
    status: 'stav',
    provider: 'poskytovatel',
  },
  completions: {
    externalId: 'id_zaznamu',
    employeeExternalId: 'id_zamestnance',
    employeeName: 'zamestnanec',
    courseCode: 'kod_skoleni',
    completedOn: 'datum_absolvovani',
    validUntil: 'platnost_do',
    provider: 'poskytovatel',
    price: 'cena_kc',
    note: 'poznamka',
  },
} as const satisfies Record<DatasetKind, Record<string, string>>

type Cells<K extends DatasetKind> = Record<keyof (typeof HEADERS)[K], string>

const courseCells = (c: CourseInput): Cells<'courses'> => ({
  code: c.code,
  name: c.name,
  validity: c.validityMonths === null ? '' : String(c.validityMonths),
  requiredFor: requiredFor(c),
})

const employeeCells = (e: EmployeeInput, asOf: IsoDate): Cells<'employees'> => ({
  externalId: e.externalId,
  firstName: e.firstName,
  lastName: e.lastName,
  email: e.email ?? '',
  department: e.department ?? '',
  position: e.position ?? '',
  managerEmail: e.managerEmail ?? '',
  hiredOn: e.hiredOn,
  leftOn: e.leftOn ?? '',
  status:
    e.leftOn !== null && e.leftOn <= asOf
      ? 'ukončen'
      : e.status === 'PARENTAL_LEAVE'
        ? 'rodičovská'
        : 'aktivní',
  nationalId: e.nationalId ?? '',
  note: e.note ?? '',
})

const roomCells = (r: RoomInput): Cells<'rooms'> => ({
  name: r.name,
  kind: ROOM_KIND_WORD[r.kind],
  capacity: r.capacity === null ? '' : String(r.capacity),
})

const sessionCells = (s: SessionInput): Cells<'sessions'> => ({
  externalId: s.externalId,
  courseCode: s.courseCode,
  date: s.date,
  time: `${s.startTime}-${s.endTime}`,
  location: s.location,
  capacity: String(s.capacity),
  bookedCount: String(s.bookedCount),
  price: price(s.pricePerPerson),
  status: s.status === 'CANCELLED' ? 'zrušeno' : 'plánováno',
  provider: s.providerName ?? '',
})

const completionCells = (c: CompletionInput, name: string): Cells<'completions'> => ({
  externalId: c.externalId,
  employeeExternalId: c.employeeExternalId,
  employeeName: name,
  courseCode: c.courseCode,
  completedOn: c.completedOn,
  validUntil: c.validUntil ?? '',
  provider: c.provider ?? '',
  price: price(c.price),
  note: c.note ?? '',
})

const csvOf = <K extends DatasetKind>(kind: K, rows: Cells<K>[]) => {
  const keys = Object.keys(HEADERS[kind]) as (keyof Cells<K>)[]
  return toCsv(
    keys.map(k => (HEADERS[kind] as Record<keyof Cells<K>, string>)[k]),
    rows.map(r => keys.map(k => r[k]))
  )
}

const detailOf = (issue: ValidationIssue) =>
  Object.entries(issue.params ?? {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ')

const idOf = (row: ParsedRow<unknown>) =>
  (row.originalRaw['externalId'] ?? row.originalRaw['code'] ?? row.originalRaw['name'] ?? '')
    .trim()
    .toUpperCase()

const rawLine = (row: ParsedRow<unknown>) => Object.values(row.originalRaw).join(';')

/**
 * Course codes the exports mistype, each settled by what the rows say: the importer only
 * suggests the near code, and a near code is not always the one meant (BOZP-X is one letter
 * from BOZP-Z, but its rows have another provider, price and validity: a course the catalogue
 * lacks, so they are left for a person).
 */
const COURSE_TYPOS: Readonly<Record<string, { code: string; why: string }>> = {
  KYB3R: { code: 'KYBER', why: '3 typed for E; T010 has KYBER’s time, place and price' },
}

/**
 * The repairs the derivation makes before reading the rows: a course code from COURSE_TYPOS,
 * and an email whose domain lacks its ending when every other address shares one domain with
 * that start (`@vzorova` → `@vzorova.example`).
 */
function repair(batch: ImportBatch, asOf: IsoDate, files: Record<DatasetKind, string>) {
  const ctx = { today: asOf }
  const inferences: Inference[] = []
  const edits: { kind: DatasetKind; index: number; field: string; value: string; rule: string }[] =
    []
  for (const kind of ['sessions', 'completions'] as const)
    (batch[kind] ?? []).forEach((row, index) => {
      const code = row.errors.find(i => i.code === 'COURSE_NOT_FOUND')?.params?.['value']
      const typo = typeof code === 'string' ? COURSE_TYPOS[code] : undefined
      if (typo)
        edits.push({ kind, index, field: 'courseCode', value: typo.code, rule: 'COURSE_CODE_TYPO' })
    })
  const domains = new Map<string, number>()
  for (const row of batch.employees ?? []) {
    const domain = row.data?.email?.split('@')[1]
    if (domain) domains.set(domain, (domains.get(domain) ?? 0) + 1)
  }
  const [main] = [...domains].sort((a, b) => b[1] - a[1])
  ;(batch.employees ?? []).forEach((row, index) => {
    for (const issue of row.warnings.filter(i => i.code === 'INVALID_EMAIL')) {
      const raw = (row.raw[issue.field] ?? '').replace(/\s+/g, '').toLowerCase()
      const [local, domain] = raw.split('@')
      if (main && local && domain && !domain.includes('.') && main[0].startsWith(`${domain}.`))
        edits.push({
          kind: 'employees',
          index,
          field: issue.field,
          value: `${local}@${main[0]}`,
          rule: 'EMAIL_DOMAIN',
        })
    }
  })
  let repaired = batch
  for (const edit of edits) {
    const row = repaired[edit.kind]?.[edit.index]
    if (!row) continue
    inferences.push({
      file: files[edit.kind],
      line: row.rowNumber,
      id: idOf(row),
      field: edit.field,
      original: row.originalRaw[edit.field] ?? '',
      derived: edit.value,
      rule: edit.rule,
    })
    repaired = editCell(
      repaired,
      edit.kind,
      edit.index,
      edit.field,
      edit.value,
      ctx,
      EMPTY_REFERENCE
    )
  }
  return { batch: repaired, inferences }
}

/**
 * Reads the exports as the importer does, makes the repairs it only proposes, and writes the
 * rows it would import back as canonical import files: what it read, with each value it had
 * to infer listed (`inferences.csv`). Rows it refuses, and completions whose name belongs to
 * another employee than their ID, are left out; they, the rows worth a look and the comments
 * in the exports are listed (`ambiguities.csv`). Expiry dates follow the course's validity.
 * Rooms, which the exports only name, get a file of their own.
 */
export function deriveImportFiles(
  sources: readonly SourceFile[],
  asOf: IsoDate = DERIVED_AS_OF
): DerivedImport {
  const ctx = { today: asOf }
  const parsed: ImportBatch = {}
  const sourceOf = {} as Record<DatasetKind, string>
  const ambiguities: Ambiguity[] = []
  for (const source of sources) {
    const file = parseFile(source.name, source.bytes, ctx)
    if (!file.kind) throw new Error(`${source.name}: ${file.error ?? 'not recognised'}`)
    ;(parsed as Record<string, unknown>)[file.kind] = file.rows
    sourceOf[file.kind] = source.name
    // A comment in an export may say something about the rows; a person decides what.
    decode(source.bytes)
      .text.split(/\r?\n/)
      .forEach((text, i) => {
        if (text.trimStart().startsWith('#'))
          ambiguities.push({
            file: source.name,
            line: i + 1,
            id: '',
            decision: 'noted',
            issue: 'COMMENT',
            detail: '',
            row: text.trim(),
          })
      })
  }
  const { batch, inferences } = repair(validateBatch(parsed, EMPTY_REFERENCE), asOf, sourceOf)

  // Who each committed person is, and every person a name may mean.
  const people = (batch.employees ?? []).filter(isCommitted).map(r => r.data)
  const nameOf = new Map(people.map(p => [p.externalId, sortName(p)]))
  const byName = new Map<string, string[]>()
  for (const p of people)
    for (const name of [sortName(p), `${p.firstName} ${p.lastName}`])
      byName.set(fold(name), [...(byName.get(fold(name)) ?? []), p.externalId])

  const accounted: DerivedImport['accounted'] = {}
  const out = {
    courses: [] as Cells<'courses'>[],
    employees: [] as Cells<'employees'>[],
    sessions: [] as Cells<'sessions'>[],
    completions: [] as Cells<'completions'>[],
  }
  const keptSessions: SessionInput[] = []

  for (const kind of ['courses', 'employees', 'sessions', 'completions'] as const) {
    const file = sourceOf[kind] as string | undefined
    if (file === undefined) continue
    const rows = (batch[kind] ?? []) as ParsedRow<unknown>[]
    const tally = {
      rows: rows.map(r => r.rowNumber),
      kept: [] as number[],
      leftOut: [] as number[],
    }
    accounted[file] = tally
    for (const row of rows) {
      const leaveOut = (issue: string, detail: string) => {
        tally.leftOut.push(row.rowNumber)
        ambiguities.push({
          file,
          line: row.rowNumber,
          id: idOf(row),
          decision: 'left out',
          issue,
          detail,
          row: rawLine(row),
        })
      }
      // (Read before the guard: on `ParsedRow<unknown>` its negation narrows to never.)
      const [first] = row.errors
      if (!isCommitted(row)) {
        leaveOut(first?.code ?? 'SKIPPED', first ? detailOf(first) : '')
        continue
      }

      let cells: Record<string, string>
      if (kind === 'completions') {
        const data = row.data as CompletionInput
        // The ID names one person and the name another: neither can be trusted.
        const mismatch = row.warnings.find(w => w.code === 'NAME_MISMATCH')
        const given = row.originalRaw['employeeName'] ?? ''
        const others = (byName.get(fold(given.trim())) ?? []).filter(
          id => id !== data.employeeExternalId
        )
        if (mismatch && others.length > 0) {
          leaveOut(
            'NAME_OF_ANOTHER_EMPLOYEE',
            `id=${data.employeeExternalId} name=${given.trim()} nameOf=${others.join(',')}`
          )
          continue
        }
        // The course's validity decides the expiry, not the export's date.
        const course = row.warnings.find(w => w.code === 'VALIDITY_MISMATCH')?.params?.['value']
        const record = typeof course === 'string' ? { ...data, validUntil: course } : data
        cells = completionCells(record, nameOf.get(record.employeeExternalId) ?? given.trim())
        out.completions.push(cells as Cells<'completions'>)
      } else if (kind === 'courses') {
        cells = courseCells(row.data as CourseInput)
        out.courses.push(cells as Cells<'courses'>)
      } else if (kind === 'employees') {
        cells = employeeCells(row.data as EmployeeInput, asOf)
        out.employees.push(cells as Cells<'employees'>)
      } else {
        keptSessions.push(row.data as SessionInput)
        cells = sessionCells(row.data as SessionInput)
        out.sessions.push(cells as Cells<'sessions'>)
      }
      tally.kept.push(row.rowNumber)

      for (const warning of row.warnings) {
        if (FLAGS.has(warning.code))
          ambiguities.push({
            file,
            line: row.rowNumber,
            id: idOf(row),
            decision: 'kept',
            issue: warning.code,
            detail: detailOf(warning),
            row: rawLine(row),
          })
        else if (isInference(warning.code))
          inferences.push({
            file,
            line: row.rowNumber,
            id: idOf(row),
            field: warning.field,
            original: (row.originalRaw[warning.field] ?? '').trim(),
            derived: cells[warning.field] ?? '',
            rule: warning.code === 'VALIDITY_MISMATCH' ? 'VALIDITY_FROM_COURSE' : warning.code,
          })
      }
    }
  }

  // Rooms: one per place the kept sessions name, of the kind its name implies, with the seats
  // of the largest planned session there (any session, where none is planned).
  const places = new Map<string, SessionInput[]>()
  for (const s of keptSessions) places.set(s.location, [...(places.get(s.location) ?? []), s])
  const roomRows: RoomInput[] = [...places]
    .map(([name, held]) => {
      const kind = roomKindOfName(name)
      const planned = held.filter(s => s.status === 'PLANNED')
      const seats = Math.max(...(planned.length > 0 ? planned : held).map(s => s.capacity))
      return {
        name,
        kind,
        capacity: kind === 'ONLINE' || seats === 0 ? null : seats,
        capabilities: null,
        note: null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  for (const room of roomRows) {
    const cells = roomCells(room)
    inferences.push(
      {
        file: DERIVED_FILES.rooms,
        line: null,
        id: room.name,
        field: 'kind',
        original: '',
        derived: cells.kind,
        rule: 'ROOM_KIND_FROM_NAME',
      },
      {
        file: DERIVED_FILES.rooms,
        line: null,
        id: room.name,
        field: 'capacity',
        original: '',
        derived: cells.capacity,
        rule: 'ROOM_SEATS_FROM_SESSIONS',
      }
    )
  }

  const byPlace = (
    a: { file: string; line: number | null },
    b: { file: string; line: number | null }
  ) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0)
  inferences.sort(byPlace)
  ambiguities.sort(byPlace)

  return {
    files: {
      [DERIVED_FILES.courses]: csvOf('courses', out.courses),
      [DERIVED_FILES.employees]: csvOf('employees', out.employees),
      [DERIVED_FILES.rooms]: csvOf('rooms', roomRows.map(roomCells)),
      [DERIVED_FILES.sessions]: csvOf('sessions', out.sessions),
      [DERIVED_FILES.completions]: csvOf('completions', out.completions),
      'review/inferences.csv': toCsv(
        ['file', 'line', 'id', 'field', 'original', 'derived', 'rule'],
        inferences.map(i => [i.file, i.line, i.id, i.field, i.original, i.derived, i.rule]),
        { forPeople: true }
      ),
      'review/ambiguities.csv': toCsv(
        ['file', 'line', 'id', 'decision', 'issue', 'detail', 'row'],
        ambiguities.map(a => [a.file, a.line, a.id, a.decision, a.issue, a.detail, a.row]),
        { forPeople: true }
      ),
    },
    inferences,
    ambiguities,
    accounted,
  }
}
