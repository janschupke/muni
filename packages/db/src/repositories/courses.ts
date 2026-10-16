import { complianceRate, countStatuses, type ComplianceCounts } from '@muni/domain/compliance'
import type { SessionStatus } from '@muni/domain/enums'
import type { RoomRef } from '@muni/domain/rooms'
import { isoDateFromUtc, type IsoDate } from '@muni/utils/dates'

import { audienceInclude, requirementViews, type RequirementView } from './audience'
import { dbOf, loadCompliance, type RepoOptions } from './context'
import { sessionInclude, toSessionItem } from './sessions'

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
}

export async function listCourses(options?: RepoOptions): Promise<CourseListItem[]> {
  const db = dbOf(options)
  const now = new Date()
  const [courses, compliance] = await Promise.all([
    db.course.findMany({
      include: {
        ...audienceInclude,
        _count: {
          select: {
            completions: true,
            sessions: { where: { startsAt: { gte: now }, status: 'PLANNED' } },
          },
        },
      },
      orderBy: { code: 'asc' },
    }),
    loadCompliance(options),
  ])
  const cellsByCourse = Map.groupBy(compliance.cells, c => c.courseId)
  return courses.map(course => {
    const counts = countStatuses(cellsByCourse.get(course.id) ?? [])
    return {
      code: course.code,
      name: course.name,
      validityMonths: course.validityMonths,
      requirements: requirementViews(course),
      completionCount: course._count.completions,
      upcomingSessions: course._count.sessions,
      counts,
      rate: complianceRate(counts),
    }
  })
}

export interface SessionListItem {
  externalId: string
  courseCode: string
  courseName: string
  startsAt: string
  endsAt: string
  room: RoomRef
  capacity: number
  /** Seats booked without a name (from the export). */
  unnamedBookings: number
  /** Named bookings (assignments), oldest first. */
  assigned: { externalId: string; name: string }[]
  /** Derived: unnamedBookings + assigned.length. */
  bookedCount: number
  pricePerPerson: number | null
  status: SessionStatus
}

export interface CourseDetail extends CourseListItem {
  sessions: SessionListItem[]
  recentCompletions: {
    externalId: string
    employeeExternalId: string
    employeeName: string
    completedOn: IsoDate
    validUntil: IsoDate | null
  }[]
}

export async function getCourse(code: string, options?: RepoOptions): Promise<CourseDetail | null> {
  const db = dbOf(options)
  const course = await db.course.findUnique({
    where: { code },
    include: {
      ...audienceInclude,
      sessions: { orderBy: { startsAt: 'asc' }, include: sessionInclude },
      completions: {
        orderBy: { completedOn: 'desc' },
        take: 20,
        include: { employee: { select: { externalId: true, firstName: true, lastName: true } } },
      },
      _count: { select: { completions: true } },
    },
  })
  if (!course) return null
  const compliance = await loadCompliance(options)
  const counts = countStatuses(compliance.cells.filter(c => c.courseId === course.id))
  const now = Date.now()
  return {
    code: course.code,
    name: course.name,
    validityMonths: course.validityMonths,
    requirements: requirementViews(course),
    completionCount: course._count.completions,
    upcomingSessions: course.sessions.filter(
      s => s.startsAt.getTime() >= now && s.status === 'PLANNED'
    ).length,
    counts,
    rate: complianceRate(counts),
    sessions: course.sessions.map(toSessionItem),
    recentCompletions: course.completions.map(c => ({
      externalId: c.externalId,
      employeeExternalId: c.employee.externalId,
      employeeName: `${c.employee.lastName} ${c.employee.firstName}`,
      completedOn: isoDateFromUtc(c.completedOn),
      validUntil: c.validUntil ? isoDateFromUtc(c.validUntil) : null,
    })),
  }
}

export async function getCourseForEdit(code: string, options?: RepoOptions) {
  const course = await dbOf(options).course.findUnique({
    where: { code },
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
    select: { code: true, name: true, validityMonths: true },
    orderBy: { code: 'asc' },
  })
}
