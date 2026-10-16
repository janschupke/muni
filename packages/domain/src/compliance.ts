import { diffInDays, type IsoDate } from '@muni/utils/dates'

import type { ComplianceStatus, EmploymentStatus, RequirementScope } from './enums'

export interface ComplianceEmployee {
  id: string
  departmentId: string | null
  positionId: string | null
  status: EmploymentStatus
}

export interface ComplianceRequirement {
  courseId: string
  scope: RequirementScope
  departmentId: string | null
  positionId: string | null
}

export interface ComplianceCompletion {
  employeeId: string
  courseId: string
  completedOn: IsoDate
  /** null = never expires */
  validUntil: IsoDate | null
}

export interface ComplianceCell {
  employeeId: string
  courseId: string
  status: ComplianceStatus
  /** The completion the status was derived from, if any. */
  basis: ComplianceCompletion | null
}

export interface ComplianceOptions {
  asOf: IsoDate
  /** A valid completion that expires within this many days counts as EXPIRING. */
  expiringWithinDays: number
}

export const DEFAULT_EXPIRING_DAYS = 30

export function appliesTo(
  requirement: ComplianceRequirement,
  employee: ComplianceEmployee
): boolean {
  switch (requirement.scope) {
    case 'ALL':
      return true
    case 'DEPARTMENT':
      return requirement.departmentId !== null && requirement.departmentId === employee.departmentId
    case 'POSITION':
      return requirement.positionId !== null && requirement.positionId === employee.positionId
  }
}

/** Course ids the employee must hold, given every requirement rule. */
export function requiredCourseIds(
  employee: ComplianceEmployee,
  requirements: readonly ComplianceRequirement[]
): Set<string> {
  const ids = new Set<string>()
  for (const requirement of requirements) {
    if (appliesTo(requirement, employee)) ids.add(requirement.courseId)
  }
  return ids
}

/**
 * Picks the completion that best covers the employee: a never-expiring one wins,
 * otherwise the one that is valid the longest. Future-dated completions don't count.
 */
export function bestCompletion(
  completions: readonly ComplianceCompletion[],
  asOf: IsoDate
): ComplianceCompletion | null {
  let best: ComplianceCompletion | null = null
  for (const completion of completions) {
    if (completion.completedOn > asOf) continue
    if (best === null) {
      best = completion
    } else if (completion.validUntil === null) {
      if (best.validUntil !== null || completion.completedOn > best.completedOn) best = completion
    } else if (best.validUntil !== null && completion.validUntil > best.validUntil) {
      best = completion
    }
  }
  return best
}

export function statusOf(
  completion: ComplianceCompletion | null,
  { asOf, expiringWithinDays }: ComplianceOptions
): ComplianceStatus {
  if (completion === null) return 'MISSING'
  if (completion.validUntil === null) return 'VALID'
  if (completion.validUntil < asOf) return 'EXPIRED'
  return diffInDays(asOf, completion.validUntil) <= expiringWithinDays ? 'EXPIRING' : 'VALID'
}

/** One cell per (employee, required course). */
export function computeCompliance(
  employees: readonly ComplianceEmployee[],
  requirements: readonly ComplianceRequirement[],
  completions: readonly ComplianceCompletion[],
  options: ComplianceOptions
): ComplianceCell[] {
  const byPair = new Map<string, ComplianceCompletion[]>()
  for (const completion of completions) {
    const key = `${completion.employeeId}|${completion.courseId}`
    const list = byPair.get(key)
    if (list) list.push(completion)
    else byPair.set(key, [completion])
  }

  const cells: ComplianceCell[] = []
  for (const employee of employees) {
    for (const courseId of requiredCourseIds(employee, requirements)) {
      const basis = bestCompletion(byPair.get(`${employee.id}|${courseId}`) ?? [], options.asOf)
      cells.push({ employeeId: employee.id, courseId, status: statusOf(basis, options), basis })
    }
  }
  return cells
}

export type ComplianceCounts = Record<ComplianceStatus, number> & { total: number }

export function countStatuses(cells: readonly ComplianceCell[]): ComplianceCounts {
  const counts: ComplianceCounts = { VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0, total: 0 }
  for (const cell of cells) {
    counts[cell.status] += 1
    counts.total += 1
  }
  return counts
}

/** Share of required trainings currently held (VALID or EXPIRING). 1 when nothing is required. */
export function complianceRate(counts: ComplianceCounts): number {
  if (counts.total === 0) return 1
  return (counts.VALID + counts.EXPIRING) / counts.total
}

/** Worst status wins: MISSING > EXPIRED > EXPIRING > VALID. */
export function worstStatus(statuses: Iterable<ComplianceStatus>): ComplianceStatus | null {
  const rank: Record<ComplianceStatus, number> = { VALID: 0, EXPIRING: 1, EXPIRED: 2, MISSING: 3 }
  let worst: ComplianceStatus | null = null
  for (const status of statuses) {
    if (worst === null || rank[status] > rank[worst]) worst = status
  }
  return worst
}
