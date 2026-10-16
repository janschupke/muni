import {
  type ComplianceCell,
  type ComplianceCounts,
  complianceRate,
  countStatuses,
} from '@muni/domain/compliance'
import type { Capability, SessionStatus } from '@muni/domain/enums'
import type { RoomRef } from '@muni/domain/rooms'
import { type IsoDate, isoDateFromUtc } from '@muni/utils/dates'

import { ACTIVE, type PersonRef, personSelect, toPersonRef } from './archive'
import { audienceInclude, type RequirementView, requirementViews } from './audience'
import {
  type ComplianceSnapshot,
  countedCells,
  dbOf,
  loadCompliance,
  type RepoOptions,
} from './context'
import { isUpcoming, sessionInclude, toSessionItem, upcomingSessionWhere } from './sessions'

export type { RequirementView } from './audience'

export interface CourseListItem {
  code: string
  name: string
  validityMonths: number | null
  requirements: RequirementView[]
  completionCount: number
  upcomingSessions: number
  counts: ComplianceCounts
  rate: number
  /** What one session needs (null where not set). */
  sessionNeeds: {
    minutes: number | null
    groupSize: number | null
    onlineAllowed: boolean
    capabilities: Capability[]
  }
  /** Planned sessions still ahead, soonest first. */
  upcoming: SessionListItem[]
  /** Per department where the course applies to someone active. */
  byDepartment: { id: string; name: string; counts: ComplianceCounts; rate: number }[]
}

export async function listCourses(options?: RepoOptions): Promise<CourseListItem[]> {
  const db = dbOf(options)
  const now = new Date()
  const [courses, compliance, departments] = await Promise.all([
    db.course.findMany({
      where: ACTIVE,
      include: {
        ...audienceInclude,
        capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
        sessions: {
          where: upcomingSessionWhere(now),
          include: sessionInclude,
          orderBy: { startsAt: 'asc' },
        },
        _count: { select: { completions: { where: ACTIVE } } },
      },
      orderBy: { code: 'asc' },
    }),
    loadCompliance(options),
    db.department.findMany({
      where: ACTIVE,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  const cellsByCourse = Map.groupBy(countedCells(compliance), c => c.courseId)
  return courses.map(course => {
    const cells = cellsByCourse.get(course.id) ?? []
    const counts = countStatuses(cells)
    return {
      code: course.code,
      name: course.name,
      validityMonths: course.validityMonths,
      requirements: requirementViews(course),
      completionCount: course._count.completions,
      upcomingSessions: course.sessions.length,
      counts,
      rate: complianceRate(counts),
      sessionNeeds: {
        minutes: course.sessionMinutes,
        groupSize: course.groupSize,
        onlineAllowed: course.onlineAllowed,
        capabilities: course.capabilities.map(c => c.capability),
      },
      upcoming: course.sessions.map(toSessionItem),
      byDepartment: byDepartment(cells, compliance, departments),
    }
  })
}

/** A course's counted cells per department; departments it does not apply to drop. */
function byDepartment(
  cells: ComplianceCell[],
  compliance: ComplianceSnapshot,
  departments: { id: string; name: string }[]
): CourseListItem['byDepartment'] {
  const departmentOf = new Map(compliance.employees.map(e => [e.id, e.departmentId]))
  const grouped = Map.groupBy(cells, c => departmentOf.get(c.employeeId))
  return departments.flatMap(d => {
    const own = grouped.get(d.id)
    if (!own) return []
    const counts = countStatuses(own)
    return [{ ...d, counts, rate: complianceRate(counts) }]
  })
}

export interface SessionListItem {
  externalId: string
  courseCode: string
  courseName: string
  /** The course is archived (a past session of it): shown muted, not linked. */
  courseArchived: boolean
  startsAt: string
  endsAt: string
  room: RoomRef
  capacity: number
  /** Seats booked without a name (from the export). */
  unnamedBookings: number
  /** Named bookings (assignments), oldest first; archived people anonymised. */
  assigned: PersonRef[]
  /** Derived: unnamedBookings + assigned.length. */
  bookedCount: number
  pricePerPerson: number | null
  status: SessionStatus
}

export interface CourseDetail extends CourseListItem {
  sessions: SessionListItem[]
  recentCompletions: {
    externalId: string
    employee: PersonRef
    completedOn: IsoDate
    validUntil: IsoDate | null
  }[]
}

export async function getCourse(code: string, options?: RepoOptions): Promise<CourseDetail | null> {
  const db = dbOf(options)
  const course = await db.course.findFirst({
    where: { code, ...ACTIVE },
    include: {
      ...audienceInclude,
      capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
      sessions: { where: ACTIVE, orderBy: { startsAt: 'asc' }, include: sessionInclude },
      completions: {
        where: ACTIVE,
        orderBy: { completedOn: 'desc' },
        take: 20,
        include: { employee: { select: personSelect } },
      },
      _count: { select: { completions: { where: ACTIVE } } },
    },
  })
  if (!course) return null
  const [compliance, departments] = await Promise.all([
    loadCompliance(options),
    db.department.findMany({
      where: ACTIVE,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  const cells = countedCells(compliance).filter(c => c.courseId === course.id)
  const counts = countStatuses(cells)
  const now = new Date()
  const upcoming = course.sessions.filter(s => isUpcoming(s, now))
  return {
    code: course.code,
    name: course.name,
    validityMonths: course.validityMonths,
    requirements: requirementViews(course),
    completionCount: course._count.completions,
    upcomingSessions: upcoming.length,
    counts,
    rate: complianceRate(counts),
    sessionNeeds: {
      minutes: course.sessionMinutes,
      groupSize: course.groupSize,
      onlineAllowed: course.onlineAllowed,
      capabilities: course.capabilities.map(c => c.capability),
    },
    upcoming: upcoming.map(toSessionItem),
    byDepartment: byDepartment(cells, compliance, departments),
    sessions: course.sessions.map(toSessionItem),
    recentCompletions: course.completions.map(c => ({
      externalId: c.externalId,
      employee: toPersonRef(c.employee),
      completedOn: isoDateFromUtc(c.completedOn),
      validUntil: c.validUntil ? isoDateFromUtc(c.validUntil) : null,
    })),
  }
}

export async function getCourseForEdit(code: string, options?: RepoOptions) {
  const course = await dbOf(options).course.findFirst({
    where: { code, ...ACTIVE },
    select: {
      code: true,
      name: true,
      validityMonths: true,
      sessionMinutes: true,
      groupSize: true,
      onlineAllowed: true,
      capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
    },
  })
  return course && { ...course, capabilities: course.capabilities.map(c => c.capability) }
}

export async function listCourseOptions(options?: RepoOptions) {
  return dbOf(options).course.findMany({
    where: ACTIVE,
    select: { code: true, name: true, validityMonths: true },
    orderBy: { code: 'asc' },
  })
}
