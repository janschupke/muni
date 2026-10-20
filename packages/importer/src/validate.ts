import { sortName } from '@muni/domain/names'
import { type RoomFacts, roomKindOfName, roomMismatch } from '@muni/domain/rooms'
import type {
  CompletionInput,
  CourseInput,
  EmployeeInput,
  RoomInput,
  SessionInput,
} from '@muni/domain/schemas'
import { intervalsOverlap } from '@muni/utils/dates'
import { addMonths } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import { Canonicalizer, DEPARTMENT_ALIASES } from './canonical'
import { type IssueCode, SKIPPING_CODES } from './issues'
import { isCommitted } from './row-state'
import type {
  ArchivedKeys,
  ImportBatch,
  ParsedRow,
  ReferenceSnapshot,
  Severity,
  ValidationIssue,
} from './types'

type Extra = ValidationIssue[]

const issue = (
  field: string,
  code: IssueCode,
  severity: Severity,
  params?: ValidationIssue['params']
): ValidationIssue => ({ field, code, severity, ...(params && { params }) })

/** Recomputes the final state of a row from its row-level base plus cross-row issues. */
function finalize<T>(row: ParsedRow<T>, data: T | null, extra: Extra): ParsedRow<T> {
  const issues = [...row.base.issues, ...extra]
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  const isValid = row.base.data !== null && errors.length === 0
  const isSkipped = isValid && warnings.some(w => SKIPPING_CODES.includes(w.code))
  return { ...row, data: isValid ? data : null, errors, warnings, isValid, isSkipped }
}

/**
 * Keys only archived records hold, by kind. Names compare folded (as the canonicalizers do);
 * codes and IDs exactly.
 */
function archivedChecks(reference: ReferenceSnapshot) {
  const a = reference.archived
  const folded = (values: string[]) => {
    const set = new Set(values.map(fold))
    return (value: string | null) => value !== null && set.has(fold(value))
  }
  const exact = (values: string[]) => {
    const set = new Set(values)
    return (value: string | null) => value !== null && set.has(value)
  }
  return {
    course: exact(a.courses),
    employee: exact(a.employees),
    employeeEmail: exact(a.employeeEmails),
    department: folded(a.departments),
    position: folded(a.positions),
    provider: folded(a.providers),
    room: folded(a.rooms),
    session: exact(a.sessions),
    completion: exact(a.completions),
  }
}

const archivedIssue = (field: string, value: string) =>
  issue(field, 'ARCHIVED', 'warning', { value })

/**
 * Announces each name the import will create a record for (a department, position or
 * provider the register does not have yet), once, on the first row that names it.
 */
function creations(known: readonly string[], keyOf: (value: string) => string) {
  const existing = new Set(known.map(keyOf))
  const announced = new Set<string>()
  return (field: string, value: string | null): ValidationIssue[] => {
    if (value === null) return []
    const key = keyOf(value)
    if (existing.has(key) || announced.has(key)) return []
    announced.add(key)
    return [issue(field, 'WILL_CREATE', 'warning', { value })]
  }
}

/**
 * Who would end up managing themselves: walking up from each person (in file order), a link
 * that leads back to them is dropped, which breaks the loop for everyone else in it.
 */
function managerLoops(links: Map<string, string | null>, order: readonly string[]) {
  const dropped = new Set<string>()
  for (const id of order) {
    const seen = new Set<string>()
    for (let up = links.get(id) ?? null; up !== null && !seen.has(up); up = links.get(up) ?? null) {
      if (up === id) {
        links.set(id, null)
        dropped.add(id)
        break
      }
      seen.add(up)
    }
  }
  return dropped
}

/** Whether two sessions on the same day overlap (wall-clock `HH:mm`). */
const overlaps = (
  a: { date: string; startTime: string; endTime: string },
  b: { date: string; startTime: string; endTime: string }
) =>
  a.date === b.date &&
  intervalsOverlap({ start: a.startTime, end: a.endTime }, { start: b.startTime, end: b.endTime })

/** Rows that can serve as a reference for other rows: mapped cleanly and not removed. */
const usable = <T>(row: ParsedRow<T>): row is ParsedRow<T> & { base: { data: T } } =>
  !row.isRemoved && row.base.data !== null

/** First row (by file order) for each key; later rows with the same key are duplicates. */
function firstRowByKey<T>(rows: ParsedRow<T>[], keyOf: (data: T) => string | null) {
  const first = new Map<string, ParsedRow<T>>()
  for (const row of rows) {
    if (!usable(row)) continue
    const key = keyOf(row.base.data)
    if (key !== null && !first.has(key)) first.set(key, row)
  }
  return first
}

function duplicateOf<T>(
  row: ParsedRow<T>,
  first: Map<string, ParsedRow<T>>,
  key: string | null
): ParsedRow<T> | null {
  if (key === null) return null
  const owner = first.get(key)
  return owner && owner !== row ? owner : null
}

/**
 * Cross-row and cross-file validation. Pure: every call recomputes from each row's `base`,
 * so stale cross-row issues never survive an edit. Order matters: courses and employees
 * feed sessions and completions.
 */
export function validateBatch(batch: ImportBatch, reference: ReferenceSnapshot): ImportBatch {
  const out: ImportBatch = {}
  const archived = archivedChecks(reference)

  // ---- departments / positions (shared by employees and course requirements) ----------
  const employeeRows = batch.employees ?? []
  const courseRows = batch.courses ?? []
  const departmentValues: string[] = []
  const positionValues: string[] = []
  for (const row of employeeRows) {
    if (!usable(row)) continue
    if (row.base.data.department) departmentValues.push(row.base.data.department)
    if (row.base.data.position) positionValues.push(row.base.data.position)
  }
  for (const row of courseRows) {
    if (!usable(row)) continue
    for (const r of row.base.data.requirements) {
      if (r.scope === 'DEPARTMENT') departmentValues.push(r.department)
      if (r.scope === 'POSITION') positionValues.push(r.position)
    }
  }
  const knownDepartments = new Canonicalizer(
    employeeRows
      .filter(usable)
      .flatMap(r => (r.base.data.department ? [r.base.data.department] : [])),
    reference.departments,
    DEPARTMENT_ALIASES
  )
  const knownPositions = new Canonicalizer(
    employeeRows.filter(usable).flatMap(r => (r.base.data.position ? [r.base.data.position] : [])),
    reference.positions
  )
  const departments = new Canonicalizer(departmentValues, reference.departments, DEPARTMENT_ALIASES)
  const positions = new Canonicalizer(positionValues, reference.positions)
  const newDepartment = creations(reference.departments, v => departments.keyOf(v))
  const newPosition = creations(reference.positions, v => positions.keyOf(v))

  // ---- courses ----------------------------------------------------------------------------
  const firstCourse = firstRowByKey(courseRows, d => d.code)
  out.courses = courseRows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const owner = duplicateOf(row, firstCourse, row.base.data.code)
    if (owner) extra.push(issue('code', 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))
    if (archived.course(row.base.data.code)) extra.push(archivedIssue('code', row.base.data.code))

    const requirements = row.base.data.requirements.map(r => {
      if (r.scope === 'DEPARTMENT') {
        if (archived.department(r.department)) {
          extra.push(archivedIssue('requiredFor', r.department))
        } else if (!knownDepartments.has(r.department)) {
          extra.push(issue('requiredFor', 'UNKNOWN_DEPARTMENT', 'warning', { value: r.department }))
        }
        return { ...r, department: departments.canonical(r.department) }
      }
      if (r.scope === 'POSITION') {
        if (archived.position(r.position)) {
          extra.push(archivedIssue('requiredFor', r.position))
        } else if (!knownPositions.has(r.position)) {
          extra.push(issue('requiredFor', 'UNKNOWN_POSITION', 'warning', { value: r.position }))
        }
        return { ...r, position: positions.canonical(r.position) }
      }
      return r
    })
    return finalize<CourseInput>(row, { ...row.base.data, requirements }, extra)
  })

  const courseValidity = new Map<string, number | null>(
    reference.courses.map(c => [c.code, c.validityMonths])
  )
  for (const row of out.courses) {
    if (isCommitted(row)) courseValidity.set(row.data.code, row.data.validityMonths)
  }

  // ---- employees --------------------------------------------------------------------------
  const firstEmployee = firstRowByKey(employeeRows, d => d.externalId)
  const firstByEmail = firstRowByKey(employeeRows, d => d.email)
  const firstByNationalId = firstRowByKey(employeeRows, d => d.nationalId)
  const referenceByEmail = new Map(
    reference.employees.flatMap(e => (e.email ? [[e.email, e.externalId] as const] : []))
  )
  /** Duplicate person id → the id that survives. */
  const aliases = new Map<string, string>()

  out.employees = employeeRows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const data = row.base.data

    const owner = duplicateOf(row, firstEmployee, data.externalId)
    if (archived.employee(data.externalId)) extra.push(archivedIssue('externalId', data.externalId))
    if (archived.employeeEmail(data.managerEmail))
      extra.push(archivedIssue('managerEmail', data.managerEmail ?? ''))
    if (archived.department(data.department))
      extra.push(archivedIssue('department', data.department ?? ''))
    if (archived.position(data.position)) extra.push(archivedIssue('position', data.position ?? ''))
    if (owner) {
      extra.push(issue('externalId', 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))
    } else {
      const twin =
        duplicateOf(row, firstByEmail, data.email) ??
        duplicateOf(row, firstByNationalId, data.nationalId)
      const twinId = twin?.base.data?.externalId
      const referenceTwin = data.email ? referenceByEmail.get(data.email) : undefined
      if (twinId && twinId !== data.externalId) {
        extra.push(
          issue('row', 'DUPLICATE_PERSON', 'error', { otherId: twinId, firstRow: twin.rowNumber })
        )
        aliases.set(data.externalId, twinId)
      } else if (referenceTwin && referenceTwin !== data.externalId) {
        extra.push(issue('row', 'DUPLICATE_PERSON', 'error', { otherId: referenceTwin }))
        aliases.set(data.externalId, referenceTwin)
      }
    }

    const department = data.department && departments.canonical(data.department)
    if (department !== data.department) {
      extra.push(
        issue('department', 'VALUE_NORMALIZED', 'warning', {
          raw: data.department ?? '',
          value: department ?? '',
        })
      )
    }
    const position = data.position && positions.canonical(data.position)
    if (position !== data.position) {
      extra.push(
        issue('position', 'VALUE_NORMALIZED', 'warning', {
          raw: data.position ?? '',
          value: position ?? '',
        })
      )
    }
    // Announced on a row that will be imported, not on one an error leaves out.
    if (![...row.base.issues, ...extra].some(i => i.severity === 'error'))
      extra.push(...newDepartment('department', department), ...newPosition('position', position))
    return finalize<EmployeeInput>(row, { ...data, department, position }, extra)
  })

  // Managers must resolve against employees that will actually be imported (or already exist).
  const validEmails = new Set<string>(reference.employees.flatMap(e => (e.email ? [e.email] : [])))
  const validEmployeeIds = new Set<string>(reference.employees.map(e => e.externalId))
  const nameById = new Map<string, string>(reference.employees.map(e => [e.externalId, e.fullName]))
  for (const row of out.employees) {
    if (!isCommitted(row)) continue
    validEmployeeIds.add(row.data.externalId)
    nameById.set(row.data.externalId, sortName(row.data))
    if (row.data.email) validEmails.add(row.data.email)
  }
  out.employees = out.employees.map(row => {
    const managerEmail = row.data?.managerEmail
    if (!row.data || !managerEmail || validEmails.has(managerEmail) || row.isSkipped) return row
    return {
      ...row,
      data: { ...row.data, managerEmail: null },
      warnings: [
        ...row.warnings,
        issue('managerEmail', 'MANAGER_NOT_FOUND', 'warning', { value: managerEmail }),
      ],
    }
  })

  // Nobody may end up managing themselves, directly or round a loop.
  const idByEmail = new Map<string, string>(
    reference.employees.flatMap(e => (e.email ? [[e.email, e.externalId] as const] : []))
  )
  const imported = out.employees.filter((r): r is typeof r & { data: EmployeeInput } =>
    isCommitted(r)
  )
  for (const row of imported) if (row.data.email) idByEmail.set(row.data.email, row.data.externalId)
  const links = new Map(
    imported.map(r => [
      r.data.externalId,
      r.data.managerEmail ? (idByEmail.get(r.data.managerEmail) ?? null) : null,
    ])
  )
  const loops = managerLoops(
    links,
    imported.map(r => r.data.externalId)
  )
  out.employees = out.employees.map(row => {
    if (!row.data || !loops.has(row.data.externalId) || row.isSkipped || row.isRemoved) return row
    return {
      ...row,
      data: { ...row.data, managerEmail: null },
      warnings: [
        ...row.warnings,
        issue('managerEmail', 'MANAGER_CYCLE', 'warning', { value: row.data.managerEmail ?? '' }),
      ],
    }
  })

  // ---- rooms ------------------------------------------------------------------------------
  const roomRows = batch.rooms ?? []
  const firstRoom = firstRowByKey(roomRows, d => fold(d.name))
  // A room the database already has keeps its spelling: "Ucebna 1" updates "Učebna 1".
  const roomSpelling = new Canonicalizer(
    roomRows.filter(usable).map(r => r.base.data.name),
    reference.rooms
  )
  out.rooms = roomRows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const data = row.base.data
    const owner = duplicateOf(row, firstRoom, fold(data.name))
    if (owner) extra.push(issue('name', 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))
    if (archived.room(data.name)) extra.push(archivedIssue('name', data.name))
    const name = roomSpelling.canonical(data.name)
    if (!owner && name !== data.name)
      extra.push(issue('name', 'VALUE_NORMALIZED', 'warning', { raw: data.name, value: name }))
    return finalize<RoomInput>(row, { ...data, name }, extra)
  })
  const roomNames = out.rooms.flatMap(r => (isCommitted(r) ? [r.data.name] : []))

  // ---- sessions ---------------------------------------------------------------------------
  const sessionRows = batch.sessions ?? []
  // A session's place resolves to a room in this batch or the database (spelling variants
  // join); otherwise the room is created from the sessions held there.
  const knownRooms = new Canonicalizer(roomNames, reference.rooms)
  const rooms = new Canonicalizer(
    sessionRows.filter(usable).map(r => r.base.data.location),
    [...roomNames, ...reference.rooms]
  )
  // The first session held in an unknown room says it will be created; the rest just use it.
  const firstInRoom = firstRowByKey(sessionRows, d => rooms.keyOf(d.location))
  const firstSession = firstRowByKey(sessionRows, d => d.externalId)
  const firstSlot = firstRowByKey(
    sessionRows,
    d => `${d.courseCode}|${d.date}|${d.startTime}|${fold(d.location)}`
  )
  // What each room offers: the rooms file wins over the register; a room neither knows is
  // created from its sessions, so it fits them.
  const facts = new Map<string, Omit<RoomFacts, 'id'>>(
    (reference.roomFacts ?? []).map(r => [rooms.keyOf(r.name), r])
  )
  for (const row of out.rooms) {
    if (!isCommitted(row)) continue
    const known = facts.get(rooms.keyOf(row.data.name))
    facts.set(rooms.keyOf(row.data.name), {
      ...row.data,
      capabilities: row.data.capabilities ?? known?.capabilities ?? [],
    })
  }
  const needsByCourse = new Map(
    reference.courses.flatMap(c => (c.needs ? [[c.code, c.needs]] : []))
  )
  // Who holds each session: the provider it names, which must offer the course (as the
  // register says, or as this batch's completions will make it: a provider that delivered a
  // course offers it); else the default provider, which is given the course where it lacks it.
  // Completions commit first, so a provider they create (or a default they make) counts.
  const deliveries = (batch.completions ?? []).filter(usable).flatMap(r => {
    const d = r.base.data
    return d.provider ? [{ provider: fold(d.provider), course: d.courseCode }] : []
  })
  const knownProviders = new Set([
    ...reference.providers.map(fold),
    ...deliveries.map(d => d.provider),
  ])
  const offers = new Set([
    ...reference.courses.flatMap(c => (c.offeredBy ?? []).map(p => `${fold(p)}|${c.code}`)),
    ...deliveries.map(d => `${d.provider}|${d.course}`),
  ])
  const defaultProvider =
    reference.defaultProvider ?? (deliveries.length > 0 ? 'from completions' : null)
  const firstWithoutOffer = firstRowByKey(
    sessionRows.filter(r => usable(r) && r.base.data.providerName === null),
    d => d.courseCode
  )
  // Planned sessions that hold a room: the register's (unless this batch replaces them) and
  // the batch's own, in file order.
  const batchIds = new Set(sessionRows.filter(usable).map(r => r.base.data.externalId))
  const held = (reference.plannedSessions ?? [])
    .filter(s => !batchIds.has(s.externalId))
    .map(s => ({ ...s, key: rooms.keyOf(s.room) }))
  out.sessions = sessionRows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const data = row.base.data
    const owner = duplicateOf(row, firstSession, data.externalId)
    if (owner)
      extra.push(issue('externalId', 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))
    if (archived.session(data.externalId)) extra.push(archivedIssue('externalId', data.externalId))
    if (archived.course(data.courseCode)) {
      extra.push(archivedIssue('courseCode', data.courseCode))
    } else if (!courseValidity.has(data.courseCode)) {
      extra.push(issue('courseCode', 'COURSE_NOT_FOUND', 'error', { value: data.courseCode }))
    }
    const slotTwin = duplicateOf(
      row,
      firstSlot,
      `${data.courseCode}|${data.date}|${data.startTime}|${fold(data.location)}`
    )
    if (!owner && slotTwin?.base.data) {
      extra.push(
        issue('date', 'DUPLICATE_SLOT', 'warning', { otherId: slotTwin.base.data.externalId })
      )
    }
    if (data.providerName !== null) {
      const name = fold(data.providerName)
      if (!knownProviders.has(name))
        extra.push(issue('provider', 'PROVIDER_UNKNOWN', 'error', { value: data.providerName }))
      else if (!offers.has(`${name}|${data.courseCode}`))
        extra.push(
          issue('provider', 'PROVIDER_NOT_OFFERING', 'error', {
            value: data.providerName,
            course: data.courseCode,
          })
        )
    } else if (defaultProvider === null) {
      extra.push(issue('provider', 'NO_DEFAULT_PROVIDER', 'error'))
    } else if (
      reference.defaultProvider &&
      !offers.has(`${fold(reference.defaultProvider)}|${data.courseCode}`) &&
      firstWithoutOffer.get(data.courseCode) === row
    ) {
      extra.push(
        issue('provider', 'OFFERING_ADDED', 'warning', {
          value: reference.defaultProvider,
          course: data.courseCode,
        })
      )
    }
    const location = rooms.canonical(data.location)
    const room = facts.get(rooms.keyOf(data.location))
    if (!owner && data.status === 'PLANNED') {
      if (room && room.kind !== 'ONLINE' && room.capacity !== null && room.capacity < data.capacity)
        extra.push(
          issue('capacity', 'ROOM_TOO_SMALL', 'warning', {
            value: data.capacity,
            capacity: room.capacity,
          })
        )
      const needs = needsByCourse.get(data.courseCode)
      if (room && needs && roomMismatch({ ...room, id: '' }, needs, null))
        extra.push(issue('location', 'ROOM_UNSUITABLE', 'warning', { value: location }))
      // An online room is never taken; a room only the sessions name is online by its name.
      if ((room?.kind ?? roomKindOfName(location)) !== 'ONLINE' && !slotTwin) {
        const key = rooms.keyOf(data.location)
        const clash = held.find(h => h.key === key && overlaps(h, data))
        if (clash)
          extra.push(issue('location', 'ROOM_BUSY', 'warning', { otherId: clash.externalId }))
        held.push({ ...data, room: location, key })
      }
    }
    if (archived.room(data.location)) {
      extra.push(archivedIssue('location', data.location))
    } else if (!knownRooms.has(data.location)) {
      if (firstInRoom.get(rooms.keyOf(data.location)) === row)
        extra.push(issue('location', 'ROOM_DERIVED', 'warning', { value: location }))
    } else if (location !== data.location) {
      extra.push(
        issue('location', 'VALUE_NORMALIZED', 'warning', { raw: data.location, value: location })
      )
    }
    return finalize<SessionInput>(row, { ...data, location }, extra)
  })

  // ---- completions ------------------------------------------------------------------------
  const completionRows = batch.completions ?? []
  const firstCompletion = firstRowByKey(completionRows, d => d.externalId)
  const providers = new Canonicalizer(
    completionRows
      .filter(usable)
      .flatMap(r => (r.base.data.provider ? [r.base.data.provider] : [])),
    reference.providers
  )
  const newProvider = creations(reference.providers, v => providers.keyOf(v))
  out.completions = completionRows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    let data = row.base.data

    const owner = duplicateOf(row, firstCompletion, data.externalId)
    if (owner)
      extra.push(issue('externalId', 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))
    if (archived.completion(data.externalId))
      extra.push(archivedIssue('externalId', data.externalId))

    const survivor = aliases.get(data.employeeExternalId)
    if (survivor) {
      extra.push(
        issue('employeeExternalId', 'EMPLOYEE_REMAPPED', 'warning', {
          raw: data.employeeExternalId,
          value: survivor,
        })
      )
      data = { ...data, employeeExternalId: survivor }
    }
    if (archived.employee(data.employeeExternalId)) {
      extra.push(archivedIssue('employeeExternalId', data.employeeExternalId))
    } else if (!validEmployeeIds.has(data.employeeExternalId)) {
      extra.push(
        issue('employeeExternalId', 'EMPLOYEE_NOT_FOUND', 'error', {
          value: data.employeeExternalId,
        })
      )
    } else {
      const expected = nameById.get(data.employeeExternalId)
      const given = row.raw['employeeName']?.trim() ?? ''
      if (expected && given !== '' && !sameName(given, expected)) {
        extra.push(
          issue('employeeName', 'NAME_MISMATCH', 'warning', { raw: given, value: expected })
        )
      }
    }

    if (archived.course(data.courseCode)) {
      extra.push(archivedIssue('courseCode', data.courseCode))
    } else if (!courseValidity.has(data.courseCode)) {
      extra.push(issue('courseCode', 'COURSE_NOT_FOUND', 'error', { value: data.courseCode }))
    } else {
      const months = courseValidity.get(data.courseCode) ?? null
      if (months !== null) {
        const derived = addMonths(data.completedOn, months)
        if (data.validUntil === null) {
          extra.push(issue('validUntil', 'VALIDITY_DERIVED', 'warning', { value: derived }))
          data = { ...data, validUntil: derived }
        } else if (data.validUntil !== derived) {
          extra.push(
            issue('validUntil', 'VALIDITY_MISMATCH', 'warning', {
              raw: data.validUntil,
              value: derived,
            })
          )
        }
      }
    }

    if (archived.provider(data.provider)) {
      extra.push(archivedIssue('provider', data.provider ?? ''))
    } else if (data.provider) {
      const provider = providers.canonical(data.provider)
      if (provider !== data.provider) {
        extra.push(
          issue('provider', 'VALUE_NORMALIZED', 'warning', { raw: data.provider, value: provider })
        )
        data = { ...data, provider }
      }
      if (![...row.base.issues, ...extra].some(i => i.severity === 'error'))
        extra.push(...newProvider('provider', data.provider))
    }
    return finalize<CompletionInput>(row, data, extra)
  })

  return out
}

/** `"Novotny Adam"` matches `"Novotný Adam"` and `"Adam Novotný"`. */
function sameName(given: string, expected: string): boolean {
  const a = fold(given)
  const b = fold(expected)
  return a === b || a === b.split(' ').reverse().join(' ')
}

/**
 * Every key in the batch that could name an archived record, for the server to check (it
 * answers with the ones only archived records hold). Names are sent as written; the server
 * compares them folded.
 */
export function archivedCandidates(batch: ImportBatch): ArchivedKeys {
  const keys = <T>(rows: ParsedRow<T>[] | undefined, pick: (data: T) => (string | null)[]) => [
    ...new Set(
      (rows ?? []).flatMap(r => (r.base.data ? pick(r.base.data) : [])).filter(v => v !== null)
    ),
  ]
  const requirementsOf = (scope: 'DEPARTMENT' | 'POSITION') => (c: CourseInput) =>
    c.requirements.flatMap(q =>
      q.scope === 'DEPARTMENT' && scope === 'DEPARTMENT'
        ? [q.department]
        : q.scope === 'POSITION' && scope === 'POSITION'
          ? [q.position]
          : []
    )
  return {
    courses: [
      ...new Set([
        ...keys(batch.courses, c => [c.code]),
        ...keys(batch.sessions, s => [s.courseCode]),
        ...keys(batch.completions, c => [c.courseCode]),
      ]),
    ],
    employees: [
      ...new Set([
        ...keys(batch.employees, e => [e.externalId]),
        ...keys(batch.completions, c => [c.employeeExternalId]),
      ]),
    ],
    employeeEmails: keys(batch.employees, e => [e.managerEmail]),
    departments: [
      ...new Set([
        ...keys(batch.employees, e => [e.department]),
        ...keys(batch.courses, requirementsOf('DEPARTMENT')),
      ]),
    ],
    positions: [
      ...new Set([
        ...keys(batch.employees, e => [e.position]),
        ...keys(batch.courses, requirementsOf('POSITION')),
      ]),
    ],
    providers: keys(batch.completions, c => [c.provider]),
    rooms: [
      ...new Set([...keys(batch.rooms, r => [r.name]), ...keys(batch.sessions, s => [s.location])]),
    ],
    sessions: keys(batch.sessions, s => [s.externalId]),
    completions: keys(batch.completions, c => [c.externalId]),
  }
}
