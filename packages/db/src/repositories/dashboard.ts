import { complianceRate, countStatuses, type ComplianceCounts } from '@muni/domain/compliance'

import { dbOf, loadCompliance, type RepoOptions } from './context'
import { listSessions } from './sessions'
import type { SessionListItem } from './courses'

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
  const db = dbOf(options)
  const [compliance, departments, upcomingSessions] = await Promise.all([
    loadCompliance(options),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
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
  rows: {
    department: string
    headcount: number
    cells: Record<string, { counts: ComplianceCounts; rate: number } | null>
  }[]
}

/** Department × mandatory course. A null cell means the course does not apply there. */
export async function getComplianceMatrix(options?: RepoOptions): Promise<ComplianceMatrix> {
  const db = dbOf(options)
  const [compliance, departments, courses] = await Promise.all([
    loadCompliance(options),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.course.findMany({
      where: { requirements: { some: {} } },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ])
  const active = compliance.employees.filter(e => e.status === 'ACTIVE')
  const activeIds = new Set(active.map(e => e.id))
  const departmentOf = new Map(active.map(e => [e.id, e.departmentId]))
  const cells = compliance.cells.filter(c => activeIds.has(c.employeeId))
  const byPair = Map.groupBy(cells, c => `${departmentOf.get(c.employeeId) ?? ''}|${c.courseId}`)

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
      }))
      .filter(r => r.headcount > 0),
  }
}
