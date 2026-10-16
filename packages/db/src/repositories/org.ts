import {
  type ComplianceCell,
  type ComplianceCounts,
  complianceRate,
  countStatuses,
} from '@muni/domain/compliance'
import type { EmploymentStatus } from '@muni/domain/enums'

import { ACTIVE, type PersonRef, toPersonRef } from './archive'
import {
  audienceInclude,
  mandatoryCourse,
  type RequirementView,
  requirementViews,
} from './audience'
import { dbOf, loadCompliance, type RepoOptions } from './context'
import { compareNames, sortEmployees } from './employee-sort'
import { type EmployeeListItem, employeeRecord } from './employees'
import { loadNextBookings } from './requirements'
import { upcomingSessionWhere } from './sessions'

// Departments and positions as the register sees them: who is in them, who leads them,
// what they must hold and how much of it they hold. Active people count toward compliance;
// people on parental leave are listed but not counted, people who left are ignored.

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
  /** Its people (active and on leave), each with their record: most urgent first, then by name. */
  members: EmployeeListItem[]
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

interface Member {
  id: string
  externalId: string
  firstName: string
  lastName: string
  archivedAt: Date | null
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
  const [compliance, people, bookings, courses, nextBookings] = await Promise.all([
    loadCompliance(options),
    db.employee.findMany({
      where: { ...ACTIVE, status: { not: 'TERMINATED' } },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        archivedAt: true,
        status: true,
        managerId: true,
        departmentId: true,
        positionId: true,
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    }),
    db.sessionAssignment.findMany({
      where: { session: upcomingSessionWhere(now), employee: ACTIVE },
      select: { employeeId: true },
    }),
    db.course.findMany({
      where: { ...mandatoryCourse, ...ACTIVE },
      select: { id: true, code: true, name: true, requiredForAll: true, ...audienceInclude },
      orderBy: { code: 'asc' },
    }),
    loadNextBookings(db, now),
  ])
  const byId = new Map(people.map(p => [p.id, p]))
  return {
    people,
    byId,
    cells: compliance.cells,
    cellsByEmployee: Map.groupBy(compliance.cells, c => c.employeeId),
    bookings,
    courses,
    context: {
      courses: new Map(courses.map(c => [c.id, c])),
      asOf: compliance.options.asOf,
      bookings: nextBookings,
    },
  }
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
  const records = members.map(m =>
    employeeRecord(m, org.cellsByEmployee.get(m.id) ?? [], org.context)
  )
  sortEmployees(records, 'name', false)
  sortEmployees(records, 'compliance', false)
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
    members: records,
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

interface Reporting {
  id: string
  managerId: string | null
}

/**
 * Who leads a group: the member with the most other members anywhere beneath them in the
 * reporting chain, so a head over two team leads outranks either lead. Ties go by name.
 * When no member manages another, the person most members report to (from outside).
 */
export function headOf<P extends Reporting & { firstName: string; lastName: string }>(
  members: readonly P[],
  everyone: ReadonlyMap<string, P>
): P | null {
  const inGroup = new Set(members.map(m => m.id))
  const beneath = new Map<string, number>()
  const direct = new Map<string, number>()
  for (const m of members) {
    if (m.managerId) direct.set(m.managerId, (direct.get(m.managerId) ?? 0) + 1)
    const seen = new Set([m.id])
    for (let up = m.managerId; up && !seen.has(up); up = everyone.get(up)?.managerId ?? null) {
      seen.add(up)
      if (inGroup.has(up)) beneath.set(up, (beneath.get(up) ?? 0) + 1)
    }
  }
  const ranked = [...(beneath.size > 0 ? beneath : direct)]
    .map(([id, count]) => ({ person: everyone.get(id), count }))
    .filter((r): r is { person: P; count: number } => r.person !== undefined)
    .sort((a, b) => b.count - a.count || compareNames(a.person, b.person))
  return ranked[0]?.person ?? null
}

function headRef(org: Org, members: Member[]): PersonRef | null {
  const head = headOf(members, org.byId)
  return head ? toPersonRef(head) : null
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
    head: headRef(org, members),
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
      where: ACTIVE,
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
    dbOf(options).department.findFirst({
      where: { id, ...ACTIVE },
      select: { id: true, name: true },
    }),
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
    dbOf(options).position.findMany({
      where: ACTIVE,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return positions.map(p => positionSummary(org, p))
}

export async function getPosition(
  id: string,
  options?: RepoOptions & { now?: Date }
): Promise<PositionDetail | null> {
  const [org, position] = await Promise.all([
    loadOrg(options),
    dbOf(options).position.findFirst({
      where: { id, ...ACTIVE },
      select: { id: true, name: true },
    }),
  ])
  if (!position) return null
  const members = org.people.filter(p => p.positionId === id)
  return { ...positionSummary(org, position), courses: coursesOf(org, members) }
}
