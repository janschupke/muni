import {
  type ComplianceCell,
  type ComplianceCounts,
  complianceRate,
  countStatuses,
} from '@muni/domain/compliance'
import type { Capability, SessionStatus } from '@muni/domain/enums'
import type { SessionNeeds } from '@muni/domain/rooms'
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
import { needsOf, needsSelect } from './session-fit'
import { isUpcoming, sessionInclude, toSessionItem, upcomingSessionWhere } from './sessions'

/** A course's effective session needs as its pages show them. */
const sessionNeedsOf = (course: Parameters<typeof needsOf>[0]) => {
  const needs = needsOf(course)
  return {
    minutes: needs.sessionMinutes,
    groupSize: needs.groupSize,
    onlineAllowed: needs.onlineAllowed,
    capabilities: [...needs.capabilities],
  }
}

export type { RequirementView } from './audience'

export interface CourseListItem {
  /** Internal id (archiving acts on it). */
  id: string
  code: string
  name: string
  validityMonths: number | null
  requirements: RequirementView[]
  completionCount: number
  upcomingSessions: number
  counts: ComplianceCounts
  rate: number
  /** What one session needs, as the planner takes it (null where not known). */
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
      id: course.id,
      code: course.code,
      name: course.name,
      validityMonths: course.validityMonths,
      requirements: requirementViews(course),
      completionCount: course._count.completions,
      upcomingSessions: course.sessions.length,
      counts,
      rate: complianceRate(counts),
      sessionNeeds: sessionNeedsOf(course),
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

/** A named booking on a session; an archived person's department and position stay hidden. */
export interface SessionBooking {
  person: PersonRef
  department: string | null
  position: string | null
  /** Booked through the advisor (or the planner), or by hand. */
  source: 'ADVISOR' | 'MANUAL'
  bookedAt: string
}

export interface SessionListItem {
  /** Internal id (archiving acts on it). */
  id: string
  externalId: string
  courseId: string
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
  /** Seats the room has (null: online), and its equipment. */
  roomSeats: number | null
  roomCapabilities: Capability[]
  /** What a session of the course needs (its length, group size, online, equipment). */
  needs: SessionNeeds & { sessionMinutes: number | null }
  /** Named bookings (assignments), oldest first; archived people anonymised. */
  assigned: PersonRef[]
  /** The same bookings with who each person is and how they were booked. */
  bookings: SessionBooking[]
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
    id: course.id,
    code: course.code,
    name: course.name,
    validityMonths: course.validityMonths,
    requirements: requirementViews(course),
    completionCount: course._count.completions,
    upcomingSessions: upcoming.length,
    counts,
    rate: complianceRate(counts),
    sessionNeeds: sessionNeedsOf(course),
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
      requiredForAll: true,
      sessionMinutes: true,
      groupSize: true,
      onlineAllowed: true,
      sessionMinutesOverride: true,
      groupSizeOverride: true,
      onlineAllowedOverride: true,
      capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
      // Active ones only: an archived department's requirement is dropped on the next save.
      departmentRequirements: { where: { department: ACTIVE }, select: { departmentId: true } },
      positionRequirements: { where: { position: ACTIVE }, select: { positionId: true } },
    },
  })
  if (!course) return null
  const { departmentRequirements, positionRequirements, capabilities, ...rest } = course
  return {
    code: rest.code,
    name: rest.name,
    validityMonths: rest.validityMonths,
    requiredForAll: rest.requiredForAll,
    /** The app's overrides (what the form edits); null = the derived value applies. */
    sessionMinutes: rest.sessionMinutesOverride,
    groupSize: rest.groupSizeOverride,
    onlineAllowed: rest.onlineAllowedOverride,
    /** What the sessions import derived, shown next to the overrides. */
    derived: {
      sessionMinutes: rest.sessionMinutes,
      groupSize: rest.groupSize,
      onlineAllowed: rest.onlineAllowed,
    },
    capabilities: capabilities.map(c => c.capability),
    departmentIds: departmentRequirements.map(r => r.departmentId),
    positionIds: positionRequirements.map(r => r.positionId),
  }
}

export interface CourseOption {
  id: string
  code: string
  name: string
  validityMonths: number | null
  /** What a session of it needs (the session form checks rooms against it, and sizes it). */
  needs: SessionNeeds & { sessionMinutes: number | null }
}

/** Every active course, for pickers. */
export async function listCourseOptions(options?: RepoOptions): Promise<CourseOption[]> {
  const courses = await dbOf(options).course.findMany({
    where: ACTIVE,
    select: { id: true, code: true, name: true, validityMonths: true, ...needsSelect },
    orderBy: { code: 'asc' },
  })
  return courses.map(c => ({
    id: c.id,
    code: c.code,
    name: c.name,
    validityMonths: c.validityMonths,
    needs: needsOf(c),
  }))
}
