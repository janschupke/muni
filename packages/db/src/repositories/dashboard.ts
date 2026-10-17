import { type ComplianceCounts, complianceRate, countStatuses } from '@muni/domain/compliance'
import { sortName } from '@muni/domain/names'

import { ACTIVE } from './archive'
import { mandatoryCourse } from './audience'
import { dbOf, loadCompliance, type RepoOptions } from './context'
import type { SessionListItem } from './courses'
import { compareNames } from './employee-sort'
import type { EmployeeListRequirement } from './employees'
import { stillEmployed } from './employment'
import { activeDepartments } from './lookups'
import { loadNextBookings, requirementOf } from './requirements'
import { listSessions } from './sessions'

export interface DashboardData {
  asOf: string
  expiringWithinDays: number
  activeEmployees: number
  parentalLeave: number
  counts: ComplianceCounts
  /** Active people with at least one training in each state (the lists the cards link to). */
  people: Record<'EXPIRING' | 'EXPIRED' | 'MISSING', number>
  rate: number
  byDepartment: { department: string; rate: number; counts: ComplianceCounts }[]
  upcomingSessions: SessionListItem[]
}

export async function getDashboard(options?: RepoOptions): Promise<DashboardData> {
  const [compliance, departments, upcomingSessions] = await Promise.all([
    loadCompliance(options),
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
        return { department: d.name, rate: complianceRate(deptCounts), counts: deptCounts }
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
  department: string
  headcount: number
  cells: Record<string, { counts: ComplianceCounts; rate: number } | null>
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
  const [compliance, departments, courses, people, bookings] = await Promise.all([
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
    loadNextBookings(db),
  ])
  const active = compliance.employees.filter(e => e.status === 'ACTIVE')
  const activeIds = new Set(active.map(e => e.id))
  const departmentOf = new Map(active.map(e => [e.id, e.departmentId]))
  const cells = compliance.cells.filter(c => activeIds.has(c.employeeId))
  const byPair = Map.groupBy(cells, c => `${departmentOf.get(c.employeeId) ?? ''}|${c.courseId}`)
  const cellsByPerson = Map.groupBy(cells, c => c.employeeId)
  const peopleByDepartment = Map.groupBy(people.toSorted(compareNames), p => p.departmentId)
  const context = {
    courses: new Map(courses.map(c => [c.id, c])),
    asOf: compliance.options.asOf,
    bookings,
  }

  return {
    asOf: compliance.options.asOf,
    courses: courses.map(c => ({ code: c.code, name: c.name })),
    rows: departments
      .map(d => ({
        department: d.name,
        headcount: active.filter(e => e.departmentId === d.id).length,
        cells: Object.fromEntries(
          courses.map(course => {
            const pair = byPair.get(`${d.id}|${course.id}`)
            if (!pair) return [course.code, null]
            const counts = countStatuses(pair)
            return [course.code, { counts, rate: complianceRate(counts) }]
          })
        ),
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
      }))
      .filter(r => r.headcount > 0),
  }
}
