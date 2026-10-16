import {
  complianceRate,
  countStatuses,
  type ComplianceCell,
  type ComplianceCounts,
} from '@muni/domain/compliance'
import type { EmploymentStatus } from '@muni/domain/enums'

import {
  audienceInclude,
  mandatoryCourse,
  requirementViews,
  type RequirementView,
} from './audience'
import { dbOf, loadCompliance, type RepoOptions } from './context'
import { compareNames } from './employee-sort'

// Departments and positions as the register sees them: who is in them, who leads them,
// what they must hold and how much of it they hold. Active people count toward compliance;
// people on parental leave are listed but not counted, people who left are ignored.

export interface PersonRef {
  externalId: string
  name: string
}

export interface CourseCompliance {
  code: string
  name: string
  /** Why the group must hold it: everyone, the department, or one of its positions. */
  requiredBy: RequirementView[]
  counts: ComplianceCounts
  rate: number
}

interface GroupSummary {
  id: string
  name: string
  active: number
  parentalLeave: number
  counts: ComplianceCounts
  rate: number
  /** Mandatory courses at least one active member must hold. */
  requiredCourses: number
  /** Active members with a training expired or never done. */
  actionNow: number
  /** Named bookings of members on sessions still ahead. */
  upcomingBookings: number
}

export interface DepartmentSummary extends GroupSummary {
  /** The person most members report to. */
  head: PersonRef | null
  positions: { id: string; name: string; count: number }[]
}

export interface PositionSummary extends GroupSummary {
  departments: { id: string; name: string; count: number }[]
}

export interface DepartmentDetail extends DepartmentSummary {
  courses: CourseCompliance[]
}

export interface PositionDetail extends PositionSummary {
  courses: CourseCompliance[]
}

type Member = {
  id: string
  externalId: string
  firstName: string
  lastName: string
  status: EmploymentStatus
  managerId: string | null
  departmentId: string | null
  positionId: string | null
  department: { id: string; name: string } | null
  position: { id: string; name: string } | null
}

async function loadOrg(options?: RepoOptions & { now?: Date }) {
  const db = dbOf(options)
  const now = options?.now ?? new Date()
  const [compliance, people, bookings, courses] = await Promise.all([
    loadCompliance(options),
    db.employee.findMany({
      where: { status: { not: 'TERMINATED' } },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        status: true,
        managerId: true,
        departmentId: true,
        positionId: true,
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    }),
    db.sessionAssignment.findMany({
      where: { session: { startsAt: { gt: now }, status: 'PLANNED' } },
      select: { employeeId: true },
    }),
    db.course.findMany({
      where: mandatoryCourse,
      select: { id: true, code: true, name: true, requiredForAll: true, ...audienceInclude },
      orderBy: { code: 'asc' },
    }),
  ])
  const byId = new Map(people.map(p => [p.id, p]))
  return { people, byId, cells: compliance.cells, bookings, courses }
}

type Org = Awaited<ReturnType<typeof loadOrg>>

/** The compliance cells of a group's active members. */
function activeCells(org: Org, members: Member[]): ComplianceCell[] {
  const active = new Set(members.filter(m => m.status === 'ACTIVE').map(m => m.id))
  return org.cells.filter(c => active.has(c.employeeId))
}

function summarise(org: Org, members: Member[]): Omit<GroupSummary, 'id' | 'name'> {
  const cells = activeCells(org, members)
  const counts = countStatuses(cells)
  const memberIds = new Set(members.map(m => m.id))
  return {
    active: members.filter(m => m.status === 'ACTIVE').length,
    parentalLeave: members.filter(m => m.status === 'PARENTAL_LEAVE').length,
    counts,
    rate: complianceRate(counts),
    requiredCourses: new Set(cells.map(c => c.courseId)).size,
    actionNow: new Set(
      cells.filter(c => c.status === 'EXPIRED' || c.status === 'MISSING').map(c => c.employeeId)
    ).size,
    upcomingBookings: org.bookings.filter(b => memberIds.has(b.employeeId)).length,
  }
}

/** Members grouped by a key, with a count per group, largest first. */
function tally(members: Member[], key: (m: Member) => { id: string; name: string } | null) {
  const groups = new Map<string, { id: string; name: string; count: number }>()
  for (const m of members) {
    const group = key(m)
    if (!group) continue
    const entry = groups.get(group.id) ?? { ...group, count: 0 }
    entry.count++
    groups.set(group.id, entry)
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'cs')
  )
}

function headOf(org: Org, members: Member[]): PersonRef | null {
  const reportsTo = new Map<string, number>()
  for (const m of members)
    if (m.managerId) reportsTo.set(m.managerId, (reportsTo.get(m.managerId) ?? 0) + 1)
  const ranked = [...reportsTo]
    .map(([id, count]) => ({ person: org.byId.get(id), count }))
    .filter((r): r is { person: Member; count: number } => r.person !== undefined)
    .sort((a, b) => b.count - a.count || compareNames(a.person, b.person))
  const head = ranked[0]?.person
  return head ? { externalId: head.externalId, name: `${head.lastName} ${head.firstName}` } : null
}

/** Per mandatory course the group's active members hold, with why the group needs it. */
function coursesOf(org: Org, members: Member[]): CourseCompliance[] {
  const groupCells = activeCells(org, members)
  const departmentIds = new Set(members.map(m => m.departmentId))
  const positionIds = new Set(members.map(m => m.positionId))
  return org.courses.flatMap(course => {
    const cells = groupCells.filter(c => c.courseId === course.id)
    if (cells.length === 0) return []
    const counts = countStatuses(cells)
    return [
      {
        code: course.code,
        name: course.name,
        requiredBy: requirementViews(course).filter(
          v =>
            v.scope === 'ALL' ||
            (v.scope === 'DEPARTMENT' && departmentIds.has(v.targetId)) ||
            (v.scope === 'POSITION' && positionIds.has(v.targetId))
        ),
        counts,
        rate: complianceRate(counts),
      },
    ]
  })
}

function departmentSummary(org: Org, department: { id: string; name: string }): DepartmentSummary {
  const members = org.people.filter(p => p.departmentId === department.id)
  return {
    ...department,
    ...summarise(org, members),
    head: headOf(org, members),
    positions: tally(members, m => m.position),
  }
}

function positionSummary(org: Org, position: { id: string; name: string }): PositionSummary {
  const members = org.people.filter(p => p.positionId === position.id)
  return { ...position, ...summarise(org, members), departments: tally(members, m => m.department) }
}

export async function listDepartmentSummaries(
  options?: RepoOptions & { now?: Date }
): Promise<DepartmentSummary[]> {
  const [org, departments] = await Promise.all([
    loadOrg(options),
    dbOf(options).department.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return departments.map(d => departmentSummary(org, d))
}

export async function getDepartment(
  id: string,
  options?: RepoOptions & { now?: Date }
): Promise<DepartmentDetail | null> {
  const [org, department] = await Promise.all([
    loadOrg(options),
    dbOf(options).department.findUnique({ where: { id }, select: { id: true, name: true } }),
  ])
  if (!department) return null
  const members = org.people.filter(p => p.departmentId === id)
  return { ...departmentSummary(org, department), courses: coursesOf(org, members) }
}

export async function listPositionSummaries(
  options?: RepoOptions & { now?: Date }
): Promise<PositionSummary[]> {
  const [org, positions] = await Promise.all([
    loadOrg(options),
    dbOf(options).position.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  return positions.map(p => positionSummary(org, p))
}

export async function getPosition(
  id: string,
  options?: RepoOptions & { now?: Date }
): Promise<PositionDetail | null> {
  const [org, position] = await Promise.all([
    loadOrg(options),
    dbOf(options).position.findUnique({ where: { id }, select: { id: true, name: true } }),
  ])
  if (!position) return null
  const members = org.people.filter(p => p.positionId === id)
  return { ...positionSummary(org, position), courses: coursesOf(org, members) }
}
