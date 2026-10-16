import type {
  CompletionInput,
  CourseInput,
  EmployeeInput,
  RoomInput,
  SessionInput,
} from '@muni/domain/schemas'
import { addMonths } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import { Canonicalizer, DEPARTMENT_ALIASES } from './canonical'
import type { IssueCode } from './issues'
import type { ImportBatch, ParsedRow, ReferenceSnapshot, Severity, ValidationIssue } from './types'

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
  return { ...row, data: isValid ? data : null, errors, warnings, isValid }
}

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

  // ---- courses ----------------------------------------------------------------------------
  const firstCourse = firstRowByKey(courseRows, d => d.code)
  out.courses = courseRows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const owner = duplicateOf(row, firstCourse, row.base.data.code)
    if (owner) extra.push(issue('code', 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))

    const requirements = row.base.data.requirements.map(r => {
      if (r.scope === 'DEPARTMENT') {
        if (!knownDepartments.has(r.department)) {
          extra.push(issue('requiredFor', 'UNKNOWN_DEPARTMENT', 'warning', { value: r.department }))
        }
        return { ...r, department: departments.canonical(r.department) }
      }
      if (r.scope === 'POSITION') {
        if (!knownPositions.has(r.position)) {
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
    if (row.isValid && !row.isRemoved && row.data)
      courseValidity.set(row.data.code, row.data.validityMonths)
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
    return finalize<EmployeeInput>(row, { ...data, department, position }, extra)
  })

  // Managers must resolve against employees that will actually be imported (or already exist).
  const validEmails = new Set<string>(reference.employees.flatMap(e => (e.email ? [e.email] : [])))
  const validEmployeeIds = new Set<string>(reference.employees.map(e => e.externalId))
  const nameById = new Map<string, string>(reference.employees.map(e => [e.externalId, e.fullName]))
  for (const row of out.employees) {
    if (!row.isValid || row.isRemoved || !row.data) continue
    validEmployeeIds.add(row.data.externalId)
    nameById.set(row.data.externalId, `${row.data.lastName} ${row.data.firstName}`)
    if (row.data.email) validEmails.add(row.data.email)
  }
  out.employees = out.employees.map(row => {
    const managerEmail = row.data?.managerEmail
    if (!row.data || !managerEmail || validEmails.has(managerEmail)) return row
    return {
      ...row,
      data: { ...row.data, managerEmail: null },
      warnings: [
        ...row.warnings,
        issue('managerEmail', 'MANAGER_NOT_FOUND', 'warning', { value: managerEmail }),
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
    const name = roomSpelling.canonical(data.name)
    if (!owner && name !== data.name)
      extra.push(issue('name', 'VALUE_NORMALIZED', 'warning', { raw: data.name, value: name }))
    return finalize<RoomInput>(row, { ...data, name }, extra)
  })
  const roomNames = out.rooms.flatMap(r =>
    r.isValid && !r.isRemoved && r.data ? [r.data.name] : []
  )

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
  out.sessions = sessionRows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const data = row.base.data
    const owner = duplicateOf(row, firstSession, data.externalId)
    if (owner)
      extra.push(issue('externalId', 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))
    if (!courseValidity.has(data.courseCode)) {
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
    const location = rooms.canonical(data.location)
    if (!knownRooms.has(data.location)) {
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
  out.completions = completionRows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    let data = row.base.data

    const owner = duplicateOf(row, firstCompletion, data.externalId)
    if (owner)
      extra.push(issue('externalId', 'DUPLICATE_ID', 'error', { firstRow: owner.rowNumber }))

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
    if (!validEmployeeIds.has(data.employeeExternalId)) {
      extra.push(
        issue('employeeExternalId', 'EMPLOYEE_NOT_FOUND', 'error', {
          value: data.employeeExternalId,
        })
      )
    } else {
      const expected = nameById.get(data.employeeExternalId)
      const given = row.raw.employeeName?.trim() ?? ''
      if (expected && given !== '' && !sameName(given, expected)) {
        extra.push(
          issue('employeeName', 'NAME_MISMATCH', 'warning', { raw: given, value: expected })
        )
      }
    }

    if (!courseValidity.has(data.courseCode)) {
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

    if (data.provider) {
      const provider = providers.canonical(data.provider)
      if (provider !== data.provider) {
        extra.push(
          issue('provider', 'VALUE_NORMALIZED', 'warning', { raw: data.provider, value: provider })
        )
        data = { ...data, provider }
      }
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
