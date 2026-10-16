import type { ComplianceRequirement } from '@muni/domain/compliance'
import type { RequirementScope } from '@muni/domain/enums'

/**
 * Who must hold a course is stored normalised (a flag for everyone, one table per department
 * and per position). Compliance evaluates rules; these helpers turn the rows into rules and
 * into what the pages show.
 */

export interface RequirementView {
  scope: RequirementScope
  /** Department or position name; null for ALL. */
  target: string | null
  /** Department or position id; null for ALL. */
  targetId: string | null
  /** The department or position is archived: shown muted, not linked. */
  archived: boolean
}

/** Include this on a course to read its audience (with its scalar `requiredForAll`). */
export const audienceInclude = {
  departmentRequirements: {
    select: { department: { select: { id: true, name: true, archivedAt: true } } },
  },
  positionRequirements: {
    select: { position: { select: { id: true, name: true, archivedAt: true } } },
  },
} as const

/** Select this on a course to read its audience. */
export const audienceSelect = { requiredForAll: true, ...audienceInclude } as const

export interface AudienceRow {
  id: string
  requiredForAll: boolean
  departmentRequirements: { department: { id: string; name: string; archivedAt: Date | null } }[]
  positionRequirements: { position: { id: string; name: string; archivedAt: Date | null } }[]
}

/** Courses someone must hold (the rest are optional). */
export const mandatoryCourse = {
  OR: [
    { requiredForAll: true },
    { departmentRequirements: { some: {} } },
    { positionRequirements: { some: {} } },
  ],
}

export function rulesOf(course: AudienceRow): ComplianceRequirement[] {
  return [
    ...(course.requiredForAll
      ? [{ courseId: course.id, scope: 'ALL' as const, departmentId: null, positionId: null }]
      : []),
    ...course.departmentRequirements.map(r => ({
      courseId: course.id,
      scope: 'DEPARTMENT' as const,
      departmentId: r.department.id,
      positionId: null,
    })),
    ...course.positionRequirements.map(r => ({
      courseId: course.id,
      scope: 'POSITION' as const,
      departmentId: null,
      positionId: r.position.id,
    })),
  ]
}

export function requirementViews(course: AudienceRow): RequirementView[] {
  const views: RequirementView[] = [
    ...(course.requiredForAll
      ? [{ scope: 'ALL' as const, target: null, targetId: null, archived: false }]
      : []),
    ...course.departmentRequirements.map(r => ({
      scope: 'DEPARTMENT' as const,
      target: r.department.name,
      targetId: r.department.id,
      archived: r.department.archivedAt !== null,
    })),
    ...course.positionRequirements.map(r => ({
      scope: 'POSITION' as const,
      target: r.position.name,
      targetId: r.position.id,
      archived: r.position.archivedAt !== null,
    })),
  ]
  return views.sort(
    (a, b) => a.scope.localeCompare(b.scope) || (a.target ?? '').localeCompare(b.target ?? '', 'cs')
  )
}
