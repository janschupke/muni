import {
  worstStatus,
  countStatuses,
  complianceRate,
  type ComplianceCounts,
} from '@muni/domain/compliance'
import type { ComplianceStatus, EmploymentStatus, Viewer } from '@muni/domain/enums'
import { sanitizeRecord } from '@muni/domain/sanitize'
import { fold } from '@muni/utils/text'
import { isoDateFromUtc, type IsoDate } from '@muni/utils/dates'

import { dbOf, getPolicy, loadCompliance, type RepoOptions } from './context'
import { sortEmployees, type EmployeeSortKey } from './employee-sort'

export interface EmployeeListItem {
  externalId: string
  firstName: string
  lastName: string
  department: string | null
  position: string | null
  status: EmploymentStatus
  /** Worst requirement status; null when nothing is required (or terminated). */
  compliance: ComplianceStatus | null
  counts: ComplianceCounts
}

export interface EmployeeFilters {
  q?: string
  department?: string
  status?: EmploymentStatus
  compliance?: ComplianceStatus
  /** Defaults to name, ascending. */
  sort?: { by: EmployeeSortKey; desc: boolean }
  page?: number
  pageSize?: number
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
  const [employees, compliance] = await Promise.all([
    db.employee.findMany({
      where: {
        ...(filters.department && { department: { name: filters.department } }),
        ...(filters.status && { status: filters.status }),
      },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        status: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    loadCompliance(options),
  ])

  const cellsByEmployee = Map.groupBy(compliance.cells, c => c.employeeId)
  const q = filters.q ? fold(filters.q) : ''
  const items = employees
    .map((e): EmployeeListItem => {
      const cells = cellsByEmployee.get(e.id) ?? []
      return {
        externalId: e.externalId,
        firstName: e.firstName,
        lastName: e.lastName,
        department: e.department?.name ?? null,
        position: e.position?.name ?? null,
        status: e.status,
        compliance: worstStatus(cells.map(c => c.status)),
        counts: countStatuses(cells),
      }
    })
    .filter(e => !q || fold(`${e.firstName} ${e.lastName} ${e.externalId}`).includes(q))
    .filter(e => !filters.compliance || e.compliance === filters.compliance)

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
  completedOn: IsoDate
  validUntil: IsoDate | null
  provider: string | null
  price?: number | null
  note?: string | null
}

export interface EmployeeDetail {
  externalId: string
  firstName: string
  lastName: string
  email?: string | null
  nationalId?: string | null
  note?: string | null
  department: string | null
  position: string | null
  manager: { externalId: string; name: string } | null
  hiredOn: IsoDate
  leftOn: IsoDate | null
  status: EmploymentStatus
  requirements: EmployeeRequirementRow[]
  completionRate: number
  completions: EmployeeCompletionRow[]
}

/** One employee as the given viewer may see them. Sensitive fields go through the policy. */
export async function getEmployee(
  externalId: string,
  viewer: Viewer,
  options?: RepoOptions
): Promise<EmployeeDetail | null> {
  const db = dbOf(options)
  const employee = await db.employee.findUnique({
    where: { externalId },
    include: {
      department: { select: { name: true } },
      position: { select: { name: true } },
      manager: { select: { externalId: true, firstName: true, lastName: true } },
      completions: {
        include: {
          course: { select: { code: true, name: true } },
          provider: { select: { name: true } },
        },
        orderBy: { completedOn: 'desc' },
      },
    },
  })
  if (!employee) return null

  const compliance = await loadCompliance(options)
  const cells = compliance.cells.filter(c => c.employeeId === employee.id)
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
    viewer
  )

  return {
    ...base,
    externalId: employee.externalId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    department: employee.department?.name ?? null,
    position: employee.position?.name ?? null,
    manager: employee.manager
      ? {
          externalId: employee.manager.externalId,
          name: `${employee.manager.firstName} ${employee.manager.lastName}`,
        }
      : null,
    hiredOn: isoDateFromUtc(employee.hiredOn),
    leftOn: employee.leftOn ? isoDateFromUtc(employee.leftOn) : null,
    status: employee.status,
    requirements: cells
      .map(c => ({
        courseCode: courseById.get(c.courseId)?.code ?? '',
        courseName: courseById.get(c.courseId)?.name ?? '',
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
          completedOn: isoDateFromUtc(c.completedOn),
          validUntil: c.validUntil ? isoDateFromUtc(c.validUntil) : null,
          provider: c.provider?.name ?? null,
          price: c.price === null ? null : Number(c.price),
          note: c.note,
        },
        viewer
      )
    ),
  }
}

/** Raw values for the edit form. Only call after the viewer is known to be signed in. */
export async function getEmployeeForEdit(externalId: string, options?: RepoOptions) {
  const employee = await dbOf(options).employee.findUnique({
    where: { externalId },
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
