import {
  type ComplianceCounts,
  complianceRate,
  countStatuses,
  departmentMatrix,
  type MatrixCell,
} from '@muni/domain/compliance'
import { sortName } from '@muni/domain/names'

import { ACTIVE } from '../archive/archive'
import { mandatoryCourse } from '../catalog/audience'
import type { SessionListItem } from '../catalog/courses'
import { loadBookingContext, type RequirementContext, requirementOf } from '../catalog/requirements'
import { dbOf, loadCompliance, nowOf, type RepoOptions, type WithCompliance } from '../core/context'
import { activeDepartments } from '../core/lookups'
import { compareNames } from '../people/employee-sort'
import type { EmployeeListRequirement } from '../people/employees'
import { stillEmployed } from '../people/employment'
import { listSessions } from '../scheduling/sessions'

export interface DashboardData {
  asOf: string
  expiringWithinDays: number
  activeEmployees: number
  parentalLeave: number
  counts: ComplianceCounts
  /** Active people with at least one training in each state (the lists the cards link to). */
  people: Record<'EXPIRING' | 'EXPIRED' | 'MISSING', number>
  rate: number
  byDepartment: { id: string; department: string; rate: number; counts: ComplianceCounts }[]
  upcomingSessions: SessionListItem[]
}

export async function getDashboard(options?: WithCompliance): Promise<DashboardData> {
  const [compliance, departments, upcomingSessions] = await Promise.all([
    options?.compliance ?? loadCompliance(options),
    activeDepartments(options),
    listSessions({ window: 'upcoming', limit: 6 }, options),
  ])
  const active = new Set(compliance.employees.filter(e => e.status === 'ACTIVE').map(e => e.id))
  const activeCells = compliance.cells.filter(c => active.has(c.employeeId))
  const departmentOf = new Map(compliance.employees.map(e => [e.id, e.departmentId]))
  const cellsByDepartment = Map.groupBy(activeCells, c => departmentOf.get(c.employeeId) ?? null)
  const counts = countStatuses(activeCells)
  const peopleWith = (status: 'EXPIRING' | 'EXPIRED' | 'MISSING') =>
    new Set(activeCells.filter(c => c.status === status).map(c => c.employeeId)).size

  return {
    asOf: compliance.options.asOf,
    expiringWithinDays: compliance.options.expiringWithinDays,
    activeEmployees: active.size,
    parentalLeave: compliance.employees.filter(e => e.status === 'PARENTAL_LEAVE').length,
    counts,
    people: {
      EXPIRING: peopleWith('EXPIRING'),
      EXPIRED: peopleWith('EXPIRED'),
      MISSING: peopleWith('MISSING'),
    },
    rate: complianceRate(counts),
    byDepartment: departments
      .map(d => {
        const deptCounts = countStatuses(cellsByDepartment.get(d.id) ?? [])
        return {
          id: d.id,
          department: d.name,
          rate: complianceRate(deptCounts),
          counts: deptCounts,
        }
      })
      .filter(d => d.counts.total > 0)
      .sort((a, b) => a.rate - b.rate),
    upcomingSessions,
  }
}

export interface ComplianceMatrix {
  asOf: string
  courses: { code: string; name: string }[]
  rows: ComplianceMatrixRow[]
}

export interface ComplianceMatrixRow {
  departmentId: string
  department: string
  headcount: number
  cells: Record<string, MatrixCell | null>
  /** The department's active people, by name; their cells add up to the row's counts. */
  people: ComplianceMatrixPerson[]
}

export interface ComplianceMatrixPerson {
  externalId: string
  name: string
  position: string | null
  /** Per course code; null where the course is not required of this person. */
  cells: Record<string, EmployeeListRequirement | null>
}

/**
 * Department × mandatory course, active people only. A null cell means the course does
 * not apply there. Each row also carries its people, for the row and cell details.
 */
export async function getComplianceMatrix(options?: RepoOptions): Promise<ComplianceMatrix> {
  const db = dbOf(options)
  const [compliance, departments, courses, people, booking] = await Promise.all([
    loadCompliance(options),
    activeDepartments(options),
    db.course.findMany({
      where: { ...mandatoryCourse, ...ACTIVE },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    db.employee.findMany({
      // At work: active, and not past their leaving date (as compliance counts them).
      where: { ...ACTIVE, status: 'ACTIVE', ...stillEmployed(options?.asOf) },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        departmentId: true,
        position: { select: { name: true } },
      },
    }),
    loadBookingContext(db, nowOf(options)),
  ])
  const cellsByPerson = Map.groupBy(compliance.cells, c => c.employeeId)
  const peopleByDepartment = Map.groupBy(people.toSorted(compareNames), p => p.departmentId)
  const context: RequirementContext = {
    courses: new Map(courses.map(c => [c.id, c])),
    asOf: compliance.options.asOf,
    ...booking,
  }

  return {
    asOf: compliance.options.asOf,
    courses: courses.map(c => ({ code: c.code, name: c.name })),
    rows: departmentMatrix(departments, courses, compliance.employees, compliance.cells).map(
      ({ department: d, headcount, cells }) => ({
        departmentId: d.id,
        department: d.name,
        headcount,
        cells,
        people: (peopleByDepartment.get(d.id) ?? []).map(p => {
          const own = new Map((cellsByPerson.get(p.id) ?? []).map(c => [c.courseId, c]))
          return {
            externalId: p.externalId,
            name: sortName(p),
            position: p.position?.name ?? null,
            cells: Object.fromEntries(
              courses.map(course => {
                const cell = own.get(course.id)
                return [course.code, cell ? requirementOf(cell, context) : null]
              })
            ),
          }
        }),
      })
    ),
  }
}
