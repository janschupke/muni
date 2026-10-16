import {
  type ComplianceCell,
  type ComplianceCounts,
  complianceRate,
  countStatuses,
  worstStatus,
} from '@muni/domain/compliance'
import type { ComplianceStatus, EmploymentStatus, Role } from '@muni/domain/enums'
import { sanitizeRecord } from '@muni/domain/sanitize'
import { type IsoDate, isoDateFromUtc } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import { ACTIVE, isArchived, type PersonRef, personSelect, toPersonRef } from './archive'
import {
  countedCells,
  dbOf,
  getPolicy,
  loadCompliance,
  type RepoOptions,
  toAmount,
} from './context'
import { compareNames, type EmployeeSortKey, sortEmployees } from './employee-sort'
import { courseOf, loadNextBookings, type RequirementContext, requirementOf } from './requirements'

export interface EmployeeListItem {
  externalId: string
  firstName: string
  lastName: string
  department: string | null
  departmentId: string | null
  position: string | null
  positionId: string | null
  status: EmploymentStatus
  /** Worst requirement status; null when nothing is required (or terminated). */
  compliance: ComplianceStatus | null
  counts: ComplianceCounts
  /** Every required course with its state, for the row's detail panel. */
  requirements: EmployeeListRequirement[]
}

export interface EmployeeListRequirement {
  courseCode: string
  courseName: string
  status: ComplianceStatus
  completedOn: IsoDate | null
  validUntil: IsoDate | null
  /** Days from today to `validUntil` (negative once expired); null without an expiry. */
  daysLeft: number | null
  /** The person's next named booking for this course, if any. */
  booked: { sessionExternalId: string; startsAt: string } | null
}

/** What a person's record is built from: the person as stored, with their place. */
export interface EmployeeSource {
  externalId: string
  firstName: string
  lastName: string
  status: EmploymentStatus
  department: { id: string; name: string } | null
  position: { id: string; name: string } | null
}

/** One person as every list shows them: where they sit, their compliance, each requirement. */
export function employeeRecord(
  e: EmployeeSource,
  cells: readonly ComplianceCell[],
  context: RequirementContext
): EmployeeListItem {
  return {
    externalId: e.externalId,
    firstName: e.firstName,
    lastName: e.lastName,
    department: e.department?.name ?? null,
    departmentId: e.department?.id ?? null,
    position: e.position?.name ?? null,
    positionId: e.position?.id ?? null,
    status: e.status,
    compliance: worstStatus(cells.map(c => c.status)),
    counts: countStatuses(cells),
    requirements: cells
      .map(c => requirementOf(c, context))
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
  }
}

export interface EmployeeFilters {
  q?: string | undefined
  /** Department name (the list's URL filter). */
  department?: string | undefined
  /** Position name. */
  position?: string | undefined
  /** Direct reports of this person (external ID); people who left are not reports. */
  manager?: string | undefined
  status?: EmploymentStatus | undefined
  /** People with at least one required training in this state. */
  compliance?: ComplianceStatus | undefined
  /** Defaults to name, ascending. */
  sort?: { by: EmployeeSortKey; desc: boolean } | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export async function listEmployees(
  filters: EmployeeFilters = {},
  options?: RepoOptions
): Promise<Page<EmployeeListItem>> {
  const db = dbOf(options)
  const [employees, compliance, courses, bookings] = await Promise.all([
    db.employee.findMany({
      where: {
        ...ACTIVE,
        ...(filters.department && { department: { name: filters.department, ...ACTIVE } }),
        ...(filters.position && { position: { name: filters.position, ...ACTIVE } }),
        ...(filters.manager && {
          manager: { externalId: filters.manager, ...ACTIVE },
          status: { not: 'TERMINATED' as const },
        }),
        ...(filters.status && { status: filters.status }),
      },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        status: true,
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    loadCompliance(options),
    db.course.findMany({ where: ACTIVE, select: { id: true, code: true, name: true } }),
    loadNextBookings(db),
  ])

  const context = {
    courses: new Map(courses.map(c => [c.id, c])),
    asOf: compliance.options.asOf,
    bookings,
  }
  const cellsByEmployee = Map.groupBy(compliance.cells, c => c.employeeId)
  const q = filters.q ? fold(filters.q) : ''
  const items = employees
    .map(e => employeeRecord(e, cellsByEmployee.get(e.id) ?? [], context))
    .filter(e => !q || fold(`${e.firstName} ${e.lastName} ${e.externalId}`).includes(q))
    // "Has a training in this state", so the list matches the dashboard's counts of trainings:
    // someone with one expired and one missing course appears under both.
    .filter(e => !filters.compliance || e.counts[filters.compliance] > 0)

  // Postgres orders names by its own collation (Č after Z); re-sort by Czech rules, then by
  // the requested column. The sort is stable, so ties stay in name order.
  sortEmployees(items, 'name', false)
  if (filters.sort) sortEmployees(items, filters.sort.by, filters.sort.desc)

  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(Math.max(filters.page ?? 1, 1), pageCount)
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
    pageCount,
  }
}

interface EmployeeRequirementRow {
  courseCode: string
  courseName: string
  status: ComplianceStatus
  completedOn: IsoDate | null
  validUntil: IsoDate | null
}

interface EmployeeCompletionRow {
  externalId: string
  courseCode: string
  courseName: string
  /** The course is archived: shown muted, not linked. */
  courseArchived: boolean
  completedOn: IsoDate
  validUntil: IsoDate | null
  provider: { id: string; name: string; archived: boolean } | null
  price?: number | null
  note?: string | null
}

export interface TeamMember {
  externalId: string
  name: string
  position: string | null
  status: EmploymentStatus
  compliance: ComplianceStatus | null
  counts: ComplianceCounts
}

export interface EmployeeDetail {
  externalId: string
  firstName: string
  lastName: string
  email?: string | null
  nationalId?: string | null
  note?: string | null
  department: string | null
  departmentId: string | null
  position: string | null
  positionId: string | null
  /** Anonymised once the manager is archived. */
  manager: PersonRef | null
  /** Direct reports who have not left, with their compliance; empty for non-managers. */
  reports: TeamMember[]
  /** All of the reports' required trainings together. */
  teamCounts: ComplianceCounts
  hiredOn: IsoDate
  leftOn: IsoDate | null
  status: EmploymentStatus
  requirements: EmployeeRequirementRow[]
  completionRate: number
  completions: EmployeeCompletionRow[]
}

/** One employee as the given role may see them. Sensitive fields go through the policy. */
export async function getEmployee(
  externalId: string,
  role: Role,
  options?: RepoOptions
): Promise<EmployeeDetail | null> {
  const db = dbOf(options)
  const employee = await db.employee.findFirst({
    where: { externalId, ...ACTIVE },
    include: {
      department: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
      manager: { select: personSelect },
      reports: {
        where: { ...ACTIVE, status: { not: 'TERMINATED' } },
        select: {
          id: true,
          externalId: true,
          firstName: true,
          lastName: true,
          status: true,
          position: { select: { name: true } },
        },
      },
      completions: {
        where: ACTIVE,
        include: {
          course: { select: { code: true, name: true, archivedAt: true } },
          provider: { select: { id: true, name: true, archivedAt: true } },
        },
        orderBy: { completedOn: 'desc' },
      },
    },
  })
  if (!employee) return null

  const compliance = await loadCompliance(options)
  const cells = compliance.cells.filter(c => c.employeeId === employee.id)
  const cellsByPerson = Map.groupBy(compliance.cells, c => c.employeeId)
  const reports = employee.reports.toSorted(compareNames).map((r): TeamMember => {
    const own = cellsByPerson.get(r.id) ?? []
    return {
      externalId: r.externalId,
      name: `${r.lastName} ${r.firstName}`,
      position: r.position?.name ?? null,
      status: r.status,
      compliance: worstStatus(own.map(c => c.status)),
      counts: countStatuses(own),
    }
  })
  const courses = await db.course.findMany({
    where: { id: { in: cells.map(c => c.courseId) } },
    select: { id: true, code: true, name: true },
  })
  const courseById = new Map(courses.map(c => [c.id, c]))
  const policy = getPolicy()

  const base = sanitizeRecord(
    policy,
    'employee',
    { email: employee.email, nationalId: employee.nationalId, note: employee.note },
    role
  )

  return {
    ...base,
    externalId: employee.externalId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    department: employee.department?.name ?? null,
    departmentId: employee.department?.id ?? null,
    position: employee.position?.name ?? null,
    positionId: employee.position?.id ?? null,
    manager: employee.manager ? toPersonRef(employee.manager) : null,
    reports,
    // The team's rate counts its active people, like every other rate.
    teamCounts: countStatuses(
      countedCells(compliance).filter(c => employee.reports.some(r => r.id === c.employeeId))
    ),
    hiredOn: isoDateFromUtc(employee.hiredOn),
    leftOn: employee.leftOn ? isoDateFromUtc(employee.leftOn) : null,
    status: employee.status,
    requirements: cells
      .map(c => ({
        courseCode: courseOf(courseById, c).code,
        courseName: courseOf(courseById, c).name,
        status: c.status,
        completedOn: c.basis?.completedOn ?? null,
        validUntil: c.basis?.validUntil ?? null,
      }))
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
    completionRate: complianceRate(countStatuses(cells)),
    completions: employee.completions.map(c =>
      sanitizeRecord(
        policy,
        'completion',
        {
          externalId: c.externalId,
          courseCode: c.course.code,
          courseName: c.course.name,
          courseArchived: isArchived(c.course),
          completedOn: isoDateFromUtc(c.completedOn),
          validUntil: c.validUntil ? isoDateFromUtc(c.validUntil) : null,
          provider: c.provider && {
            id: c.provider.id,
            name: c.provider.name,
            archived: isArchived(c.provider),
          },
          price: toAmount(c.price),
          note: c.note,
        },
        role
      )
    ),
  }
}

/** Raw values for the edit form. Only call once the user is known to be an admin. */
export async function getEmployeeForEdit(externalId: string, options?: RepoOptions) {
  const employee = await dbOf(options).employee.findFirst({
    where: { externalId, ...ACTIVE },
    include: { department: { select: { name: true } }, position: { select: { name: true } } },
  })
  if (!employee) return null
  return {
    externalId: employee.externalId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    department: employee.department?.name ?? null,
    position: employee.position?.name ?? null,
    hiredOn: isoDateFromUtc(employee.hiredOn),
    leftOn: employee.leftOn ? isoDateFromUtc(employee.leftOn) : null,
    status: employee.status,
    note: employee.note,
  }
}
