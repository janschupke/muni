import { complianceRate, countStatuses, type ComplianceCounts } from '@muni/domain/compliance'
import type { RequirementScope, SessionStatus } from '@muni/domain/enums'
import { isoDateFromUtc, type IsoDate } from '@muni/utils/dates'

import { dbOf, loadCompliance, type RepoOptions } from './context'
import { sessionInclude, toSessionItem } from './sessions'

export interface RequirementView {
  scope: RequirementScope
  /** Department or position name; null for ALL. */
  target: string | null
}

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

const requirementInclude = {
  requirements: {
    select: {
      scope: true,
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  },
} as const

function toRequirementViews(
  requirements: {
    scope: RequirementScope
    department: { name: string } | null
    position: { name: string } | null
  }[]
): RequirementView[] {
  return requirements
    .map(r => ({ scope: r.scope, target: r.department?.name ?? r.position?.name ?? null }))
    .sort(
      (a, b) =>
        a.scope.localeCompare(b.scope) || (a.target ?? '').localeCompare(b.target ?? '', 'cs')
    )
}

export async function listCourses(options?: RepoOptions): Promise<CourseListItem[]> {
  const db = dbOf(options)
  const now = new Date()
  const [courses, compliance] = await Promise.all([
    db.course.findMany({
      include: {
        ...requirementInclude,
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
      requirements: toRequirementViews(course.requirements),
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
  location: string
  isOnline: boolean
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
      ...requirementInclude,
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
    requirements: toRequirementViews(course.requirements),
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
  return dbOf(options).course.findUnique({
    where: { code },
    select: { code: true, name: true, validityMonths: true },
  })
}

export async function listCourseOptions(options?: RepoOptions) {
  return dbOf(options).course.findMany({
    select: { code: true, name: true, validityMonths: true },
    orderBy: { code: 'asc' },
  })
}
